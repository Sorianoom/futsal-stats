"""Sincronización idempotente de eventos del partido en vivo (cola offline del iPad)."""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from fastapi import APIRouter
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, NowDep, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.db import match_repo, points_repo
from app.db.models import LineupEventRow, Match, MatchEvent, QuintetRatingRow
from app.domain.stints.goal_detail import GOAL_KINDS
from app.domain.sync import (
    Decision,
    IncomingEvent,
    LineupItem,
    SyncItem,
    Verdict,
    decide,
    decide_lineup_voids,
    decide_voids,
)
from app.schemas.match_sync import (
    EventIn,
    EventOut,
    GoalDetailIn,
    LineupEventIn,
    LineupEventOut,
    LineupPayload,
    LineupUndoPayload,
    PartStartedPayload,
    RatingIn,
    RatingsStatus,
    RejectedItem,
    SentOffPayload,
    StreamStatus,
    SubstitutedPayload,
    SyncRequest,
    SyncResult,
    SyncStatus,
)

router = APIRouter(prefix="/matches", tags=["sync"])


@dataclass
class Outcome:
    accepted: list[uuid.UUID] = field(default_factory=list)
    duplicates: list[uuid.UUID] = field(default_factory=list)
    rejected: list[RejectedItem] = field(default_factory=list)

    def reject(self, item_id: uuid.UUID, reason: str) -> None:
        self.rejected.append(RejectedItem(id=item_id, reason=reason))

    def record(self, decisions: Iterable[Decision]) -> None:
        for decision in decisions:
            item_id = uuid.UUID(decision.id)
            if decision.verdict is Verdict.DUPLICATE:
                self.duplicates.append(item_id)
            elif decision.verdict is Verdict.REJECTED:
                self.reject(item_id, decision.reason or "rejected")


async def _existing_match(db: SessionDep, match_id: uuid.UUID) -> Match:
    match = await points_repo.get_match(db, match_id)
    if match is None:
        raise ApiError(404, "not_found", "Partido no encontrado")
    return match


def _payload_player_ids(payload: LineupPayload) -> list[uuid.UUID]:
    if isinstance(payload, PartStartedPayload):
        return list(payload.starters)
    if isinstance(payload, SubstitutedPayload):
        return [payload.player_out, payload.player_in]
    if isinstance(payload, SentOffPayload):
        return [payload.player_id]
    return []


def _new_items[T: (EventIn, LineupEventIn, RatingIn)](
    decisions: Sequence[Decision], by_id: dict[str, T]
) -> list[T]:
    return [by_id[d.id] for d in decisions if d.verdict is Verdict.NEW]


def _voided_id(payload: LineupPayload) -> str | None:
    return str(payload.voids_event_id) if isinstance(payload, LineupUndoPayload) else None


async def _lineup_void_rejections(
    db: SessionDep, match_id: uuid.UUID, new: list[LineupEventIn]
) -> dict[str, str]:
    """Deshacer de alineación inválidos: solo se anula el último movimiento vigente."""
    if not any(isinstance(e.payload, LineupUndoPayload) for e in new):
        return {}
    stored = await match_repo.list_lineup_events(db, match_id)
    items = [LineupItem(str(r.id), r.seq, _stored_voids(r.payload), is_new=False) for r in stored]
    items.extend(LineupItem(str(e.id), e.seq, _voided_id(e.payload)) for e in new)
    return decide_lineup_voids(items)


def _stored_voids(payload: dict[str, object]) -> str | None:
    voids = payload.get("voids_event_id") if payload.get("type") == "undo" else None
    return str(voids) if voids is not None else None


async def _process_events(
    db: SessionDep, match_id: uuid.UUID, events: list[EventIn], outcome: Outcome
) -> list[MatchEvent]:
    by_id = {str(e.id): e for e in events}
    own, foreign = await match_repo.partition_ids(db, MatchEvent, match_id, [e.id for e in events])
    taken = await match_repo.taken_seqs(db, MatchEvent, match_id, [e.seq for e in events])
    decisions = decide([SyncItem(str(e.id), e.seq) for e in events], own, foreign, taken)
    outcome.record(decisions)

    new = _new_items(decisions, by_id)
    missing = await points_repo.find_missing_players(db, [e.player_id for e in new if e.player_id])
    valid = []
    for event in new:
        if event.player_id in missing:
            outcome.reject(event.id, "unknown_player")
        else:
            valid.append(event)

    targets = [e.voids_event_id for e in valid if e.voids_event_id]
    known = await match_repo.event_kinds(db, match_id, targets)
    voided = await match_repo.voided_event_ids(db, match_id)
    incoming = [
        IncomingEvent(str(e.id), e.kind, str(e.voids_event_id) if e.voids_event_id else None)
        for e in valid
    ]
    void_rejections = decide_voids(incoming, known, voided)

    rows = []
    for event in valid:
        if (reason := void_rejections.get(str(event.id))) is not None:
            outcome.reject(event.id, reason)
            continue
        outcome.accepted.append(event.id)
        rows.append(MatchEvent(match_id=match_id, **event.model_dump()))
    return rows


async def _process_lineup(
    db: SessionDep, match_id: uuid.UUID, events: list[LineupEventIn], outcome: Outcome
) -> list[LineupEventRow]:
    by_id = {str(e.id): e for e in events}
    own, foreign = await match_repo.partition_ids(
        db, LineupEventRow, match_id, [e.id for e in events]
    )
    taken = await match_repo.taken_seqs(db, LineupEventRow, match_id, [e.seq for e in events])
    decisions = decide([SyncItem(str(e.id), e.seq) for e in events], own, foreign, taken)
    outcome.record(decisions)

    new = _new_items(decisions, by_id)
    wanted = [pid for e in new for pid in _payload_player_ids(e.payload)]
    missing = await points_repo.find_missing_players(db, wanted)
    known = [e for e in new if not missing.intersection(_payload_player_ids(e.payload))]
    void_rejections = await _lineup_void_rejections(db, match_id, known)
    rows = []
    for event in new:
        if missing.intersection(_payload_player_ids(event.payload)):
            outcome.reject(event.id, "unknown_player")
            continue
        if (reason := void_rejections.get(str(event.id))) is not None:
            outcome.reject(event.id, reason)
            continue
        outcome.accepted.append(event.id)
        rows.append(
            LineupEventRow(
                id=event.id,
                match_id=match_id,
                seq=event.seq,
                kind=event.payload.type,
                payload=event.payload.model_dump(mode="json"),
            )
        )
    return rows


async def _process_ratings(
    db: SessionDep, match_id: uuid.UUID, ratings: list[RatingIn], outcome: Outcome
) -> list[QuintetRatingRow]:
    by_id = {str(r.id): r for r in ratings}
    own, foreign = await match_repo.partition_ids(
        db, QuintetRatingRow, match_id, [r.id for r in ratings]
    )
    decisions = decide([SyncItem(str(r.id)) for r in ratings], own, foreign, {})
    outcome.record(decisions)

    rows = []
    for rating in _new_items(decisions, by_id):
        outcome.accepted.append(rating.id)
        rows.append(QuintetRatingRow(match_id=match_id, **rating.model_dump()))
    return rows


def _starts_the_match(row: MatchEvent | LineupEventRow | QuintetRatingRow) -> bool:
    """El inicio de la 1ª parte: bloquea las alineaciones del Fantasy de esta jornada."""
    return (
        isinstance(row, LineupEventRow)
        and row.kind == "part_started"
        and row.payload.get("part") == 1
    )


@router.post("/{match_id}/sync", response_model=Envelope[SyncResult])
async def sync_match(
    match_id: uuid.UUID, payload: SyncRequest, db: SessionDep, _: CurrentUser, now: NowDep
) -> Envelope[SyncResult]:
    await _existing_match(db, match_id)
    outcome = Outcome()
    rows: list[MatchEvent | LineupEventRow | QuintetRatingRow] = [
        *await _process_events(db, match_id, payload.events, outcome),
        *await _process_lineup(db, match_id, payload.lineup_events, outcome),
        *await _process_ratings(db, match_id, payload.ratings, outcome),
    ]
    try:
        await match_repo.add_rows(db, rows)
        if any(_starts_the_match(r) for r in rows):
            await match_repo.mark_started(db, match_id, now)
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, "conflict", "Envío simultáneo; vuelve a intentarlo") from error
    await db.commit()
    return ok(
        SyncResult(
            accepted=outcome.accepted, duplicates=outcome.duplicates, rejected=outcome.rejected
        )
    )


@router.get("/{match_id}/events", response_model=Envelope[list[EventOut]])
async def list_events(
    match_id: uuid.UUID, db: SessionDep, _: CurrentUser
) -> Envelope[list[EventOut]]:
    await _existing_match(db, match_id)
    rows = await match_repo.list_events(db, match_id)
    return ok([EventOut.model_validate(r) for r in rows], Meta(total=len(rows)))


@router.get("/{match_id}/lineup-events", response_model=Envelope[list[LineupEventOut]])
async def list_lineup_events(
    match_id: uuid.UUID, db: SessionDep, _: CurrentUser
) -> Envelope[list[LineupEventOut]]:
    """Alineación en orden de `seq`, para reconstruir la pista tras recargar la pestaña."""
    await _existing_match(db, match_id)
    rows = await match_repo.list_lineup_events(db, match_id)
    return ok(
        [LineupEventOut(id=r.id, seq=r.seq, payload=r.payload) for r in rows],
        Meta(total=len(rows)),
    )


@router.get("/{match_id}/sync-status", response_model=Envelope[SyncStatus])
async def sync_status(match_id: uuid.UUID, db: SessionDep, _: CurrentUser) -> Envelope[SyncStatus]:
    await _existing_match(db, match_id)
    events = await match_repo.stream_status(db, MatchEvent, match_id)
    lineup = await match_repo.stream_status(db, LineupEventRow, match_id)
    return ok(
        SyncStatus(
            events=StreamStatus(count=events[0], last_seq=events[1]),
            lineup_events=StreamStatus(count=lineup[0], last_seq=lineup[1]),
            ratings=RatingsStatus(count=await match_repo.count_ratings(db, match_id)),
        )
    )


@router.put("/{match_id}/events/{event_id}/goal-detail", response_model=Envelope[EventOut])
async def set_goal_detail(
    match_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: GoalDetailIn,
    db: SessionDep,
    _: CurrentUser,
) -> Envelope[EventOut]:
    """Pone (o cambia) el tipo y el punto de un gol ya anotado: en el partido no siempre da
    tiempo. Es un dato del gol, no un evento: no cambia el marcador ni el registro."""
    await _existing_match(db, match_id)
    row = await db.get(MatchEvent, event_id)
    if row is None or row.match_id != match_id:
        raise ApiError(404, "not_found", "Gol no encontrado")
    if row.kind not in GOAL_KINDS:
        raise ApiError(422, "not_a_goal", "Solo un gol lleva tipo y punto de la pista")
    row.goal_tags = [tag.value for tag in payload.goal_tags] or None
    row.goal_x, row.goal_y = payload.goal_x, payload.goal_y
    await db.commit()
    return ok(EventOut.model_validate(row))
