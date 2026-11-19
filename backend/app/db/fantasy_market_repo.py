"""Acceso a datos del mercado del Fantasy: ventas abiertas, pujas y copias de la banca.

Las funciones hacen flush; el commit lo decide quien llama. Las escrituras se hacen con la fila
de la liga bloqueada (`fantasy_repo.lock_league`).
"""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.db.fantasy_repo import copy_is_listed
from app.db.models import FantasyBid, FantasyCopy, FantasyListing, FantasyParticipant, Player
from app.domain.fantasy.market import Bid, Bidder


@dataclass(frozen=True, slots=True)
class ListingRow:
    listing: FantasyListing
    copy: FantasyCopy
    player: Player


def _is_open() -> ColumnElement[bool]:
    return FantasyListing.resolved_at.is_(None) & FantasyListing.cancelled_at.is_(None)


def _listing_query(league_id: uuid.UUID):  # type: ignore[no-untyped-def]
    return (
        select(FantasyListing, FantasyCopy, Player)
        .join(FantasyCopy, FantasyCopy.id == FantasyListing.copy_id)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(FantasyListing.league_id == league_id, _is_open())
        .execution_options(populate_existing=True)
    )


async def open_listings(db: AsyncSession, league_id: uuid.UUID, now: datetime) -> list[ListingRow]:
    """Ventas abiertas y aún no vencidas, por cierre y nombre."""
    query = _listing_query(league_id).where(FantasyListing.closes_at > now)
    rows = [ListingRow(lst, c, p) for lst, c, p in (await db.execute(query)).all()]
    return sorted(rows, key=lambda r: (r.listing.closes_at, r.player.name.casefold(), r.copy.id))


async def open_listing(
    db: AsyncSession, league_id: uuid.UUID, listing_id: uuid.UUID, now: datetime
) -> ListingRow | None:
    query = _listing_query(league_id).where(
        FantasyListing.id == listing_id, FantasyListing.closes_at > now
    )
    row = (await db.execute(query)).one_or_none()
    return ListingRow(*row) if row is not None else None


async def open_listings_of_copies(
    db: AsyncSession, copy_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, FantasyListing]:
    ids = list(set(copy_ids))
    if not ids:
        return {}
    query = (
        select(FantasyListing)
        .where(FantasyListing.copy_id.in_(ids), _is_open())
        .execution_options(populate_existing=True)
    )
    return {lst.copy_id: lst for lst in (await db.execute(query)).scalars().all()}


async def due_listings(db: AsyncSession, league_id: uuid.UUID, now: datetime) -> list[ListingRow]:
    """Ventas abiertas ya vencidas, en el orden en que cierran."""
    query = _listing_query(league_id).where(FantasyListing.closes_at <= now)
    rows = [ListingRow(lst, c, p) for lst, c, p in (await db.execute(query)).all()]
    return sorted(rows, key=lambda r: (r.listing.closes_at, r.listing.opened_at, r.listing.id))


async def has_due_listings(db: AsyncSession, league_id: uuid.UUID, now: datetime) -> bool:
    query = select(
        exists().where(
            FantasyListing.league_id == league_id, _is_open(), FantasyListing.closes_at <= now
        )
    )
    return bool(await db.scalar(query))


async def create_listing(
    db: AsyncSession,
    copy: FantasyCopy,
    *,
    seller_id: uuid.UUID | None,
    min_price: int | None,
    opened_at: datetime,
    closes_at: datetime,
    market_day: date | None = None,
) -> FantasyListing:
    listing = FantasyListing(
        league_id=copy.league_id,
        copy_id=copy.id,
        seller_participant_id=seller_id,
        min_price=min_price,
        opened_at=opened_at,
        closes_at=closes_at,
        market_day=market_day,
    )
    db.add(listing)
    await db.flush()
    return listing


async def cancel_listing(db: AsyncSession, listing: FantasyListing, at: datetime) -> None:
    """Retira la venta y anula sus pujas."""
    listing.cancelled_at = at
    await db.execute(delete(FantasyBid).where(FantasyBid.listing_id == listing.id))
    await db.flush()


# --- Copias de la banca y plantillas -------------------------------------------------------------


async def free_bank_copies(db: AsyncSession, league_id: uuid.UUID) -> list[str]:
    """Copias de la banca de jugadores activos que no están ya en venta."""
    query = (
        select(FantasyCopy.id)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(
            FantasyCopy.league_id == league_id,
            FantasyCopy.owner_id.is_(None),
            Player.is_active.is_(True),
            ~copy_is_listed(),
        )
    )
    return [str(c) for c in (await db.execute(query)).scalars().all()]


async def copies_by_id(
    db: AsyncSession, league_id: uuid.UUID, copy_ids: Sequence[str]
) -> dict[str, FantasyCopy]:
    ids = [uuid.UUID(c) for c in copy_ids]
    if not ids:
        return {}
    query = (
        select(FantasyCopy)
        .where(FantasyCopy.league_id == league_id, FantasyCopy.id.in_(ids))
        .execution_options(populate_existing=True)
    )
    return {str(c.id): c for c in (await db.execute(query)).scalars().all()}


async def owned_copy(
    db: AsyncSession, owner_id: uuid.UUID, copy_id: uuid.UUID
) -> tuple[FantasyCopy, Player] | None:
    query = (
        select(FantasyCopy, Player)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(FantasyCopy.id == copy_id, FantasyCopy.owner_id == owner_id)
        .execution_options(populate_existing=True)
    )
    row = (await db.execute(query)).one_or_none()
    return (row[0], row[1]) if row is not None else None


async def owned_copies(db: AsyncSession, league_id: uuid.UUID) -> list[tuple[FantasyCopy, Player]]:
    """Copias con dueño de la liga, por dueño y dorsal."""
    query = (
        select(FantasyCopy, Player)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(FantasyCopy.league_id == league_id, FantasyCopy.owner_id.is_not(None))
        .order_by(FantasyCopy.owner_id, Player.dorsal, Player.name)
    )
    return [(c, p) for c, p in (await db.execute(query)).all()]


async def owned_copy_in_league(
    db: AsyncSession, league_id: uuid.UUID, copy_id: uuid.UUID
) -> tuple[FantasyCopy, Player] | None:
    """La copia con su jugador si tiene dueño (las de la banca no tienen cláusula)."""
    query = (
        select(FantasyCopy, Player)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(
            FantasyCopy.id == copy_id,
            FantasyCopy.league_id == league_id,
            FantasyCopy.owner_id.is_not(None),
        )
        .execution_options(populate_existing=True)
    )
    row = (await db.execute(query)).one_or_none()
    return (row[0], row[1]) if row is not None else None


async def bidders(db: AsyncSession, participant_ids: Iterable[uuid.UUID]) -> dict[str, Bidder]:
    """Saldo y plantilla actual (tamaño y jugadores) de los participantes."""
    ids = list(set(participant_ids))
    if not ids:
        return {}
    balances = dict(
        (
            await db.execute(
                select(FantasyParticipant.id, FantasyParticipant.balance).where(
                    FantasyParticipant.id.in_(ids)
                )
            )
        ).all()
    )
    query = select(FantasyCopy.owner_id, FantasyCopy.player_id).where(FantasyCopy.owner_id.in_(ids))
    players: dict[uuid.UUID, set[str]] = {pid: set() for pid in balances}
    for owner, player_id in (await db.execute(query)).all():
        if owner is not None:
            players[owner].add(str(player_id))
    return {
        str(pid): Bidder(str(pid), len(players[pid]), frozenset(players[pid]), balance)
        for pid, balance in balances.items()
    }


# --- Pujas ---------------------------------------------------------------------------------------


async def bids_for(db: AsyncSession, listing_id: uuid.UUID) -> list[Bid]:
    query = select(FantasyBid).where(FantasyBid.listing_id == listing_id)
    return [
        Bid(str(b.participant_id), b.amount, b.updated_at)
        for b in (await db.execute(query)).scalars().all()
    ]


async def my_bids(
    db: AsyncSession, participant_id: uuid.UUID, listing_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, int]:
    ids = list(set(listing_ids))
    if not ids:
        return {}
    query = select(FantasyBid.listing_id, FantasyBid.amount).where(
        FantasyBid.participant_id == participant_id, FantasyBid.listing_id.in_(ids)
    )
    return dict((await db.execute(query)).all())


async def place_bid(
    db: AsyncSession, listing_id: uuid.UUID, participant_id: uuid.UUID, amount: int, now: datetime
) -> None:
    """Crea o cambia la puja. Cambiarla pone `updated_at` a ahora: pierde la antigüedad."""
    query = select(FantasyBid).where(
        FantasyBid.listing_id == listing_id, FantasyBid.participant_id == participant_id
    )
    current = (await db.execute(query)).scalar_one_or_none()
    if current is None:
        db.add(
            FantasyBid(
                listing_id=listing_id,
                participant_id=participant_id,
                amount=amount,
                created_at=now,
                updated_at=now,
            )
        )
    else:
        current.amount, current.updated_at = amount, now
    await db.flush()


async def withdraw_bid(db: AsyncSession, listing_id: uuid.UUID, participant_id: uuid.UUID) -> bool:
    result = await db.execute(
        delete(FantasyBid)
        .where(FantasyBid.listing_id == listing_id, FantasyBid.participant_id == participant_id)
        .returning(FantasyBid.id)
    )
    await db.flush()
    return result.first() is not None
