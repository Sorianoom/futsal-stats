from enum import StrEnum


class RevokeReason(StrEnum):
    """Por qué se cerró una sesión de refresco antes de caducar."""

    LOGOUT = "logout"  # el usuario cerró sesión
    REUSE = "reuse"  # se presentó un refresco ya rotado fuera de la ventana de gracia
    ADMIN = "admin"  # lo revocó a mano quien administra (iPad perdido, baja del cuerpo técnico)
