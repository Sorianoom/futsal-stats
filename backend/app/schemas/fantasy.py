"""Cuerpos y respuestas de las rutas del Fantasy. El dinero va en miles (1000 = 1 M)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.fantasy.calendar import RoundStatus
from app.domain.fantasy.market import TransferKind
from app.domain.fantasy.rules import MAX_MONEY_AMOUNT
from app.domain.points.callup import Position

# Tope de seguridad del cuerpo: más de 4 de campo ya es `invalid_lineup`, pero una lista enorme
# se corta antes en la validación.
MAX_FIELD_IDS_ACCEPTED = 16


class LeagueCreatedOut(BaseModel):
    id: uuid.UUID
    starts_on: date
    participants: int


class LeagueOut(BaseModel):
    id: uuid.UUID
    starts_on: date


class ParticipantOut(BaseModel):
    participant_id: uuid.UUID
    display_name: str
    balance: int
    squad_limit: int
    # Suma del valor actual de su plantilla.
    team_value: int
    # Cuenta del Fantasy del cuerpo técnico: su plantilla no se ve y no clausula ni la clausulan.
    private_squad: bool = False


class SquadListingOut(BaseModel):
    """Venta abierta de una copia de mi plantilla. `min_price` es el que puse (o null)."""

    listing_id: uuid.UUID
    min_price: int | None
    closes_at: datetime


class SquadCopyOut(BaseModel):
    copy_id: uuid.UUID
    player_id: uuid.UUID
    name: str
    dorsal: int
    position: Position
    # Valor actual del jugador en la liga y su cambio en la última jornada cerrada (0 si no hay).
    value: int
    value_change: int
    listing: SquadListingOut | None
    # Cláusula actual y hasta cuándo no se puede clausular (puede haber pasado ya).
    clause: int
    protected_until: datetime
    # Puntos del jugador en la última jornada puntuada (0 si no jugó); null si aún no hay ninguna.
    last_points: int | None
    # Ruta pública de la foto del jugador, relativa a la API (null si no tiene).
    photo_url: str | None = None
    # Puntos del jugador en sus últimas jornadas puntuadas, de la más antigua a la más reciente.
    recent_points: list[int] = []


class LineupOut(BaseModel):
    goalkeeper_copy_id: uuid.UUID | None
    field_copy_ids: list[uuid.UUID | None]
    # Copia capitana (puntúa doble) o null.
    captain_copy_id: uuid.UUID | None


class LineupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goalkeeper_copy_id: uuid.UUID | None = None
    field_copy_ids: list[uuid.UUID | None] = Field(
        default_factory=list, max_length=MAX_FIELD_IDS_ACCEPTED
    )
    captain_copy_id: uuid.UUID | None = None


class NextRoundOut(BaseModel):
    match_id: uuid.UUID
    opponent: str
    held_on: date
    locks_at: datetime


class LastRoundOut(BaseModel):
    """Última jornada que ya puntúa (provisional o cerrada)."""

    match_id: uuid.UUID
    opponent: str
    held_on: date


class NoLeagueOut(BaseModel):
    """Respuesta de `GET /fantasy/me` cuando aún no hay liga: solo `league: null`."""

    league: None = None


class SpectatorOut(BaseModel):
    """`GET /fantasy/me` de una cuenta de partidos del cuerpo técnico: no tiene equipo, solo mira
    la clasificación."""

    league: LeagueOut
    spectator: Literal[True] = True


class MyTeamOut(BaseModel):
    league: LeagueOut
    me: ParticipantOut
    squad: list[SquadCopyOut]
    lineup: LineupOut
    next_round: NextRoundOut | None
    last_round: LastRoundOut | None
    # Jornada ya bloqueada cuyo partido aún no ha cerrado (normalmente, la de hoy): puntúa la
    # alineación que había al bloquearse. null si no hay ninguna.
    live_round: LastRoundOut | None = None


class RoundOut(BaseModel):
    match_id: uuid.UUID
    opponent: str
    held_on: date
    status: RoundStatus


class StandingRowOut(BaseModel):
    participant_id: uuid.UUID
    display_name: str
    total: int
    points_by_round: dict[str, int]


class StandingsOut(BaseModel):
    rounds: list[RoundOut]
    rows: list[StandingRowOut]


class BreakdownItemOut(BaseModel):
    """Una línea del porqué de los puntos: la acción, cuántas veces y lo que suma."""

    key: str
    count: int
    points: float


class SlotOut(BaseModel):
    slot: Position
    copy_id: uuid.UUID | None
    player_id: uuid.UUID | None
    name: str | None
    dorsal: int | None = None
    photo_url: str | None = None
    rating: float | None
    # Puntuación exacta sin tope (la que se redondea para los puntos).
    score: float | None = None
    goals: int
    # Ya multiplicados si es el capitán.
    points: int
    captain: bool
    mvp: bool = False
    # Porqué de la nota (base y acciones, suman `score`) y extras del Fantasy (gol, MVP).
    breakdown: list[BreakdownItemOut] = []
    bonus: list[BreakdownItemOut] = []


class RoundDetailOut(BaseModel):
    match_id: uuid.UUID
    status: RoundStatus
    total: int
    # Cobro de la jornada (0 si aún no está cerrada).
    payout: int
    # Puntuó 0 por tener saldo negativo al bloquearse la alineación.
    negative_balance: bool
    slots: list[SlotOut]


class ParticipantTeamOut(BaseModel):
    """Equipo de un participante visto desde la clasificación. Si su plantilla es privada (y no es
    la mía), solo sale el nombre: ni jugadores, ni valor, ni alineación."""

    participant_id: uuid.UUID
    display_name: str
    private_squad: bool
    team_value: int | None
    squad: list[SquadCopyOut]
    # Última jornada con la alineación ya bloqueada y cómo puntuó (la de la próxima no se ve).
    last_round: LastRoundOut | None
    last_lineup: RoundDetailOut | None


# --- Mercado -------------------------------------------------------------------------------------


class ParticipantRefOut(BaseModel):
    participant_id: uuid.UUID
    display_name: str


class MarketListingOut(BaseModel):
    listing_id: uuid.UUID
    copy_id: uuid.UUID
    player_id: uuid.UUID
    name: str
    dorsal: int
    position: Position
    value: int
    # max(valor actual, precio mínimo del vendedor).
    min_bid: int
    # null = la banca.
    seller: ParticipantRefOut | None
    closes_at: datetime
    # Sobre cerrado: solo mi puja, nunca las ajenas.
    my_bid: int | None
    mine: bool
    # Ruta pública de la foto del jugador, relativa a la API (null si no tiene).
    photo_url: str | None = None
    # Puntos del jugador en sus últimas jornadas puntuadas, de la más antigua a la más reciente.
    recent_points: list[int] = []


class MarketOut(BaseModel):
    listings: list[MarketListingOut]


class BidIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: int = Field(ge=0, le=MAX_MONEY_AMOUNT)


class ListingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_price: int | None = Field(default=None, ge=0, le=MAX_MONEY_AMOUNT)


class BankSaleOut(BaseModel):
    """Venta a la banca o clausulazo: lo que se cobró o pagó y el saldo que queda."""

    price: int
    balance: int


class ClauseCopyOut(BaseModel):
    copy_id: uuid.UUID
    player_id: uuid.UUID
    name: str
    dorsal: int
    position: Position
    value: int
    clause: int
    owner: ParticipantRefOut
    protected_until: datetime
    mine: bool
    # Ruta pública de la foto del jugador, relativa a la API (null si no tiene).
    photo_url: str | None = None
    # Puntos del jugador en sus últimas jornadas puntuadas, de la más antigua a la más reciente.
    recent_points: list[int] = []


class ClausesOut(BaseModel):
    # Hoy hay partido (hora de Madrid): nadie puede clausular.
    match_day: bool
    copies: list[ClauseCopyOut]


class ClauseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clause: int = Field(ge=0, le=MAX_MONEY_AMOUNT)


class ClauseRaiseOut(BaseModel):
    clause: int
    cost: int
    balance: int


class TransferOut(BaseModel):
    at: datetime
    kind: TransferKind
    player_id: uuid.UUID
    name: str
    # null = la banca. `from` es palabra reservada en Python: sale con alias.
    from_: ParticipantRefOut | None = Field(serialization_alias="from")
    to: ParticipantRefOut | None
    price: int


class TransfersOut(BaseModel):
    transfers: list[TransferOut]
