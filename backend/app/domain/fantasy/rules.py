"""Números del reglamento del Fantasy (`docs/fantasy.md`), con nombre para poder ajustarlos.

El dinero se guarda en enteros de miles: 1000 = 1 M. Así no hay errores de coma flotante.
"""

from zoneinfo import ZoneInfo

MONEY_PER_MILLION = 1000

INITIAL_BALANCE = 20 * MONEY_PER_MILLION
# Valor de todos los jugadores mientras no haya mercado (paso 3: pasará a cambiar por jornada).
INITIAL_PLAYER_VALUE = 4 * MONEY_PER_MILLION

COPIES_PER_GOALKEEPER = 8
COPIES_PER_FIELD_PLAYER = 5
# Copias de jugadores de campo distintos que recibe cada participante al darse de alta.
INITIAL_FIELD_COPIES = 2

LINEUP_FIELD_SLOTS = 4

POINTS_PER_GOAL = 2
MIN_PLAYER_POINTS = 0

# Las alineaciones se bloquean a las 00:00 de esta zona del día del partido.
FANTASY_TIMEZONE = ZoneInfo("Europe/Madrid")
