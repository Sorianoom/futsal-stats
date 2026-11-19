"""Fantasy sin cron: lo vencido se procesa en la siguiente petición del Fantasy.

Pendiente puede haber: ventas con el cierre vencido, jornadas que ya tocaría cerrar (partido de
un día anterior, ya cerrado y con resultados) y el mercado de la banca de hoy. La comprobación es
barata y solo si hay algo procesable se bloquea la fila de la liga y se procesa todo en orden
temporal. Un partido con eventos incoherentes no se puede puntuar: no cuenta como pendiente hasta
que se corrija (si contara, cada petición bloquearía la liga sin hacer nada).
Con la liga bloqueada, dos peticiones a la vez no lo procesan dos veces: la segunda espera y, al
volver a mirar, ya no encuentra nada.
"""

import random
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_market_repo as market_repo
from app.db import fantasy_money_repo as money
from app.db import fantasy_repo
from app.db.fantasy_market_repo import ListingRow
from app.db.models import FantasyLeague
from app.domain.fantasy.calendar import Round, day_start, madrid_date, settle_time
from app.domain.fantasy.market import (
    LedgerKind,
    TransferKind,
    pick_daily_market,
    winning_bid,
)
from app.domain.rating.match import PlayerMatchResult
from app.services.fantasy_results import rounds_of, scored_results
from app.services.fantasy_settlement import settle_round

# A la misma hora, la jornada se cierra antes que las ventas (el cobro llega antes del pago).
ROUND_FIRST, LISTING_SECOND = 0, 1

type MatchResults = dict[str, PlayerMatchResult]
type Step = tuple[datetime, int, Callable[[], Awaitable[None]]]


async def has_pending(db: AsyncSession, league: FantasyLeague, now: datetime) -> bool:
    today = madrid_date(now)
    if league.market_day != today:
        return True
    if await market_repo.has_due_listings(db, league.id, now):
        return True
    return bool(await _settleable_rounds(db, league, now))


async def catch_up(db: AsyncSession, now: datetime, rng: random.Random) -> bool:
    """Procesa lo vencido de la liga activa, si hay algo, y confirma. Dice si procesó algo."""
    league = await fantasy_repo.get_active_league(db)
    if league is None or not await has_pending(db, league, now):
        return False
    league = await fantasy_repo.get_active_league(db, for_update=True)
    if league is None:
        return False
    for _, _, run in sorted(await _due_steps(db, league, now), key=lambda s: (s[0], s[1])):
        await run()
    today = madrid_date(now)
    if league.market_day != today:
        await _open_bank_market(db, league, now, rng)
    await db.commit()
    return True


async def _settleable_rounds(
    db: AsyncSession, league: FantasyLeague, now: datetime
) -> list[tuple[Round, MatchResults]]:
    """Jornadas que ya tocaría cerrar y que se pueden puntuar, con sus resultados."""
    pending = set(await money.pending_round_ids(db, league.id, league.starts_on, madrid_date(now)))
    if not pending:
        return []
    rounds = [r for r in await rounds_of(db, league) if r.match_id in pending]
    results = await scored_results(db, rounds, now)
    return [(r, found) for r in rounds if (found := results.get(r.match_id)) is not None]


async def _due_steps(db: AsyncSession, league: FantasyLeague, now: datetime) -> list[Step]:
    steps: list[Step] = [
        (settle_time(r.held_on), ROUND_FIRST, partial(settle_round, db, league, r, found))
        for r, found in await _settleable_rounds(db, league, now)
    ]
    for row in await market_repo.due_listings(db, league.id, now):
        steps.append((row.listing.closes_at, LISTING_SECOND, partial(_resolve, db, row, now)))
    return steps


async def _resolve(db: AsyncSession, row: ListingRow, now: datetime) -> None:
    """Cierra una venta: gana la puja más alta de quien aún puede fichar la copia."""
    listing, copy = row.listing, row.copy
    if copy.owner_id != listing.seller_participant_id:  # la copia ya no es del vendedor
        await market_repo.cancel_listing(db, listing, now)
        return
    listing.resolved_at = now
    bids = await market_repo.bids_for(db, listing.id)
    bidders = await market_repo.bidders(db, [uuid.UUID(b.participant_id) for b in bids])
    winner = winning_bid(bids, str(row.player.id), bidders)
    if winner is None:
        return
    at, buyer = listing.closes_at, uuid.UUID(winner.participant_id)
    await money.record_transfer(
        db, copy, buyer, price=winner.amount, kind=TransferKind.MARKET, at=at
    )
    await money.apply_movement(db, buyer, -winner.amount, LedgerKind.MARKET_PURCHASE, at)
    if listing.seller_participant_id is not None:
        await money.apply_movement(
            db, listing.seller_participant_id, winner.amount, LedgerKind.MARKET_SALE, at
        )


async def _open_bank_market(
    db: AsyncSession, league: FantasyLeague, now: datetime, rng: random.Random
) -> None:
    """Mercado de la banca de hoy: sale a las 00:00 y cierra a las 00:00 de mañana. Si nadie
    entró algún día, ese día no tuvo mercado (no se crean atrasados)."""
    today = madrid_date(now)
    free = await market_repo.free_bank_copies(db, league.id)
    picked = pick_daily_market(free, today, league.starts_on, rng)
    copies = await market_repo.copies_by_id(db, league.id, picked)
    opens, closes = day_start(today), day_start(today + timedelta(days=1))
    for copy_id in picked:
        await market_repo.create_listing(
            db,
            copies[copy_id],
            seller_id=None,
            min_price=None,
            opened_at=opens,
            closes_at=closes,
            market_day=today,
        )
    await fantasy_repo.set_market_day(db, league, today)
