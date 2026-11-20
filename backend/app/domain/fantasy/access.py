"""Quién juega al Fantasy y qué plantillas son privadas, según el rol de la cuenta."""

from app.domain.roles import FANTASY_PLAYER_ROLES, Role


class SpectatorError(Exception):
    """Las cuentas de partidos del cuerpo técnico solo miran la clasificación: no tienen equipo."""


def plays_fantasy(role: Role) -> bool:
    return role in FANTASY_PLAYER_ROLES


def has_private_squad(role: Role) -> bool:
    """Cuentas del Fantasy del cuerpo técnico: nadie ve sus jugadores ni se los puede clausular, y
    ellas tampoco clausulan."""
    return role == Role.FANTASY


class PrivateSquadError(Exception):
    """Una cuenta con la plantilla privada no paga ni sube cláusulas: a ella no se las pagan."""


# Vendedor o comprador con la plantilla privada, visto por los demás.
ANONYMOUS_NAME = "Anónimo"
