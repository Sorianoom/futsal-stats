"""Fantasy: el equipo de otro participante, visto desde la clasificación.

Se ve su plantilla (lo mismo que ya enseñan las cláusulas) y la alineación de la última jornada
bloqueada con sus puntos; la de la próxima no, para que nadie copie una alineación aún abierta.
Las plantillas privadas (cuentas del Fantasy del cuerpo técnico) solo enseñan el nombre.
"""

import random
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_market_repo as market_repo
from app.db import fantasy_money_repo as money
from app.db import fantasy_repo, photos_repo
from app.db.models import FantasyLeague, User
from app.domain.fantasy.access import plays_fantasy
from app.domain.fantasy.calendar import Round, is_locked
from app.domain.fantasy.standings import display_name
from app.schemas.fantasy import LastRoundOut, ParticipantTeamOut
from app.services.fantasy import enter, watch
from app.services.fantasy_results import recent_points, rounds_of
from app.services.fantasy_scoring import participant_round
from app.services.fantasy_team import last_scored, squad_out


class ParticipantNotFoundError(Exception):
    """No hay liga o el participante no es de la liga activa."""


async def _league_and_viewer(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> tuple[FantasyLeague, uuid.UUID | None]:
    if not plays_fantasy(user.role):
        league = await watch(db, now, rng)
        if league is None:
            raise ParticipantNotFoundError
        return league, None
    membership = await enter(db, user, now, rng)
    if membership is None:
        raise ParticipantNotFoundError
    return membership.league, membership.participant.id


def _last_locked(rounds: list[Round], now: datetime) -> Round | None:
    locked = [r for r in rounds if is_locked(r, now)]
    return max(locked, key=lambda r: (r.held_on, r.match_id)) if locked else None


async def participant_team(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, participant_id: uuid.UUID
) -> ParticipantTeamOut:
    league, viewer_id = await _league_and_viewer(db, user, now, rng)
    target = next(
        (
            p
            for p in await fantasy_repo.list_participants(db, league.id)
            if p.participant.id == participant_id
        ),
        None,
    )
    if target is None:
        raise ParticipantNotFoundError
    name = display_name(target.user_name, target.player_name, target.email)
    private = participant_id in await fantasy_repo.private_participant_ids(db, league.id)
    if private and participant_id != viewer_id:
        return ParticipantTeamOut(
            participant_id=participant_id,
            display_name=name,
            private_squad=True,
            team_value=None,
            squad=[],
            last_round=None,
            last_lineup=None,
        )
    copies = await fantasy_repo.squad(db, participant_id)
    player_ids = [c.player.id for c in copies]
    rounds = await rounds_of(db, league)
    scored = await last_scored(db, rounds, now)
    squad = squad_out(
        copies,
        await money.player_values(db, league.id),
        await money.last_value_changes(db, league.id),
        await market_repo.open_listings_of_copies(db, [c.copy.id for c in copies]),
        scored[1] if scored else None,
        await photos_repo.photo_urls(db, player_ids),
        await recent_points(db, rounds, now, player_ids),
    )
    locked = _last_locked(rounds, now)
    return ParticipantTeamOut(
        participant_id=participant_id,
        display_name=name,
        private_squad=private,
        team_value=sum(c.value for c in squad),
        squad=squad,
        last_round=(
            LastRoundOut(
                match_id=uuid.UUID(locked.match_id),
                opponent=locked.opponent,
                held_on=locked.held_on,
            )
            if locked
            else None
        ),
        last_lineup=(
            await participant_round(db, league, target.participant, locked, now) if locked else None
        ),
    )
