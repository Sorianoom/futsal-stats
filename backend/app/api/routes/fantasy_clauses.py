"""Cláusulas del Fantasy (`docs/fantasy-api-paso4.md`): ver, subir y clausulazo.

Todas las rutas las usa cualquier usuario activo (también los jugadores). Sin liga: 404.
"""

import uuid

from fastapi import APIRouter

from app.api.deps import AnyUser, NowDep, RngDep, SessionDep
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.domain.fantasy.clauses import ClauseError, ClauseRejection
from app.schemas.fantasy import BankSaleOut, ClauseIn, ClauseRaiseOut, ClausesOut
from app.services import fantasy_clauses
from app.services.fantasy import NoLeagueError
from app.services.fantasy_market import NotFoundError

router = APIRouter(prefix="/fantasy", tags=["fantasy"])

# 422 si es por el importe o el saldo; 409 si es por la copia, el día o la plantilla.
CLAUSE_STATUS = {
    ClauseRejection.INSUFFICIENT_BALANCE: 422,
    ClauseRejection.NOT_HIGHER: 422,
    ClauseRejection.TOO_HIGH: 422,
    ClauseRejection.OWN_COPY: 409,
    ClauseRejection.PROTECTED: 409,
    ClauseRejection.MATCH_DAY: 409,
    ClauseRejection.SQUAD_FULL: 409,
    ClauseRejection.DUPLICATE_PLAYER: 409,
}
CLAUSE_MESSAGES = {
    ClauseRejection.INSUFFICIENT_BALANCE: "No tienes saldo suficiente",
    ClauseRejection.NOT_HIGHER: "La cláusula nueva tiene que ser mayor que la actual",
    ClauseRejection.TOO_HIGH: "La cláusula es demasiado alta",
    ClauseRejection.OWN_COPY: "Esa copia ya es tuya",
    ClauseRejection.PROTECTED: "La copia está protegida por un fichaje reciente",
    ClauseRejection.MATCH_DAY: "Hoy hay partido: no se puede clausular",
    ClauseRejection.SQUAD_FULL: "Tu plantilla está completa",
    ClauseRejection.DUPLICATE_PLAYER: "Ya tienes una copia de ese jugador",
}


def _clause_error(error: ClauseError) -> ApiError:
    reason = error.reason
    return ApiError(CLAUSE_STATUS[reason], reason.value, CLAUSE_MESSAGES[reason])


@router.get("/clauses", response_model=Envelope[ClausesOut])
async def clauses(db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep) -> Envelope[ClausesOut]:
    try:
        return ok(await fantasy_clauses.clauses(db, user, now, rng))
    except NoLeagueError as error:
        raise ApiError(404, "not_found", "No hay ninguna liga activa") from error


@router.post("/copies/{copy_id}/clause/buy", response_model=Envelope[BankSaleOut])
async def buy_clause(
    copy_id: uuid.UUID, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[BankSaleOut]:
    try:
        return ok(await fantasy_clauses.buy_clause(db, user, now, rng, copy_id))
    except (NoLeagueError, NotFoundError) as error:
        raise ApiError(404, "not_found", "Copia no encontrada") from error
    except ClauseError as error:
        raise _clause_error(error) from error


@router.put("/copies/{copy_id}/clause", response_model=Envelope[ClauseRaiseOut])
async def raise_clause(
    copy_id: uuid.UUID,
    payload: ClauseIn,
    db: SessionDep,
    user: AnyUser,
    now: NowDep,
    rng: RngDep,
) -> Envelope[ClauseRaiseOut]:
    try:
        return ok(await fantasy_clauses.raise_clause(db, user, now, rng, copy_id, payload.clause))
    except (NoLeagueError, NotFoundError) as error:
        raise ApiError(404, "not_found", "La copia no es tuya") from error
    except ClauseError as error:
        raise _clause_error(error) from error
