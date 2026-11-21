"""Fantasy: mi equipo (participante, plantilla con valores y ventas, alineación y jornada)."""

import random
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_market_repo as market_repo
from app.db import fantasy_money_repo as money
from app.db import fantasy_repo, photos_repo
from app.db.fantasy_repo import SquadCopy
from app.db.models import FantasyListing, User
from app.domain.fantasy.access import has_private_squad, plays_fantasy
from app.domain.fantasy.calendar import Round, is_locked, lock_time, next_open_round
from app.domain.fantasy.clauses import protected_until
from app.domain.fantasy.lineup import Lineup, latest_lineup
from app.domain.fantasy.rules import FANTASY_TIMEZONE, SQUAD_LIMIT
from app.domain.fantasy.scoring import player_points
from app.domain.fantasy.standings import display_name
from app.schemas.fantasy import (
    LastRoundOut,
    LeagueOut,
    MyTeamOut,
    NextRoundOut,
    ParticipantOut,
    SpectatorOut,
    SquadCopyOut,
    SquadListingOut,
)
from app.services.fantasy import enter, lineup_out, watch
from app.services.fantasy_results import recent_points, rounds_of, scored_results


def owned_only(lineup: Lineup, owned: set[str]) -> Lineup:
    """La alineación con solo las copias que son suyas ahora (las vendidas quedan vacías)."""
    goalkeeper = lineup.goalkeeper if lineup.goalkeeper in owned else None
    return replace(
        lineup,
        goalkeeper=goalkeeper,
        field=tuple(c if c in owned else None for c in lineup.field),
        captain=lineup.captain if lineup.captain in owned else None,
    )


def _listing_out(listing: FantasyListing | None) -> SquadListingOut | None:
    if listing is None:
        return None
    return SquadListingOut(
        listing_id=listing.id,
        min_price=listing.min_price,
        closes_at=listing.closes_at.astimezone(FANTASY_TIMEZONE),
    )


def squad_out(
    copies: Sequence[SquadCopy],
    values: Mapping[str, int],
    changes: Mapping[str, int],
    listings: Mapping[uuid.UUID, FantasyListing],
    last_points: Mapping[str, int] | None,
    photos: Mapping[uuid.UUID, str],
    recent: Mapping[uuid.UUID, list[int]],
) -> list[SquadCopyOut]:
    return [
        SquadCopyOut(
            copy_id=c.copy.id,
            player_id=c.player.id,
            name=c.player.name,
            dorsal=c.player.dorsal,
            position=c.player.position,
            value=money.value_of(values, c.player.id),
            value_change=changes.get(str(c.player.id), 0),
            listing=_listing_out(listings.get(c.copy.id)),
            clause=c.copy.clause or 0,
            protected_until=protected_until(c.copy.acquired_at).astimezone(FANTASY_TIMEZONE),
            last_points=last_points.get(str(c.player.id), 0) if last_points is not None else None,
            photo_url=photos.get(c.player.id),
            recent_points=recent.get(c.player.id, []),
        )
        for c in copies
    ]


def _next_round_out(upcoming: Round | None) -> NextRoundOut | None:
    if upcoming is None:
        return None
    return NextRoundOut(
        match_id=uuid.UUID(upcoming.match_id),
        opponent=upcoming.opponent,
        held_on=upcoming.held_on,
        locks_at=lock_time(upcoming.held_on),
    )


async def last_scored(
    db: AsyncSession, rounds: Sequence[Round], now: datetime
) -> tuple[Round, dict[str, int]] | None:
    """La última jornada bloqueada que ya puntúa y los puntos de cada jugador en ella (sin
    capitán: son los del jugador). Una con el partido aún abierto se salta."""
    locked = sorted((r for r in rounds if is_locked(r, now)), key=lambda r: r.held_on, reverse=True)
    for round_ in locked:
        results = (await scored_results(db, [round_], now)).get(round_.match_id)
        if results is not None:
            return round_, {p: player_points(r.rating, r.goals) for p, r in results.items()}
    return None


async def my_team(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> MyTeamOut | SpectatorOut | None:
    """Mi participante, plantilla, alineación vigente y siguiente jornada; None sin liga. Una
    cuenta que solo mira recibe la liga sin equipo."""
    if not plays_fantasy(user.role):
        league = await watch(db, now, rng)
        if league is None:
            return None
        return SpectatorOut(league=LeagueOut(id=league.id, starts_on=league.starts_on))
    membership = await enter(db, user, now, rng)
    if membership is None:
        return None
    league, participant = membership.league, membership.participant
    copies = await fantasy_repo.squad(db, participant.id)
    values = await money.player_values(db, league.id)
    changes = await money.last_value_changes(db, league.id)
    listings = await market_repo.open_listings_of_copies(db, [c.copy.id for c in copies])
    rounds = await rounds_of(db, league)
    last = await last_scored(db, rounds, now)
    photos = await photos_repo.photo_urls(db, [c.player.id for c in copies])
    recent = await recent_points(db, rounds, now, [c.player.id for c in copies])
    squad = squad_out(copies, values, changes, listings, last[1] if last else None, photos, recent)
    history = await fantasy_repo.lineup_history(db, [participant.id])
    lineup = owned_only(
        latest_lineup(history.get(participant.id, [])), {str(c.copy.id) for c in copies}
    )
    info = await fantasy_repo.participant_info(db, participant)
    return MyTeamOut(
        league=LeagueOut(id=league.id, starts_on=league.starts_on),
        me=ParticipantOut(
            participant_id=participant.id,
            display_name=display_name(info.user_name, info.player_name, info.email),
            balance=participant.balance,
            squad_limit=SQUAD_LIMIT,
            team_value=sum(c.value for c in squad),
            private_squad=has_private_squad(user.role),
        ),
        squad=squad,
        lineup=lineup_out(lineup),
        next_round=_next_round_out(next_open_round(rounds, now)),
        last_round=(
            LastRoundOut(
                match_id=uuid.UUID(last[0].match_id),
                opponent=last[0].opponent,
                held_on=last[0].held_on,
            )
            if last
            else None
        ),
    )
