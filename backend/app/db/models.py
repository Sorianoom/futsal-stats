"""Esquema de BD. Los enums de dominio se guardan como VARCHAR con CHECK (sin tipos nativos)."""

import uuid
from datetime import date, datetime
from enum import Enum as PyEnum
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID, ExcludeConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.domain.auth_sessions import RevokeReason
from app.domain.fantasy.market import LedgerKind, TransferKind
from app.domain.fantasy.rules import LINEUP_FIELD_SLOTS
from app.domain.points.attendance import AttendanceStatus, SessionKind
from app.domain.points.callup import PlayerStatus, Position
from app.domain.points.catalog import Deferral, SanctionKind, Severity
from app.domain.roles import Role
from app.domain.stints.events import EventKind

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

PARTS = (1, 2)
MAX_STARS = 5
GOALKEEPER_SLOT = 0


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _enum(enum_class: type[PyEnum]) -> Enum:
    return Enum(
        enum_class,
        native_enum=False,
        length=32,
        validate_strings=True,
        values_callable=lambda cls: [member.value for member in cls],
    )


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Player(Base):
    __tablename__ = "players"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(100))
    alias: Mapped[str | None] = mapped_column(String(30), default=None)
    dorsal: Mapped[int] = mapped_column(Integer, unique=True)
    position: Mapped[Position] = mapped_column(_enum(Position))
    status: Mapped[PlayerStatus] = mapped_column(
        _enum(PlayerStatus), default=PlayerStatus.AVAILABLE, server_default="available"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = _created_at()


class PlayerPhoto(Base):
    """Foto de un jugador. Va aparte para no cargar los bytes con cada consulta de jugadores.

    `token` es aleatorio y cambia con cada foto: el enlace público no se puede adivinar y el
    navegador puede guardarlo en caché para siempre.
    """

    __tablename__ = "player_photos"

    player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    token: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, default=uuid.uuid4)
    content_type: Mapped[str] = mapped_column(String(20))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base):
    """Usuario. Los de rol `player` van vinculados a un jugador (uno como mucho por jugador)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            f"(role = '{Role.PLAYER.value}') = (player_id IS NOT NULL)",
            name="player_link_matches_role",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(254), unique=True)
    # Nombre visible (Fantasy, cabecera). Lo usan los entrenadores; un jugador, el de su ficha.
    display_name: Mapped[str | None] = mapped_column(String(40), default=None)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(_enum(Role))
    player_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("players.id"), unique=True, nullable=True, default=None
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = _created_at()


class PlayerInvitation(Base):
    """Invitación de un solo uso para crear una cuenta: la de un jugador (con `player_id`) o una
    del Fantasy del cuerpo técnico (sin ficha, con el nombre que puso el entrenador).

    Solo se guarda el sha256 del token: quien lea la BD no puede usar una invitación pendiente.
    """

    __tablename__ = "player_invitations"
    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="expires_after_creation"),
        CheckConstraint(
            "(player_id IS NULL) = (display_name IS NOT NULL)", name="player_or_fantasy"
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    player_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), index=True, nullable=True
    )
    display_name: Mapped[str | None] = mapped_column(String(40), nullable=True, default=None)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InfractionRow(Base):
    __tablename__ = "infractions"
    __table_args__ = (
        CheckConstraint("points <= 0", name="points_not_positive"),
        CheckConstraint(
            "(sanction_kind IS NULL) = (sanction_min_matches IS NULL) "
            "AND (sanction_kind IS NULL) = (sanction_max_matches IS NULL)",
            name="sanction_all_or_nothing",
        ),
    )

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    severity: Mapped[Severity] = mapped_column(_enum(Severity))
    points: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(300))
    deferral: Mapped[Deferral] = mapped_column(_enum(Deferral), server_default="none")
    sanction_kind: Mapped[SanctionKind | None] = mapped_column(_enum(SanctionKind), nullable=True)
    sanction_min_matches: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sanction_max_matches: Mapped[int | None] = mapped_column(Integer, nullable=True)
    in_pdf_letter: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


class AttendanceRuleRow(Base):
    __tablename__ = "attendance_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position: Mapped[int] = mapped_column(Integer, unique=True)
    session_kind: Mapped[SessionKind] = mapped_column(_enum(SessionKind))
    status: Mapped[AttendanceStatus] = mapped_column(_enum(AttendanceStatus))
    notified: Mapped[bool] = mapped_column(Boolean)
    infraction_code: Mapped[str] = mapped_column(ForeignKey("infractions.code"))
    late_more_than: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sanction_kind: Mapped[SanctionKind | None] = mapped_column(_enum(SanctionKind), nullable=True)
    sanction_min_matches: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sanction_max_matches: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TeamSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    kind: Mapped[SessionKind] = mapped_column(_enum(SessionKind))
    held_on: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = _created_at()


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), unique=True)
    opponent: Mapped[str] = mapped_column(String(100))
    # Solo los partidos oficiales son jornadas del Fantasy (los amistosos no puntúan).
    is_official: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = _created_at()


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("session_id", "player_id"),
        CheckConstraint("minutes_late >= 0", name="minutes_late_not_negative"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"))
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"))
    status: Mapped[AttendanceStatus] = mapped_column(_enum(AttendanceStatus))
    notified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    minutes_late: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class MovementRow(Base):
    __tablename__ = "movements"
    __table_args__ = (
        CheckConstraint("extract(isodow from applies_week) = 1", name="applies_week_is_monday"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"))
    occurred_on: Mapped[date] = mapped_column(Date)
    points: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(300))
    applies_week: Mapped[date] = mapped_column(Date, index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sessions.id"), nullable=True)
    infraction_code: Mapped[str | None] = mapped_column(
        ForeignKey("infractions.code"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = _created_at()


class Exclusion(Base):
    __tablename__ = "exclusions"
    __table_args__ = (UniqueConstraint("player_id", "match_id", "kind"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"))
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"))
    kind: Mapped[SanctionKind] = mapped_column(_enum(SanctionKind))
    created_at: Mapped[datetime] = _created_at()


class MatchEvent(Base):
    """Evento de juego. `id` y `seq` los genera el cliente (idempotencia y orden offline)."""

    __tablename__ = "match_events"
    __table_args__ = (
        UniqueConstraint("match_id", "seq"),
        CheckConstraint("part IN (1, 2)", name="part_valid"),
        CheckConstraint("t >= 0", name="t_not_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    kind: Mapped[EventKind] = mapped_column(_enum(EventKind))
    part: Mapped[int] = mapped_column(Integer)
    t: Mapped[int] = mapped_column(Integer)
    player_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("players.id"), nullable=True)
    voids_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("match_events.id"), nullable=True
    )
    created_at: Mapped[datetime] = _created_at()


class LineupEventRow(Base):
    """Evento de alineación (inicio de parte, cambio, expulsión, fin de parte) con su payload."""

    __tablename__ = "lineup_events"
    __table_args__ = (UniqueConstraint("match_id", "seq"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"))
    created_at: Mapped[datetime] = _created_at()


class QuintetRatingRow(Base):
    __tablename__ = "quintet_ratings"
    __table_args__ = (
        CheckConstraint(f"stars BETWEEN 1 AND {MAX_STARS}", name="stars_valid"),
        CheckConstraint("part IN (1, 2)", name="part_valid"),
        CheckConstraint("t >= 0", name="t_not_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), index=True)
    part: Mapped[int] = mapped_column(Integer)
    t: Mapped[int] = mapped_column(Integer)
    stars: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created_at()


class StintRow(Base):
    """Tramo editable. La BD impide solapes por jugador, partido y parte."""

    __tablename__ = "stints"
    __table_args__ = (
        CheckConstraint("part IN (1, 2)", name="part_valid"),
        CheckConstraint("start_s >= 0", name="start_not_negative"),
        CheckConstraint("end_s > start_s", name="end_after_start"),
        ExcludeConstraint(
            ("match_id", "="),
            ("player_id", "="),
            ("part", "="),
            (text("int4range(start_s, end_s)"), "&&"),
            using="gist",
            name="stints_no_overlap",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), index=True)
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"))
    part: Mapped[int] = mapped_column(Integer)
    start_s: Mapped[int] = mapped_column(Integer)
    end_s: Mapped[int] = mapped_column(Integer)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(300))


class RefreshSession(Base):
    """Sesión de refresco: una fila por inicio de sesión, revocable y con tope absoluto.

    Guarda el `jti` vigente y el anterior (para tolerar una respuesta perdida tras rotar). Los jti
    no son secretos: sin JWT_SECRET no se puede firmar un token con ellos.
    """

    __tablename__ = "refresh_sessions"
    __table_args__ = (
        CheckConstraint("absolute_expires_at > created_at", name="expires_after_creation"),
        CheckConstraint(
            "(revoked_at IS NULL) = (revoke_reason IS NULL)", name="revocation_is_complete"
        ),
        CheckConstraint(
            "previous_jti IS DISTINCT FROM current_jti", name="previous_differs_from_current"
        ),
        CheckConstraint(
            "(previous_jti IS NULL) = (rotated_at IS NULL)", name="rotation_is_complete"
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    current_jti: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    previous_jti: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created_at()
    last_used_at: Mapped[datetime] = _created_at()
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoke_reason: Mapped[RevokeReason | None] = mapped_column(_enum(RevokeReason), nullable=True)
    # sha256 del refresco anterior a las sesiones: identifica la sesión que se adopta al migrarlo.
    legacy_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)


class IdempotencyKeyRow(Base):
    """Clave de idempotencia de un alta: guarda la respuesta para repetirla sin repetir efectos."""

    __tablename__ = "idempotency_keys"

    key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    endpoint: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class LoginFailure(Base):
    """Un intento de login fallido para una de sus tres claves (ver `app.auth.rate_limit`).

    Solo guarda el HMAC de la clave, nunca la IP ni el email. Las filas viven lo que dura la
    ventana del límite: cada fallo nuevo borra las que ya han salido de ella.
    """

    __tablename__ = "login_failures"
    __table_args__ = (Index("ix_login_failures_key_hash_failed_at", "key_hash", "failed_at"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    key_hash: Mapped[str] = mapped_column(String(64))
    failed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class FantasyLeague(Base):
    """Liga del Fantasy. Solo puede haber una activa (índice único parcial)."""

    __tablename__ = "fantasy_leagues"
    __table_args__ = (
        Index(
            "ux_fantasy_leagues_one_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    # Fecha de Madrid del alta: las jornadas son los partidos oficiales desde ese día.
    starts_on: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Último día (Madrid) con mercado de la banca abierto. Si nadie entra un día, no hay mercado.
    market_day: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)


class FantasyParticipant(Base):
    """Usuario inscrito en una liga. El saldo va en miles (1000 = 1 M) y puede quedar negativo."""

    __tablename__ = "fantasy_participants"
    __table_args__ = (UniqueConstraint("league_id", "user_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    balance: Mapped[int] = mapped_column(Integer)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FantasyCopy(Base):
    """Copia de un jugador real en una liga. Sin dueño está en la banca.

    Un participante no puede tener dos copias del mismo jugador: el UNIQUE (owner_id, player_id)
    no se aplica a la banca porque en Postgres los NULL no chocan entre sí.
    """

    __tablename__ = "fantasy_copies"
    __table_args__ = (
        UniqueConstraint("league_id", "player_id", "copy_number"),
        UniqueConstraint("owner_id", "player_id"),
        CheckConstraint("copy_number >= 1", name="copy_number_positive"),
        CheckConstraint("(owner_id IS NULL) = (acquired_at IS NULL)", name="acquired_iff_owned"),
        CheckConstraint("(owner_id IS NULL) = (clause IS NULL)", name="clause_iff_owned"),
        CheckConstraint("clause >= 0", name="clause_not_negative"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE")
    )
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"))
    copy_number: Mapped[int] = mapped_column(Integer)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fantasy_participants.id"), nullable=True, default=None
    )
    acquired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    # Cláusula de rescisión en miles; solo las copias con dueño la tienen.
    clause: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)


class FantasyLineup(Base):
    """Una versión guardada de la alineación de un participante (historial, no se edita)."""

    __tablename__ = "fantasy_lineups"
    __table_args__ = (
        Index("ix_fantasy_lineups_participant_id_saved_at", "participant_id", "saved_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    participant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_participants.id", ondelete="CASCADE")
    )
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Copia capitana (puntúa doble); None = sin capitán.
    captain_copy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fantasy_copies.id", ondelete="SET NULL"), nullable=True, default=None
    )


class FantasyLineupSlot(Base):
    """Hueco de una alineación: 0 es el portero y 1-4 los de campo. Sin copia = hueco vacío."""

    __tablename__ = "fantasy_lineup_slots"
    __table_args__ = (
        CheckConstraint(
            f"slot BETWEEN {GOALKEEPER_SLOT} AND {LINEUP_FIELD_SLOTS}", name="slot_valid"
        ),
        UniqueConstraint("lineup_id", "copy_id"),
    )

    lineup_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_lineups.id", ondelete="CASCADE"), primary_key=True
    )
    slot: Mapped[int] = mapped_column(Integer, primary_key=True)
    copy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fantasy_copies.id", ondelete="SET NULL"), nullable=True, index=True
    )


# --- Fantasy, paso 3: mercado, dinero y cierre de jornada ----------------------------------------


def _kind_check(enum_class: type[PyEnum]) -> str:
    values = ", ".join(f"'{member.value}'" for member in enum_class)
    return f"kind IN ({values})"


def _participant_fk(nullable: bool = False) -> Mapped[Any]:
    return mapped_column(
        ForeignKey("fantasy_participants.id", ondelete="CASCADE"), nullable=nullable
    )


class FantasyPlayerValue(Base):
    """Valor actual de un jugador en una liga. Se crea con las copias del jugador."""

    __tablename__ = "fantasy_player_values"
    __table_args__ = (CheckConstraint("value >= 0", name="value_not_negative"),)

    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"), primary_key=True)
    value: Mapped[int] = mapped_column(Integer)


class FantasyTransfer(Base):
    """Historial de propiedad: el dueño de una copia en un instante es el del último traspaso
    anterior. `from`/`to` None = la banca. El id da el orden de registro."""

    __tablename__ = "fantasy_transfers"
    __table_args__ = (
        CheckConstraint(_kind_check(TransferKind), name="kind_valid"),
        CheckConstraint("price >= 0", name="price_not_negative"),
        Index("ix_fantasy_transfers_copy_id_at", "copy_id", "at"),
        Index("ix_fantasy_transfers_league_id_at", "league_id", "at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE")
    )
    copy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fantasy_copies.id", ondelete="CASCADE"))
    from_participant_id: Mapped[uuid.UUID | None] = _participant_fk(nullable=True)
    to_participant_id: Mapped[uuid.UUID | None] = _participant_fk(nullable=True)
    price: Mapped[int] = mapped_column(Integer)
    kind: Mapped[TransferKind] = mapped_column(_enum(TransferKind))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FantasyLedgerEntry(Base):
    """Movimiento del saldo (con signo). Saldo en t = saldo actual − movimientos desde t."""

    __tablename__ = "fantasy_ledger"
    __table_args__ = (
        CheckConstraint(_kind_check(LedgerKind), name="kind_valid"),
        Index("ix_fantasy_ledger_participant_id_at", "participant_id", "at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    participant_id: Mapped[uuid.UUID] = _participant_fk()
    amount: Mapped[int] = mapped_column(Integer)
    kind: Mapped[LedgerKind] = mapped_column(_enum(LedgerKind))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


OPEN_LISTING = "resolved_at IS NULL AND cancelled_at IS NULL"


class FantasyListing(Base):
    """Copia en venta. Sin vendedor es de la banca (y tiene `market_day`). Una sola venta
    abierta por copia (índice único parcial)."""

    __tablename__ = "fantasy_listings"
    __table_args__ = (
        CheckConstraint("min_price IS NULL OR min_price >= 0", name="min_price_not_negative"),
        CheckConstraint(
            "(seller_participant_id IS NULL) = (market_day IS NOT NULL)", name="bank_has_day"
        ),
        CheckConstraint("resolved_at IS NULL OR cancelled_at IS NULL", name="one_ending"),
        CheckConstraint("closes_at > opened_at", name="closes_after_opening"),
        Index(
            "ux_fantasy_listings_one_open",
            "copy_id",
            unique=True,
            postgresql_where=text(OPEN_LISTING),
        ),
        Index(
            "ix_fantasy_listings_open_closes_at",
            "league_id",
            "closes_at",
            postgresql_where=text(OPEN_LISTING),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE")
    )
    copy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fantasy_copies.id", ondelete="CASCADE"))
    seller_participant_id: Mapped[uuid.UUID | None] = _participant_fk(nullable=True)
    min_price: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    market_day: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)


class FantasyBid(Base):
    """Puja en sobre cerrado. `updated_at` es la hora del último cambio y desempata."""

    __tablename__ = "fantasy_bids"
    __table_args__ = (
        UniqueConstraint("listing_id", "participant_id"),
        CheckConstraint("amount >= 0", name="amount_not_negative"),
        Index("ix_fantasy_bids_participant_id", "participant_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_listings.id", ondelete="CASCADE")
    )
    participant_id: Mapped[uuid.UUID] = _participant_fk()
    amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FantasySettledRound(Base):
    """Jornada cerrada: sus puntos, cobros y cambios de valor quedan congelados."""

    __tablename__ = "fantasy_settled_rounds"

    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE"), primary_key=True
    )
    match_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def _settled_round_fk() -> ForeignKeyConstraint:
    return ForeignKeyConstraint(
        ["league_id", "match_id"],
        ["fantasy_settled_rounds.league_id", "fantasy_settled_rounds.match_id"],
        ondelete="CASCADE",
    )


class FantasyRoundScore(Base):
    """Puntos congelados de un participante en una jornada cerrada, con el detalle por hueco."""

    __tablename__ = "fantasy_round_scores"
    __table_args__ = (_settled_round_fk(),)

    league_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    participant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fantasy_participants.id", ondelete="CASCADE"), primary_key=True
    )
    points: Mapped[int] = mapped_column(Integer)
    payout: Mapped[int] = mapped_column(Integer)
    negative_balance: Mapped[bool] = mapped_column(Boolean)
    # [{slot, copy_id, player_id, rating, goals, points}] en el orden de los huecos.
    slots: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)


class FantasyValueChange(Base):
    """Cambio de valor de un jugador al cerrar una jornada."""

    __tablename__ = "fantasy_value_changes"
    __table_args__ = (_settled_round_fk(),)

    league_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("players.id"), primary_key=True)
    before: Mapped[int] = mapped_column(Integer)
    after: Mapped[int] = mapped_column(Integer)
