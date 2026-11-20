"""Invitaciones de jugadores (y de las cuentas del Fantasy del cuerpo técnico) y su vínculo con
las cuentas. Flush aquí; el commit, en el endpoint."""

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.invitations import INVITATION_TTL
from app.db.models import Player, PlayerInvitation, User
from app.domain.roles import Role


async def lock_player(session: AsyncSession, player_id: uuid.UUID) -> Player | None:
    """Bloquea al jugador hasta el commit: dos invitaciones simultáneas no se pisan."""
    query = select(Player).where(Player.id == player_id).with_for_update()
    return (await session.execute(query)).scalar_one_or_none()


async def create_invitation(
    session: AsyncSession,
    player_id: uuid.UUID,
    created_by: uuid.UUID,
    token_hash: str,
    now: datetime,
) -> PlayerInvitation:
    """Crea la invitación y borra las anteriores sin usar del jugador: solo vale la última."""
    await session.execute(
        delete(PlayerInvitation).where(
            PlayerInvitation.player_id == player_id, PlayerInvitation.used_at.is_(None)
        )
    )
    invitation = PlayerInvitation(
        player_id=player_id,
        token_hash=token_hash,
        created_by=created_by,
        created_at=now,
        expires_at=now + INVITATION_TTL,
    )
    session.add(invitation)
    await session.flush()
    return invitation


async def claim_invitation(
    session: AsyncSession, token_hash: str, now: datetime
) -> PlayerInvitation | None:
    """Marca la invitación como usada si sigue vigente. Devuelve None si no existe, ya se usó o
    caducó.

    Es un UPDATE condicional: si dos transacciones la reclaman a la vez, la segunda espera al
    bloqueo de fila, vuelve a evaluar el WHERE tras el commit de la primera y no actualiza nada.
    """
    query = (
        update(PlayerInvitation)
        .where(
            PlayerInvitation.token_hash == token_hash,
            PlayerInvitation.used_at.is_(None),
            PlayerInvitation.expires_at > now,
        )
        .values(used_at=now)
        .returning(PlayerInvitation)
        .execution_options(synchronize_session=False)
    )
    return (await session.execute(query)).scalar_one_or_none()


async def delete_pending_invitations(session: AsyncSession, player_id: uuid.UUID) -> None:
    """Borra las invitaciones sin usar del jugador.

    Si otra transacción está reclamando una, el DELETE espera a su commit y, ya usada, la
    conserva: quien llame después ve la cuenta recién creada.
    """
    await session.execute(
        delete(PlayerInvitation).where(
            PlayerInvitation.player_id == player_id, PlayerInvitation.used_at.is_(None)
        )
    )
    await session.flush()


async def deactivate_player_user(session: AsyncSession, player_id: uuid.UUID) -> User | None:
    """Desactiva la cuenta vinculada al jugador, si la tiene, y la devuelve."""
    query = select(User).where(User.player_id == player_id)
    user = (await session.execute(query)).scalar_one_or_none()
    if user is not None:
        user.is_active = False
        await session.flush()
    return user


async def player_has_user(session: AsyncSession, player_id: uuid.UUID) -> bool:
    """Cualquier usuario vinculado, activo o no: un jugador solo puede tener una cuenta."""
    query = select(exists().where(User.player_id == player_id))
    return bool((await session.execute(query)).scalar())


async def players_with_active_account(
    session: AsyncSession, player_ids: Sequence[uuid.UUID]
) -> set[uuid.UUID]:
    """Los jugadores (de los dados) con una cuenta activa, en una sola consulta."""
    if not player_ids:
        return set()
    query = select(User.player_id).where(User.player_id.in_(player_ids), User.is_active.is_(True))
    return {player_id for player_id in (await session.execute(query)).scalars() if player_id}


async def create_fantasy_invitation(
    session: AsyncSession,
    display_name: str,
    created_by: uuid.UUID,
    token_hash: str,
    now: datetime,
) -> PlayerInvitation:
    """Invitación para una cuenta del Fantasy del cuerpo técnico, sin ficha de jugador."""
    invitation = PlayerInvitation(
        player_id=None,
        display_name=display_name,
        token_hash=token_hash,
        created_by=created_by,
        created_at=now,
        expires_at=now + INVITATION_TTL,
    )
    session.add(invitation)
    await session.flush()
    return invitation


async def active_fantasy_accounts(session: AsyncSession) -> list[User]:
    """Cuentas activas del Fantasy del cuerpo técnico, por antigüedad."""
    query = (
        select(User)
        .where(User.role == Role.FANTASY, User.is_active.is_(True))
        .order_by(User.created_at, User.id)
    )
    return list((await session.execute(query)).scalars().all())


async def get_fantasy_account(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    query = select(User).where(User.id == user_id, User.role == Role.FANTASY)
    return (await session.execute(query)).scalar_one_or_none()
