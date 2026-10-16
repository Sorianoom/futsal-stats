"""Decisiones puras de sincronización offline: nuevo, duplicado o rechazado. Sin BD."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.stints.events import EventKind


class Verdict(StrEnum):
    NEW = "new"
    DUPLICATE = "duplicate"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class SyncItem:
    id: str
    seq: int | None = None


@dataclass(frozen=True, slots=True)
class Decision:
    id: str
    verdict: Verdict
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class IncomingEvent:
    id: str
    kind: EventKind
    voids: str | None = None


def _sort_key(item: SyncItem) -> tuple[int, int]:
    return (0, item.seq) if item.seq is not None else (1, 0)


def decide(
    items: Sequence[SyncItem],
    own_ids: set[str],
    foreign_ids: set[str],
    taken_seqs: Mapping[int, str],
) -> tuple[Decision, ...]:
    """Clasifica cada elemento. Reenviar un lote ya guardado solo produce duplicados."""
    seen_ids = set(own_ids)
    used_seqs = dict(taken_seqs)
    decisions: list[Decision] = []
    for entry in sorted(items, key=_sort_key):
        if entry.id in seen_ids:
            decisions.append(Decision(entry.id, Verdict.DUPLICATE))
        elif entry.id in foreign_ids:
            decisions.append(Decision(entry.id, Verdict.REJECTED, "id_conflict"))
        elif entry.seq is not None and entry.seq in used_seqs:
            decisions.append(Decision(entry.id, Verdict.REJECTED, "seq_conflict"))
        else:
            seen_ids.add(entry.id)
            if entry.seq is not None:
                used_seqs[entry.seq] = entry.id
            decisions.append(Decision(entry.id, Verdict.NEW))
    return tuple(decisions)


def decide_voids(
    events: Sequence[IncomingEvent],
    known: Mapping[str, EventKind],
    voided: set[str],
) -> dict[str, str]:
    """Motivos de rechazo de los 'deshacer' del lote (id → motivo). Vacío si todo es válido."""
    kinds = dict(known)
    already_voided = set(voided)
    rejected: dict[str, str] = {}
    for event in events:
        if event.kind is EventKind.UNDO:
            reason = _void_problem(event, kinds, already_voided)
            if reason is not None:
                rejected[event.id] = reason
                continue
            if event.voids is not None:
                already_voided.add(event.voids)
        kinds[event.id] = event.kind
    return rejected


def _void_problem(
    event: IncomingEvent, kinds: Mapping[str, EventKind], voided: set[str]
) -> str | None:
    if event.voids is None or event.voids not in kinds:
        return "void_target_missing"
    if kinds[event.voids] is EventKind.UNDO:
        return "void_of_undo"
    if event.voids in voided:
        return "already_voided"
    return None
