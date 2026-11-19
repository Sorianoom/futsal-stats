"""Fantasy: cláusulas de rescisión (ver, subir y clausulazo).

Las escrituras bloquean la fila de la liga, como el mercado: un clausulazo no se cruza con el
cierre de una venta ni con otro movimiento del mismo saldo o de la misma copia.
"""

import random
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_market_repo as market_repo
from app.db import fantasy_money_repo as money
from app.db.models import FantasyLeague, User
from app.domain.fantasy.calendar import madrid_date
from app.domain.fantasy.clauses import (
    check_clause_buy,
    check_clause_raise,
    protected_until,
    raise_cost,
)
from app.domain.fantasy.market import LedgerKind, TransferKind
from app.domain.fantasy.rules import FANTASY_TIMEZONE
from app.schemas.fantasy import (
    BankSaleOut,
    ClauseCopyOut,
    ClauseRaiseOut,
    ClausesOut,
    ParticipantRefOut,
)
from app.services.fantasy import participant_names, require_membership
from app.services.fantasy_market import NotFoundError, lock
from app.services.fantasy_results import rounds_of


async def _is_match_day(db: AsyncSession, league: FantasyLeague, now: datetime) -> bool:
    today = madrid_date(now)
    return any(r.held_on == today for r in await rounds_of(db, league))


async def clauses(db: AsyncSession, user: User, now: datetime, rng: random.Random) -> ClausesOut:
    """Copias con dueño de la liga con su cláusula. Lanza `NoLeagueError` sin liga."""
    membership = await require_membership(db, user, now, rng)
    league, me = membership.league, membership.participant.id
    values = await money.player_values(db, league.id)
    names = await participant_names(db, league.id)
    copies = []
    for copy, player in await market_repo.owned_copies(db, league.id):
        assert copy.owner_id is not None and copy.clause is not None
        copies.append(
            ClauseCopyOut(
                copy_id=copy.id,
                player_id=player.id,
                name=player.name,
                dorsal=player.dorsal,
                position=player.position,
                value=money.value_of(values, player.id),
                clause=copy.clause,
                owner=ParticipantRefOut(
                    participant_id=copy.owner_id, display_name=names.get(copy.owner_id, "")
                ),
                protected_until=protected_until(copy.acquired_at).astimezone(FANTASY_TIMEZONE),
                mine=copy.owner_id == me,
            )
        )
    return ClausesOut(match_day=await _is_match_day(db, league, now), copies=copies)


async def buy_clause(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, copy_id: uuid.UUID
) -> BankSaleOut:
    """Clausulazo: pago la cláusula al dueño y la copia es mía al momento. Si estaba a la venta,
    se anula. Lanza `NotFoundError` o `ClauseError`."""
    locked = await lock(db, user, now, rng)
    league, me = locked.league, locked.participant.id
    row = await market_repo.owned_copy_in_league(db, league.id, copy_id)
    if row is None:
        raise NotFoundError
    copy, player = row
    seller = copy.owner_id
    assert seller is not None and copy.clause is not None and copy.acquired_at is not None
    price = copy.clause
    buyer = (await market_repo.bidders(db, [me]))[str(me)]
    match_days = {r.held_on for r in await rounds_of(db, league)}
    check_clause_buy(
        buyer,
        owner_id=str(seller),
        player_id=str(player.id),
        clause=price,
        acquired_at=copy.acquired_at,
        now=now,
        match_days=match_days,
    )
    listing = (await market_repo.open_listings_of_copies(db, [copy.id])).get(copy.id)
    if listing is not None:
        await market_repo.cancel_listing(db, listing, now)
    await money.record_transfer(db, copy, me, price=price, kind=TransferKind.CLAUSE, at=now)
    await money.apply_movement(db, seller, price, LedgerKind.CLAUSE_SALE, now)
    balance = await money.apply_movement(db, me, -price, LedgerKind.CLAUSE_PURCHASE, now)
    await db.commit()
    return BankSaleOut(price=price, balance=balance)


async def raise_clause(
    db: AsyncSession,
    user: User,
    now: datetime,
    rng: random.Random,
    copy_id: uuid.UUID,
    new_clause: int,
) -> ClauseRaiseOut:
    """Subo la cláusula de una copia mía pagando la mitad de la subida."""
    locked = await lock(db, user, now, rng)
    participant = locked.participant
    owned = await market_repo.owned_copy(db, participant.id, copy_id)
    if owned is None:
        raise NotFoundError
    copy, _ = owned
    assert copy.clause is not None
    check_clause_raise(current=copy.clause, new=new_clause, balance=participant.balance)
    cost = raise_cost(copy.clause, new_clause)
    copy.clause = new_clause
    balance = await money.apply_movement(db, participant.id, -cost, LedgerKind.CLAUSE_RAISE, now)
    await db.commit()
    return ClauseRaiseOut(clause=new_clause, cost=cost, balance=balance)
