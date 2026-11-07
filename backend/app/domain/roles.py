from enum import StrEnum


class Role(StrEnum):
    HEAD_COACH = "head_coach"
    ASSISTANT_COACH = "assistant_coach"
    # Cuenta de un jugador de la plantilla: solo ve estadísticas. Se crea por invitación.
    PLAYER = "player"


STAFF_ROLES = (Role.HEAD_COACH, Role.ASSISTANT_COACH)
