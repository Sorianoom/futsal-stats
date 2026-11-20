from enum import StrEnum


class Role(StrEnum):
    HEAD_COACH = "head_coach"
    ASSISTANT_COACH = "assistant_coach"
    # Cuenta de un jugador de la plantilla: solo ve estadísticas. Se crea por invitación.
    PLAYER = "player"
    # Cuenta del cuerpo técnico solo para jugar al Fantasy, con la plantilla privada: nadie ve
    # qué jugadores tiene ni se los puede clausular. Se crea por invitación, sin ficha.
    FANTASY = "fantasy"


STAFF_ROLES = (Role.HEAD_COACH, Role.ASSISTANT_COACH)
# Quien juega al Fantasy. El personal técnico solo mira la clasificación.
FANTASY_PLAYER_ROLES = (Role.PLAYER, Role.FANTASY)
