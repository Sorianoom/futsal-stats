"""Números del reglamento del Fantasy (`docs/fantasy.md`), con nombre para poder ajustarlos.

El dinero se guarda en enteros de miles: 1000 = 1 M. Así no hay errores de coma flotante.
"""

from zoneinfo import ZoneInfo

MONEY_PER_MILLION = 1000

INITIAL_BALANCE = 20 * MONEY_PER_MILLION
# Valor de todos los jugadores al empezar la liga (o al llegar al equipo a mitad de temporada).
INITIAL_PLAYER_VALUE = 4 * MONEY_PER_MILLION
# Tras cada jornada: 0,2 M × (puntos − 6); sin nota, −0,2 M. Nunca por debajo de 0,5 M.
VALUE_CHANGE_PER_POINT = MONEY_PER_MILLION // 5
VALUE_BASELINE_POINTS = 6
VALUE_CHANGE_WITHOUT_RATING = -(MONEY_PER_MILLION // 5)
MIN_PLAYER_VALUE = MONEY_PER_MILLION // 2
# Cobro de cada participante por jornada: 0,1 M por punto de su alineación.
PAYOUT_PER_POINT = MONEY_PER_MILLION // 10
# Vender a la banca paga este porcentaje del valor (redondeo hacia abajo).
BANK_SALE_PERCENT = 70
PERCENT = 100

COPIES_PER_GOALKEEPER = 8
COPIES_PER_FIELD_PLAYER = 5
# Copias de jugadores de campo distintos que recibe cada participante al darse de alta.
INITIAL_FIELD_COPIES = 2

LINEUP_FIELD_SLOTS = 4
# Plantilla máxima, sin dos copias del mismo jugador.
SQUAD_LIMIT = 7

# Mercado diario de la banca: 15 copias al día la primera semana de la liga y 8 después.
MARKET_FIRST_WEEK_DAYS = 7
MARKET_FIRST_WEEK_SIZE = 15
MARKET_DAILY_SIZE = 8
# Una copia puesta a la venta por un participante cierra a las 24 h.
LISTING_DURATION_HOURS = 24
# Tope de seguridad de pujas y precios mínimos: 1000 M.
MAX_MONEY_AMOUNT = 1000 * MONEY_PER_MILLION
# Movimientos que devuelve el historial de traspasos.
TRANSFERS_PAGE_SIZE = 50

POINTS_PER_GOAL = 2
MIN_PLAYER_POINTS = 0
# El capitán (opcional, cualquiera de los 5) multiplica sus puntos de la jornada, también los
# negativos si algún día los hay.
CAPTAIN_MULTIPLIER = 2

# Las alineaciones se bloquean a las 00:00 de esta zona del día del partido.
FANTASY_TIMEZONE = ZoneInfo("Europe/Madrid")

# Cláusula de rescisión: al fichar una copia vale 1,5 × su valor (redondeo hacia abajo). Subirla
# cuesta la mitad de la subida (redondeo hacia arriba).
CLAUSE_NUMERATOR = 3
CLAUSE_DENOMINATOR = 2
CLAUSE_RAISE_COST_DIVISOR = 2
# Al comprar una copia (mercado o clausulazo), la cláusula nunca queda por debajo de lo pagado:
# como poco, 1,25 × el precio (redondeo hacia abajo).
PAID_CLAUSE_NUMERATOR = 5
PAID_CLAUSE_DENOMINATOR = 4
# No se puede clausular una copia durante estos días desde que llegó a su dueño actual.
CLAUSE_PROTECTION_DAYS = 7
