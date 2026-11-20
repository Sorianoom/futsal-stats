"""Cuentas del Fantasy del cuerpo técnico (rol `fantasy`). Solo el entrenador principal.

Son cuentas aparte de las de partidos, sin ficha de jugador, para que el cuerpo técnico juegue al
Fantasy sin que nadie vea qué jugadores ficha. Se crean por invitación, como las de jugador.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter

from app.api.deps import HeadCoach, SessionDep
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.auth.invitations import hash_invitation_token, new_invitation_token
from app.db import invitations_repo
from app.db.refresh_sessions_repo import revoke_all_for_user
from app.schemas.fantasy_accounts import FantasyAccountOut, FantasyInvitationIn
from app.schemas.players import InvitationOut

router = APIRouter(prefix="/fantasy-accounts", tags=["fantasy"])


@router.get("", response_model=Envelope[list[FantasyAccountOut]])
async def list_accounts(session: SessionDep, _: HeadCoach) -> Envelope[list[FantasyAccountOut]]:
    accounts = await invitations_repo.active_fantasy_accounts(session)
    return ok([FantasyAccountOut.model_validate(a) for a in accounts])


@router.post("/invitation", response_model=Envelope[InvitationOut], status_code=201)
async def create_invitation(
    payload: FantasyInvitationIn, session: SessionDep, head_coach: HeadCoach
) -> Envelope[InvitationOut]:
    """Invitación de un solo uso. El token solo viaja en esta respuesta; en la BD queda su hash."""
    token = new_invitation_token()
    invitation = await invitations_repo.create_fantasy_invitation(
        session,
        payload.display_name,
        head_coach.id,
        hash_invitation_token(token),
        datetime.now(UTC),
    )
    await session.commit()
    return ok(InvitationOut(token=token, expires_at=invitation.expires_at))


@router.delete("/{user_id}", status_code=204)
async def deactivate_account(user_id: uuid.UUID, session: SessionDep, _: HeadCoach) -> None:
    """Desactiva la cuenta y cierra sus sesiones. Su equipo se queda en la liga, sin entrar."""
    user = await invitations_repo.get_fantasy_account(session, user_id)
    if user is None:
        raise ApiError(404, "not_found", "Cuenta no encontrada")
    user.is_active = False
    await revoke_all_for_user(session, user.id, datetime.now(UTC))
    await session.commit()
