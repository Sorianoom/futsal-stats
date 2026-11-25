"""Apoyo de los tests de API del Fantasy, paso 3: reloj, cliente y atajos de mercado."""

import random
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_now, get_rng
from app.config import get_settings
from app.db.models import FantasyCopy, FantasyListing, FantasyTransfer, Player
from app.db.session import get_session
from app.domain.fantasy.market import TransferKind
from app.main import create_app
from tests.integration.api.conftest import TEST_SETTINGS, MakePlayer

SEED = 20261114
# Liga creada el 10/10/2026 a las 12:00 de Madrid. El mercado de ese día cierra a las 00:00 del 11.
LEAGUE_DAY = datetime(2026, 10, 10, 10, 0, tzinfo=UTC)
FIRST_MARKET_CLOSES = datetime(2026, 10, 10, 22, 0, tzinfo=UTC)
NEXT_DAY = datetime(2026, 10, 11, 10, 0, tzinfo=UTC)
# Partido del 17/10 (el de `played_match`): mañana de ese día, inicio a las 18:00 y poco después.
MATCH_MORNING = datetime(2026, 10, 17, 8, 0, tzinfo=UTC)
KICKOFF = datetime(2026, 10, 17, 16, 0, tzinfo=UTC)
AFTER_KICKOFF = datetime(2026, 10, 17, 16, 30, tzinfo=UTC)


@dataclass
class Clock:
    now: datetime


async def fantasy_client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_now] = lambda: clock.now
    app.dependency_overrides[get_rng] = lambda: random.Random(SEED)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


async def field_players(make_player: MakePlayer, count: int = 8) -> list[Player]:
    return [await make_player(n) for n in range(1, count + 1)]


async def create_league(client: AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
    response = await client.post("/fantasy/league", headers=headers)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def get_data(client: AsyncClient, path: str, headers: dict[str, str]) -> Any:
    response = await client.get(path, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def me(client: AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
    data: dict[str, Any] = await get_data(client, "/fantasy/me", headers)
    return data


async def market(client: AsyncClient, headers: dict[str, str]) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = (await get_data(client, "/fantasy/market", headers))["listings"]
    return data


async def transfers(client: AsyncClient, headers: dict[str, str]) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = (await get_data(client, "/fantasy/transfers", headers))[
        "transfers"
    ]
    return data


async def bid(client: AsyncClient, headers: dict[str, str], listing_id: str, amount: int) -> Any:
    return await client.put(
        f"/fantasy/market/{listing_id}/bid", json={"amount": amount}, headers=headers
    )


def buyable(listings: list[dict[str, Any]], *squads: dict[str, Any]) -> list[dict[str, Any]]:
    """Ventas de la banca de jugadores que no tiene nadie de los equipos dados, uno por jugador."""
    owned = {c["player_id"] for team in squads for c in team["squad"]}
    chosen: dict[str, dict[str, Any]] = {}
    for listing in listings:
        if listing["seller"] is None and listing["player_id"] not in owned:
            chosen.setdefault(listing["player_id"], listing)
    return list(chosen.values())


def parse(moment: str) -> datetime:
    return datetime.fromisoformat(moment)


async def give_copies(
    session: AsyncSession, participant_id: str, count: int, at: datetime
) -> list[uuid.UUID]:
    """Da al participante copias de la banca de jugadores que no tiene (como un fichaje).

    Nunca copias en venta: el mercado de la banca es al azar y robarle una copia anularía su venta.
    """
    owner = uuid.UUID(participant_id)
    owned = select(FantasyCopy.player_id).where(FantasyCopy.owner_id == owner)
    listed = select(FantasyListing.copy_id).where(
        FantasyListing.resolved_at.is_(None), FantasyListing.cancelled_at.is_(None)
    )
    query = (
        select(FantasyCopy)
        .where(
            FantasyCopy.owner_id.is_(None),
            FantasyCopy.player_id.not_in(owned),
            FantasyCopy.id.not_in(listed),
        )
        .order_by(FantasyCopy.player_id, FantasyCopy.copy_number)
    )
    by_player: dict[uuid.UUID, FantasyCopy] = {}
    for copy in (await session.execute(query)).scalars().all():
        by_player.setdefault(copy.player_id, copy)
    chosen = list(by_player.values())[:count]
    assert len(chosen) == count
    for copy in chosen:
        copy.owner_id, copy.acquired_at, copy.clause = owner, at, 6000
        session.add(
            FantasyTransfer(
                league_id=copy.league_id,
                copy_id=copy.id,
                from_participant_id=None,
                to_participant_id=owner,
                price=0,
                kind=TransferKind.MARKET,
                at=at,
            )
        )
    await session.flush()
    return [c.id for c in chosen]


async def play_at_kickoff(clock: Clock, *args: Any, **kwargs: Any) -> tuple[str, list[Player]]:
    """`played_match` sincronizado a las 18:00 del día del partido (su inicio bloquea el
    Fantasy); después el reloj vuelve a donde estaba."""
    from tests.integration.api.test_stats_api import played_match

    before = clock.now
    clock.now = KICKOFF
    try:
        match_id, players = await played_match(*args, **kwargs)
    finally:
        clock.now = before
    return str(match_id), list(players)
