"""Mercado del Fantasy (`docs/fantasy-api-paso3.md`): ver, pujar, vender y traspasos.

Todas las rutas las usa cualquier usuario activo (también los jugadores). Sin liga: 404.
"""

import uuid

from fastapi import APIRouter, Response

from app.api.deps import AnyUser, NowDep, RngDep, SessionDep
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.domain.fantasy.market import BidError, BidRejection
from app.schemas.fantasy import (
    BankSaleOut,
    BidIn,
    ListingIn,
    MarketListingOut,
    MarketOut,
    TransfersOut,
)
from app.services import fantasy_market
from app.services.fantasy import NoLeagueError

router = APIRouter(prefix="/fantasy", tags=["fantasy"])

# Pujas no válidas: 422 si es por el importe o el saldo, 409 si es por la plantilla o la venta.
BID_STATUS = {
    BidRejection.BID_TOO_LOW: 422,
    BidRejection.INSUFFICIENT_BALANCE: 422,
    BidRejection.OWN_LISTING: 409,
    BidRejection.SQUAD_FULL: 409,
    BidRejection.DUPLICATE_PLAYER: 409,
}
BID_MESSAGES = {
    BidRejection.BID_TOO_LOW: "La puja no llega al mínimo",
    BidRejection.INSUFFICIENT_BALANCE: "No tienes saldo suficiente",
    BidRejection.OWN_LISTING: "No puedes pujar por tu propia venta",
    BidRejection.SQUAD_FULL: "Tu plantilla está completa",
    BidRejection.DUPLICATE_PLAYER: "Ya tienes una copia de ese jugador",
}


def _not_found(what: str = "No encontrado") -> ApiError:
    return ApiError(404, "not_found", what)


@router.get("/market", response_model=Envelope[MarketOut])
async def market(db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep) -> Envelope[MarketOut]:
    try:
        return ok(await fantasy_market.market(db, user, now, rng))
    except NoLeagueError as error:
        raise _not_found("No hay ninguna liga activa") from error


@router.put("/market/{listing_id}/bid", response_model=Envelope[MarketListingOut])
async def place_bid(
    listing_id: uuid.UUID,
    payload: BidIn,
    db: SessionDep,
    user: AnyUser,
    now: NowDep,
    rng: RngDep,
) -> Envelope[MarketListingOut]:
    try:
        listing = await fantasy_market.place_bid(db, user, now, rng, listing_id, payload.amount)
    except (NoLeagueError, fantasy_market.NotFoundError) as error:
        raise _not_found("Venta no encontrada o ya cerrada") from error
    except BidError as error:
        reason = error.reason
        raise ApiError(BID_STATUS[reason], reason.value, BID_MESSAGES[reason]) from error
    return ok(listing)


@router.delete("/market/{listing_id}/bid", status_code=204)
async def withdraw_bid(
    listing_id: uuid.UUID, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Response:
    try:
        await fantasy_market.withdraw_bid(db, user, now, rng, listing_id)
    except (NoLeagueError, fantasy_market.NotFoundError) as error:
        raise _not_found("No tienes puja en esa venta o ya cerró") from error
    return Response(status_code=204)


@router.post(
    "/copies/{copy_id}/listing", response_model=Envelope[MarketListingOut], status_code=201
)
async def list_copy(
    copy_id: uuid.UUID,
    db: SessionDep,
    user: AnyUser,
    now: NowDep,
    rng: RngDep,
    payload: ListingIn | None = None,
) -> Envelope[MarketListingOut]:
    min_price = payload.min_price if payload is not None else None
    try:
        return ok(await fantasy_market.list_copy(db, user, now, rng, copy_id, min_price))
    except (NoLeagueError, fantasy_market.NotFoundError) as error:
        raise _not_found("La copia no es tuya") from error
    except fantasy_market.AlreadyListedError as error:
        raise ApiError(409, "already_listed", "La copia ya está a la venta") from error


@router.delete("/copies/{copy_id}/listing", status_code=204)
async def withdraw_listing(
    copy_id: uuid.UUID, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Response:
    try:
        await fantasy_market.withdraw_listing(db, user, now, rng, copy_id)
    except (NoLeagueError, fantasy_market.NotFoundError) as error:
        raise _not_found("La copia no está a la venta") from error
    return Response(status_code=204)


@router.post("/copies/{copy_id}/sell", response_model=Envelope[BankSaleOut])
async def sell_to_bank(
    copy_id: uuid.UUID, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[BankSaleOut]:
    try:
        return ok(await fantasy_market.sell_to_bank(db, user, now, rng, copy_id))
    except (NoLeagueError, fantasy_market.NotFoundError) as error:
        raise _not_found("La copia no es tuya") from error


@router.get("/transfers", response_model=Envelope[TransfersOut])
async def transfers(
    db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[TransfersOut]:
    try:
        return ok(await fantasy_market.transfer_history(db, user, now, rng))
    except NoLeagueError as error:
        raise _not_found("No hay ninguna liga activa") from error
