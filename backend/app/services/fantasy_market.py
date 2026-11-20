"""Fantasy: mercado (ver, pujar, poner a la venta, retirar, vender a la banca) y traspasos.

Cada escritura bloquea la fila de la liga: así no se cruza con el cierre de una venta ni con otra
escritura que toque el mismo saldo o la misma copia.
"""

import random
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_market_repo as market_repo
from app.db import fantasy_money_repo as money
from app.db import fantasy_repo, photos_repo
from app.db.fantasy_market_repo import ListingRow
from app.db.models import FantasyLeague, FantasyParticipant, User
from app.domain.fantasy.market import LedgerKind, TransferKind, check_bid, min_bid
from app.domain.fantasy.rules import (
    FANTASY_TIMEZONE,
    LISTING_DURATION_HOURS,
    TRANSFERS_PAGE_SIZE,
)
from app.domain.fantasy.values import bank_sale_price
from app.schemas.fantasy import (
    BankSaleOut,
    MarketListingOut,
    MarketOut,
    ParticipantRefOut,
    TransferOut,
    TransfersOut,
)
from app.services.fantasy import NoLeagueError, participant_names, require_membership
from app.services.fantasy_results import recent_points, rounds_of


class NotFoundError(Exception):
    """La venta, la puja o la copia no existe (o no es mía, o la venta ya cerró)."""


class AlreadyListedError(Exception):
    """La copia ya está a la venta."""


@dataclass(frozen=True, slots=True)
class Locked:
    league: FantasyLeague
    participant: FantasyParticipant


async def lock(db: AsyncSession, user: User, now: datetime, rng: random.Random) -> Locked:
    """Pone al día lo pendiente y bloquea la liga; relee el participante ya bloqueada."""
    await require_membership(db, user, now, rng)
    league = await fantasy_repo.get_active_league(db, for_update=True)
    if league is None:
        raise NoLeagueError
    participant = await fantasy_repo.get_participant(db, league.id, user.id)
    if participant is None:
        raise NoLeagueError
    return Locked(league, participant)


def _ref(
    participant_id: uuid.UUID | None, names: Mapping[uuid.UUID, str]
) -> ParticipantRefOut | None:
    if participant_id is None:
        return None
    return ParticipantRefOut(
        participant_id=participant_id, display_name=names.get(participant_id, "")
    )


async def _listings_out(
    db: AsyncSession,
    league: FantasyLeague,
    me: uuid.UUID,
    rows: Sequence[ListingRow],
    now: datetime,
) -> list[MarketListingOut]:
    league_id = league.id
    values = await money.player_values(db, league_id)
    names = await participant_names(db, league_id)
    bids = await market_repo.my_bids(db, me, [r.listing.id for r in rows])
    photos = await photos_repo.photo_urls(db, [r.player.id for r in rows])
    recent = await recent_points(db, await rounds_of(db, league), now, [r.player.id for r in rows])
    out = []
    for row in rows:
        listing, player = row.listing, row.player
        value = money.value_of(values, player.id)
        out.append(
            MarketListingOut(
                listing_id=listing.id,
                copy_id=row.copy.id,
                player_id=player.id,
                name=player.name,
                dorsal=player.dorsal,
                position=player.position,
                value=value,
                min_bid=min_bid(value, listing.min_price),
                seller=_ref(listing.seller_participant_id, names),
                closes_at=listing.closes_at.astimezone(FANTASY_TIMEZONE),
                my_bid=bids.get(listing.id),
                mine=listing.seller_participant_id == me,
                photo_url=photos.get(player.id),
                recent_points=recent.get(player.id, []),
            )
        )
    return out


async def market(db: AsyncSession, user: User, now: datetime, rng: random.Random) -> MarketOut:
    """Ventas abiertas, por cierre y nombre. Lanza `NoLeagueError` sin liga."""
    membership = await require_membership(db, user, now, rng)
    league_id = membership.league.id
    rows = await market_repo.open_listings(db, league_id, now)
    listings = await _listings_out(db, membership.league, membership.participant.id, rows, now)
    return MarketOut(listings=listings)


async def place_bid(
    db: AsyncSession,
    user: User,
    now: datetime,
    rng: random.Random,
    listing_id: uuid.UUID,
    amount: int,
) -> MarketListingOut:
    """Crea o cambia mi puja. Lanza `NotFoundError` o `BidError` (con el motivo)."""
    locked = await lock(db, user, now, rng)
    league_id, me = locked.league.id, locked.participant.id
    row = await market_repo.open_listing(db, league_id, listing_id, now)
    # Si la copia ya no es del vendedor (banca = None), la venta no puede cerrarse: no se puja.
    if row is None or row.copy.owner_id != row.listing.seller_participant_id:
        raise NotFoundError
    value = money.value_of(await money.player_values(db, league_id), row.player.id)
    bidder = (await market_repo.bidders(db, [me]))[str(me)]
    seller = row.listing.seller_participant_id
    check_bid(
        bidder,
        amount=amount,
        player_id=str(row.player.id),
        minimum=min_bid(value, row.listing.min_price),
        seller_id=str(seller) if seller is not None else None,
    )
    await market_repo.place_bid(db, row.listing.id, me, amount, now)
    [out] = await _listings_out(db, locked.league, me, [row], now)
    await db.commit()
    return out


async def withdraw_bid(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, listing_id: uuid.UUID
) -> None:
    locked = await lock(db, user, now, rng)
    row = await market_repo.open_listing(db, locked.league.id, listing_id, now)
    if row is None or not await market_repo.withdraw_bid(db, listing_id, locked.participant.id):
        raise NotFoundError
    await db.commit()


async def list_copy(
    db: AsyncSession,
    user: User,
    now: datetime,
    rng: random.Random,
    copy_id: uuid.UUID,
    min_price: int | None,
) -> MarketListingOut:
    """Pone a la venta una copia mía durante 24 h; sigue siendo mía hasta el cierre."""
    locked = await lock(db, user, now, rng)
    me = locked.participant.id
    owned = await market_repo.owned_copy(db, me, copy_id)
    if owned is None:
        raise NotFoundError
    copy, player = owned
    if await market_repo.open_listings_of_copies(db, [copy.id]):
        raise AlreadyListedError
    listing = await market_repo.create_listing(
        db,
        copy,
        seller_id=me,
        min_price=min_price,
        opened_at=now,
        closes_at=now + timedelta(hours=LISTING_DURATION_HOURS),
    )
    row = ListingRow(listing, copy, player)
    [out] = await _listings_out(db, locked.league, me, [row], now)
    await db.commit()
    return out


async def withdraw_listing(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, copy_id: uuid.UUID
) -> None:
    """Retira mi venta y anula sus pujas."""
    locked = await lock(db, user, now, rng)
    owned = await market_repo.owned_copy(db, locked.participant.id, copy_id)
    listing = (await market_repo.open_listings_of_copies(db, [copy_id])).get(copy_id)
    if owned is None or listing is None:
        raise NotFoundError
    await market_repo.cancel_listing(db, listing, now)
    await db.commit()


async def sell_to_bank(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, copy_id: uuid.UUID
) -> BankSaleOut:
    """Venta inmediata a la banca por el 70 % del valor. Anula mi venta en el mercado."""
    locked = await lock(db, user, now, rng)
    me = locked.participant.id
    owned = await market_repo.owned_copy(db, me, copy_id)
    if owned is None:
        raise NotFoundError
    copy, player = owned
    listing = (await market_repo.open_listings_of_copies(db, [copy.id])).get(copy.id)
    if listing is not None:
        await market_repo.cancel_listing(db, listing, now)
    value = money.value_of(await money.player_values(db, locked.league.id), player.id)
    price = bank_sale_price(value)
    await money.record_transfer(db, copy, None, price=price, kind=TransferKind.BANK_SALE, at=now)
    balance = await money.apply_movement(db, me, price, LedgerKind.BANK_SALE, now)
    await db.commit()
    return BankSaleOut(price=price, balance=balance)


async def transfer_history(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> TransfersOut:
    """Últimos movimientos del mercado, ventas a la banca y clausulazos (sin el reparto inicial)."""
    membership = await require_membership(db, user, now, rng)
    league_id = membership.league.id
    rows = await money.recent_transfers(
        db,
        league_id,
        [TransferKind.MARKET, TransferKind.BANK_SALE, TransferKind.CLAUSE],
        TRANSFERS_PAGE_SIZE,
    )
    names = await participant_names(db, league_id)
    return TransfersOut(
        transfers=[
            TransferOut(
                at=r.transfer.at.astimezone(FANTASY_TIMEZONE),
                kind=r.transfer.kind,
                player_id=r.player.id,
                name=r.player.name,
                from_=_ref(r.transfer.from_participant_id, names),
                to=_ref(r.transfer.to_participant_id, names),
                price=r.transfer.price,
            )
            for r in rows
        ]
    )
