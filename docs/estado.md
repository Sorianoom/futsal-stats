# Estado del proyecto

Traspaso entre sesiones y ordenadores. Se actualiza al terminar cada sesión de trabajo.
Última actualización: 2026-11-25. Todo subido: MVP (0015), nueva puntuación, bloqueo al empezar el
partido (0016) y jornada en la pista. 0014, 0015 y 0016 aplicadas en Neon el 2026-11-25.

## Hecho y en producción

- **Fase 11, sesiones de refresco** (PR #7): tabla `refresh_sessions` (migración 0004), `jti`
  rotativo con gracia de 2 h, revocación por reutilización, logout que revoca, adopción de
  refrescos antiguos sin `jti`, tope absoluto de sesión y
  `DELETE /auth/users/{id}/sessions` (solo entrenador principal).
- **Caché de lecturas en el frontend** (PR #7): `useApiQuery`, `lib/query-cache.ts`,
  `lib/queries.ts` (clave y petición de cada pestaña) y `CacheWarmer`, que precarga las pestañas
  al abrir sesión. La caché es solo de memoria y se vacía al perder la sesión.
- Migraciones 0003 (alias de jugador) y 0004 aplicadas en Neon a mano.
- **Región `fra1`** (PR #8): la función corre en Fráncfort, junto a Neon (`x-vercel-id` con `fra1`).
  Latencia de una llamada con BD: de 1,2 s a ~0,45 s en caliente; la primera tras un rato sin uso
  sigue tardando ~3 s (arranque en frío).
- **Nota de 1 a 10 por jugador y partido** (push directo a `main`, `5621d5b`, sin PR): tests en
  verde. Alimentará el Fantasy (fase 12).
  - Cálculo en `backend/app/domain/rating/score.py`, con las tablas de pesos al principio. Pesos
    recalibrados el 2026-11-25 (ver «En curso» y `docs/fantasy.md`). Se enseña limitada a 1–10,
    con un decimal. Sin nota con menos de 3 minutos o con el partido sin cerrar.
  - Solo usa lo que registra el segundo entrenador durante el partido. Nuevo evento `save`
    (parada): botón en la ficha del portero y botón directo en el panel si hay un solo portero en
    pista. Sin migración: `kind` es texto sin CHECK.
  - Sale como `rating` en `GET /matches/{id}/stats` y `saves` también en la temporada. La nota se
    calcula en cada consulta, sin guardarse: cambiar los pesos recalcula todos los partidos.
  - Portero = posición de su ficha, no el puesto en que jugó ese partido. Los partidos anteriores
    al botón no tienen paradas.
- **Caché del detalle de un partido** (push directo a `main`, `1c2f48f`): `matchStatsQuery(id)`
  con clave `stats:match:${id}`. Las escrituras del partido (`syncMatch`, `finalizeMatch` y las de
  tramos) invalidan su clave y la de temporada (`stats:season`) en la capa API, también si fallan.
  La invalidación es por clave: no impide cachear las respuestas en curso de otras pestañas.
- **Limpieza de sesiones caducadas** (push directo a `main`, `1c2f48f`): cada login borra, en otra
  transacción, las sesiones con `absolute_expires_at` anterior a hace 1 día
  (`EXPIRED_SESSION_RETENTION`), revocadas o no. Si falla, se registra y el login sigue. Sin
  migración: el índice ya estaba en la 0004.
- Ninguno de los despliegues de la nota, la caché del detalle y la limpieza se ha comprobado aún
  en producción.

- **Limitador de login en la BD** (push directo a `main`, sin PR; fase 12). Tests en verde.
  Migración 0005 aplicada en Neon a mano antes del push (según el usuario; no verificado desde aquí).
  - Tabla `login_failures` (`key_hash`, `failed_at`): un fallo por clave. Las claves son
    HMAC-SHA256 con `JWT_SECRET` de IP+email, IP y email, así que no hay IPs ni emails en claro.
    Rotar `JWT_SECRET` pone los contadores a cero.
  - Mismos límites que antes, en 5 minutos: 5 por IP+email, 30 por IP, 20 por email. Acertar
    limpia IP+email y email, no la IP. Cada fallo nuevo borra las filas que ya salieron de la
    ventana.
  - El fallo se confirma antes de responder 401. Peticiones simultáneas pueden pasar algún intento
    de más (se cuenta y luego se anota, sin bloqueo); se acepta.
  - IP del cliente: en Vercel (`VERCEL=1`, que Vercel define solo) se lee `x-real-ip`, que su proxy
    sobrescribe; fuera de Vercel se ignora y se usa la del socket. Antes se usaba siempre la del
    socket, que detrás del proxy podía ser compartida.
  - Desaparece el limitador en memoria (`LoginRateLimiter`, `LoginGuard`, `app.state.login_guard`).

- **Cronómetro y corrección en directo** (push directo a `main`, sin PR; sin migración). Tests en
  verde. En un partido real no se podían apuntar cambios: la propuesta de tiempo sumaba tiempo
  real (el marcador se para), se confirmaba adelantada y el suelo «No puede ser anterior al último
  movimiento» bloqueaba los cambios siguientes.
  - Reloj de cuenta atrás ▶/⏸ (`lib/match/stopwatch.ts`): se calcula por diferencia de horas y se
    guarda en localStorage por partido, así que aguanta recargas y segundo plano. Se para solo en
    0:00; la 2ª parte vuelve a la duración de la parte (20:00 por defecto, cambiable en
    «Ajustar»). «Ajustar» mueve ±1/±10 s o se teclea, hacia delante y hacia atrás.
  - Cada acción se anota con un toque y el tiempo del reloj. Si el reloj va por detrás de lo
    último anotado, se usa ese tiempo y se avisa: nunca se bloquea. Desaparecen el diálogo de
    tiempo y el botón ↓/↑.
  - Deshacer también cambios, expulsiones (con su roja) e inicio/fin de parte, como pila: evento
    `undo` con `voids_event_id` en la alineación, igual en Python y TS (fixture
    `shared/fixtures/lineup_undo.json`). `/sync` rechaza deshaceres inválidos y `finalize` ignora
    lo deshecho. Confirmación al terminar la parte y cambios múltiples con el mismo tiempo.
  - Sincronización: un rechazo concreto se quita y se avisa (el aviso sobrevive a recargas) sin
    bloquear; límite de espera de 15 s; red, límite, 409 simultáneo, 429, 5xx y respuestas rotas
    se reintentan cada 5 s, y un 4xx de validación cada 45 s. Solo `seq_conflict`/`id_conflict`
    (dos dispositivos) siguen pidiendo recargar.
  - Sin comprobar todavía en un partido real.

- **Arreglos del partido en vivo** (subido el 2026-11-22, `eefe97a`, sin migración):
  - `POST /matches/{id}/player-transfer` (staff): pasa a otro jugador todo lo de uno en ese
    partido (eventos, payloads de alineación, tramos y sanciones). 409 si el destino ya tiene
    datos. Botón «Traspasar estadísticas» en el partido; exige no tener nada sin enviar.
  - `DELETE /matches/{id}/stats` (entrenador principal): borra eventos, alineación, valoraciones
    y tramos; las sanciones se quedan. Botón «Borrar estadísticas»; también olvida el reloj local.
    Una jornada del Fantasy ya cerrada conserva sus puntos congelados.
  - Convocatoria del partido (solo en el dispositivo, `localStorage` `match-squad:{id}`): se
    confirma antes de los titulares; con ella, banquillo y descanso ofrecen solo a los convocados
    (también lesionados marcados a mano) y a quien ya jugó.
- **Móvil y jornada en juego** (subido el 2026-11-22, `d722817`, sin migración):
  - `GET /fantasy/me` trae `live_round`: la última jornada bloqueada con el partido sin cerrar
    (la de hoy). La franja la enseña como «En juego» encima de la próxima.
  - Pestaña **Jornadas** en el Fantasy: mis puntos por jornada; tocar una abre mi alineación.
  - Cabecera: en el móvil, con más de 3 secciones (entrenadores) van en un menú desplegable;
    cerrar sesión es un icono. Aviso «Instalar» (Chrome, `beforeinstallprompt`) o los pasos de
    Safari en iPhone/iPad; «Ahora no» lo calla 14 días.
  - Manifiesto con `orientation: any` (antes forzaba horizontal en los móviles), `id` e icono
    maskable; iconos regenerados desde `src/app/icon.svg` (el de 512 estaba descentrado).
- **Cláusula tras una compra cara** (subido el 2026-11-21, `c33ccdb`; migración 0014): al fichar en el mercado o por clausulazo,
  la cláusula es max(1,5 × valor, 1,25 × lo pagado). La **migración 0014** (solo datos) sube a esa
  regla las copias ya fichadas, según su último fichaje a su dueño actual; nunca baja una cláusula.
- **Equipo de los demás desde la clasificación** (subido el 2026-11-21, `c33ccdb`): tocar un nombre abre su
  plantilla y su alineación de la última jornada bloqueada. Ver `docs/fantasy.md`.
- **Cuentas del Fantasy del cuerpo técnico** (subido; 0012 y 0013 aplicadas en Neon el
  2026-11-20, después del push: el login dio 500 hasta aplicarlas). Reglas en `docs/fantasy.md`, «Participantes y cuentas».
  - Rol `fantasy` (sin ficha). Plantilla → «Cuentas del Fantasy del cuerpo técnico»: invitar con
    un nombre (`POST /fantasy-accounts/invitation`), listar y quitar. La invitación usa la misma
    tabla y la misma página `/invitacion` (`player_invitations.player_id` pasa a admitir NULL, con
    `display_name`).
  - Las cuentas de partidos del cuerpo técnico solo miran: `GET /fantasy/me` devuelve
    `{league, spectator: true}`, la clasificación funciona y el resto da 403 `spectator`. La 0013
    devuelve a la banca sus copias y las saca de la liga (su historial cae en cascada).
  - Plantilla privada: fuera de Cláusulas (404 al clausularlas), 403 `private_squad` si clausulan o
    suben cláusula, fichajes ocultos a los demás y vendedor «Anónimo» en el mercado.
  - Probado en el navegador contra la API local: invitar a «Bruno», crear la cuenta, plantilla
    privada y la cuenta del entrenador viendo solo la clasificación.

- **Diseño D del Fantasy, colores del club** (subido el 2026-11-20, `730a277`, sin migración).
  Prototipos y elección en https://claude.ai/artifact/UPKR81LBEVNWziBKReaZDP (fila D) y prototipo
  funcional en https://claude.ai/artifact/224cNNKTBaoRyQ3FfJQMQK.
  - Mientras se ve el Fantasy, `<html>` lleva `fantasy` (y `dark` en oscuro): paleta azul y
    amarillo en `globals.css` (`html.fantasy`, `html.fantasy.dark`). Modo: el del móvil o el
    botón sol/luna (`useFantasyTheme`, guardado en `futsal:fantasy:theme`).
  - Franja a rayas del escudo con la próxima jornada (`RoundTicker`), pista 1-2-1 (pívot, alas,
    cierre y portero: `FIELD_ROLES`), fichas con color según la forma, barritas de las últimas
    jornadas (`Spark`), «en racha» arriba del mercado (más puntos en 3 jornadas), filtros del
    mercado, podio y gráfica de la temporada en la Liga.
  - API: `recent_points` (últimas 5 jornadas puntuadas) en plantilla, mercado y cláusulas.
- **Nombre de los entrenadores en el Fantasy** (subido el 2026-11-19, `28265fb`; migración 0012
  aplicada en Neon el 2026-11-20).
  - `users.display_name` (40 caracteres, opcional). `PATCH /auth/me` lo pone o quita; solo el
    personal técnico (un jugador usa el nombre de su ficha).
  - En el Fantasy, los entrenadores tienen el botón «Tu nombre: …» junto a «Cómo se juega».
  - Orden del nombre visible: el que puso el usuario, el de su ficha de jugador, el email antes de `@`.
- **Fotos de jugadores y alineación con fichas** (subido el 2026-11-19, migración 0011 aplicada):
  - El entrenador principal toca el círculo del dorsal en Plantilla → «Elegir foto». El navegador
    la recorta en cuadrado (384 px, WebP) y la sube; se guarda en `player_photos` y se sirve en
    `/player-photos/{token}` (token aleatorio que cambia con cada foto, caché del navegador).
  - La foto sale en Plantilla, en la pista, en los sobres, en la plantilla del Fantasy, en el
    mercado y en las cláusulas (`PlayerAvatar`).
  - Alineación: prototipo B elegido por el usuario
    (https://claude.ai/artifact/2UYXPDXGS279zqsu26sV9V). Pista con fichas; al tocar un hueco
    sale una hoja abajo con fichas grandes, «Hacer capitán» y «Dejar vacío».
- **Listo para compartir** (subido el 2026-11-19, sin migración):
  - Mercado: en un jugador que ya tienes pone «Ya lo tienes» en vez de «Pujar».
  - Botón «Cómo se juega» en el Fantasy (`rules-dialog.tsx`): reglas en corto. Si cambian los
    números de `rules.py`, actualizar también este texto.
  - Vista previa al compartir el enlace (WhatsApp, etc.): `src/app/opengraph-image.png` (fuente
    HTML en el historial de la sesión) y `openGraph` en `layout.tsx`. Next completa la URL absoluta
    con `VERCEL_PROJECT_PRODUCTION_URL` en Vercel.
- **Fantasy, paso 5: capitán, diseño nuevo y jugadores solo con el Fantasy** (subido el
  2026-11-19, migración 0010 aplicada en Neon).
  - Capitán opcional que puntúa doble (reglas en `docs/fantasy.md`, sección «Capitán»).
  - La cuenta de jugador ve el Fantasy (ahora su inicio) y «Estadísticas» con los datos de todos
    (decidido el 2026-11-19); el resto de pantallas le devuelven al Fantasy.
  - Sobres de bienvenida (`pack-opening.tsx`): la primera vez que alguien entra al Fantasy abre un
    sobre por cada jugador de su plantilla (tiembla, se rompe y gira la carta; sin animación con
    «reducir movimiento»). Se recuerda por participante en localStorage: en otro dispositivo
    vuelven a salir una vez.
  - Diseño (https://claude.ai/artifact/WdFLa1Zx4AKCmxuubzBnKT): saldo en tarjeta oscura, próxima
    jornada con su fecha, alineación sobre una pista con los puntos de la última jornada de cada
    jugador y la C de capitán, y en el móvil las secciones en una barra fija abajo.
- **Rechazo de un cambio con cambios posteriores** (subido el 2026-11-19, sin migración; fue con el
  push del Fantasy). Si el servidor rechaza un movimiento de alineación, `dropRejected` (`outbox.ts`)
  quita también los movimientos pendientes que sin él ya no son posibles (p. ej. sacar a quien no
  llegó a entrar), en cadena, y sus deshacer. Lo ya aceptado por el servidor no se toca. Salen en
  el aviso como «dependía de algo rechazado».
- **Fantasy, paso 4: cláusulas** (subido el 2026-11-19, migración
  0009 aplicada en Neon).
  - Reglas de detalle acordadas el 2026-11-19: `docs/fantasy.md`, sección «Detalles de las
    cláusulas». Contrato de la API: `docs/fantasy-api-paso4.md`.
  - Cada copia con dueño guarda su cláusula (la 0009 la rellena con 1,5 × el valor actual).
    Clausulazo inmediato bajo el bloqueo de la liga; anula la venta de la copia si la había.
  - Pantalla: pestaña «Cláusulas» (copias de los demás, protección y aviso de día de partido),
    cláusula y «Subir cláusula» en mi plantilla, y «Clausulazo» en los fichajes.
  - Probado en el navegador contra la API local (clausulazo, subir cláusula y fichajes). Salieron
    y se arreglaron tres cosas: el resumen leía `team_value`/`squad_limit` fuera de `me` («NaN M» y
    «2/undefined», fallo del paso 3 que los tests no veían por el fixture); la lista de cláusulas
    no se recargaba tras clausular; y ahora la lista avisa antes de abrir el diálogo si ya tengo
    ese jugador («Ya lo tienes en tu plantilla») o la plantilla está llena.
  - Arreglado de paso un test intermitente del mercado (`changed_owner`): la copia elegida podía
    ser de un jugador que el otro ya tenía. Probablemente era el fallo sin identificar del backend.
- **Fantasy, paso 3: mercado** (subido el 2026-11-19, migración 0008
  aplicada en Neon).
  - Reglas de detalle decididas por defecto (cierre de jornada al día siguiente y congelado,
    propiedad en el bloqueo, pujas sin reserva de dinero): `docs/fantasy.md`, sección «Detalles
    del mercado y cierre de jornada». Contrato de la API: `docs/fantasy-api-paso3.md`.
  - Tablas nuevas: valores por jugador, traspasos (historial de propiedad), movimientos de saldo,
    ventas, pujas, jornadas cerradas con sus puntos por participante y cambios de valor.
  - Sin cron: al entrar en cualquier ruta del Fantasy se procesa lo vencido (ventas cerradas,
    jornadas por cerrar, mercado de la banca de hoy) bloqueando la fila de la liga.
  - Revisión de código: sin CRITICAL ni HIGH; los MEDIUM y LOW arreglados (reparto de copias en
    venta, bloqueo con un partido incoherente, caché de jornadas por prefijo, precio real tras
    vender a la banca, saldo recargado tras pujar). Backend 891 tests, frontend 950.
- **Fantasy, paso 2: liga, alineaciones, puntos y clasificación** (push directo a `main`,
  `2fc0f88`; migración 0007 aplicada en Neon según el usuario, no verificado desde aquí).
  - Partidos con `is_official` (por defecto sí; `PATCH /matches/{id}`); solo los oficiales son
    jornadas. Casilla «Amistoso» al crear y botón en el detalle de estadísticas.
  - Rutas `/fantasy/*` para todos los roles salvo `POST /fantasy/league` (entrenador principal).
    Dominio puro en `backend/app/domain/fantasy/`, orquestación en `backend/app/services/`.
- **Fantasy, paso 1: cuentas de jugador** (push directo a `main`, `dfafb11`; migración 0006
  aplicada en Neon antes). Revisión de seguridad sin hallazgos graves (arreglos menores hechos).
  - Reglamento completo del Fantasy, acordado regla a regla: `docs/fantasy.md`.
  - Rol `player` vinculado a un jugador (`users.player_id`, único; CHECK rol ↔ vínculo).
  - `CurrentUser` = solo personal técnico; `AnyUser` (también jugadores) solo en `GET /auth/me`,
    `GET /matches`, `GET /matches/{id}/stats` y `GET /stats/players`. Un test recorre todas las
    rutas del esquema OpenAPI con un token de jugador: una ruta nueva queda cerrada por defecto.
  - Al jugador se le vacían `quintets` y `warnings` en las estadísticas del partido; ve las notas.
  - Invitación: `POST /players/{id}/invitation` (entrenador principal; 409 `already_has_account` o
    `player_inactive`) y `POST /auth/invitations/accept` (sin sesión; 400 `invalid_invitation`, 409
    `email_taken`, 422 `weak_password`, 429 tras 10 fallos por IP en 5 min). Token de 256 bits,
    solo se guarda su sha256, un solo uso, 7 días. Enlace `/invitacion/#token=…`; la página lo
    borra de la barra de direcciones.
  - Dar de baja a un jugador desactiva su cuenta, revoca sus sesiones y borra sus invitaciones.
    No hay forma de reactivar a un jugador ni su cuenta (tampoco había reactivación antes).
  - Frontend: el jugador solo ve «Estadísticas»; las pantallas de entrenador le redirigen allí.

## En curso

- **Pestaña Jornadas con la pista** (2026-11-25). Antes la pista solo salía al tocar una jornada,
  en un diálogo, y no se veía. Ahora la pestaña enseña directamente la última jornada con puntos
  en la pista (porqué al tocar y equipos de los demás) y arriba una fila de jornadas para cambiar.
  La clasificación sigue abriendo el diálogo.
- **Acción clave** (2026-11-25, sin migración: el tipo de evento es texto sin CHECK). Nuevo botón
  «Acción clave» en la ficha del jugador durante el partido (balón salvado bajo la línea,
  recuperación en una contra…): +0,2 en la nota de cualquier jugador. Columna «AC» en las tablas
  de estadísticas y línea en el porqué de la jornada.
- **Jornada en la pista con el porqué** (subido el 2026-11-25, sin migración). Mi equipo ya no
  enseña puntos ni colores de forma; la jornada se ve en la pista (`FantasyPitch`, compartida) y
  al tocar una ficha sale el desglose (`rating_breakdown`, `bonus_parts`, guardados en el hueco
  congelado). Sin probar en el navegador.
- **Bloqueo del Fantasy al empezar el partido** (subido el 2026-11-25; migración 0016 aplicada). Quejas:
  el 22-nov cambiaron la alineación por la mañana y no contó, porque se bloqueaba a las 00:00. En
  producción: empezó a las 17:39:48 y entre las 00:00 y esa hora hubo 6 alineaciones de 5
  participantes, un fichaje (00:12) y una venta a la banca (14:34) que no contaron.
  - `matches.started_at`: lo pone `/sync` la primera vez que recibe `part_started` de la 1ª parte;
    la 0016 lo rellena con el `created_at` de ese evento en los partidos ya jugados. Bloqueo =
    `min(started_at, 00:00 del día siguiente)` (`calendar.lock_time(round)`).
  - Ver lo que alineó cada uno en una jornada bloqueada: `GET /fantasy/rounds/{id}/participants/{pid}`
    y, en el diálogo de la jornada, «Equipos de esta jornada». También para las cuentas que solo
    miran. Plantillas privadas: 403 `private_squad`.
  - `resettle-round` (CLI, `app/services/fantasy_resettle.py`): reabre y vuelve a cerrar la última
    jornada cerrada. Simulacro (solo lectura) del 22-nov con el bloqueo a las 17:39 y la fórmula
    nueva: cambian casi todos, p. ej. 11 → 37, 13 → 22, 32 → 28.
  - 0016 rellenó el 22-nov con 17:39:48 (hora de Madrid). Jornada del 22-nov recalculada en
    producción el 2026-11-25 (p. ej. 11 → 37, 13 → 22, 32 → 28), sin MVP. Si se elige su MVP,
    hay que volver a lanzar `resettle-round 2026-11-22`.
- **Recalibrado de la nota y los puntos** (subido el 2026-11-25, sin migración). Analizado con
  el único partido con datos (22-nov, 5-5): el portero, con 17 paradas y gol, quedaba por debajo
  de un goleador; un partido sin nada daba 6. Escala acordada: flojo ≈ 5, normal ≈ 7, bueno ≈ 9,
  partidazo más. Nuevos pesos en `docs/fantasy.md`: base 5,4; gol +2,5 (portero +5,0); falta −0,4;
  ±0,15 por gol en pista; portero −0,4 por encajado; +0,3 por cada 10 min en pista sin gol en
  contra (`clean_streaks_by_player`, sustituye a la portería a cero). Fantasy: puntuación exacta
  sin tope y +2 MVP; el gol ya no suma aparte (decidido para que no cuente dos veces). `GET /matches/{id}/stats` añade `score` (exacta). La nota se
  calcula al momento: cambia también la del 22-nov; si su jornada ya se cerró, sus puntos del
  Fantasy siguen congelados. Revisar los pesos con 3-4 partidos más.
- **MVP del partido** (subido el 2026-11-25; migración 0015 aplicada): `matches.mvp_player_id`; +2 en el Fantasy. Ver `docs/fantasy.md`. Las opciones del
  partido (convocatoria, MVP, traspasar, borrar) van en un menú ⋯.
  Tests en verde el 2026-11-25 (backend 1027, frontend 1135, typecheck). Falta: tests propios
  de `mvp-dialog.tsx` y `match-options-menu.tsx`, probarlo en el navegador.

## Pendiente

- Comprobar en producción la nota, el botón «Parada» y la caché del detalle.
- Comprobar en producción que `x-real-ip` llega con la IP real y que el bloqueo funciona.
- Comprobar en producción el Fantasy (pasos 2 a 5): invitación, sobres, alineación con capitán,
  pujas, cláusulas y el cierre de la primera jornada oficial.
- Comprobar en un partido real lo del 22-nov: convocatoria al empezar, traspasar y borrar
  estadísticas (el primer partido tenía minutos mal cogidos, p. ej. 40 min).
- Comprobar la vista previa del enlace en WhatsApp (puede tardar por la caché de WhatsApp).
- Cambiar la contraseña de `neondb_owner` en Neon: se escribió en claro en un comando (historial
  de zsh). Para migrar, poner `DIRECT_DATABASE_URL` en `backend/.env` en vez de en el comando.
- Un test del frontend falló una vez bajo carga y pasó en las tres repeticiones siguientes; no se
  identificó cuál. Vigilar si vuelve a fallar.

## Decisiones tomadas

- Se sube directo a `main`, sin PR. Si hay migración nueva, se aplica en Neon antes del push: el
  push despliega solo y el código nuevo fallaría sin la tabla.
- Antes de desplegar código con migración nueva: `alembic upgrade head` contra Neon con la
  conexión directa (host sin `-pooler`).
- El token de acceso ya emitido sigue valiendo hasta caducar (15 min) tras revocar sesiones.

## No volver a intentar

- Medir las previews de Vercel con `curl`: están tras la protección de Vercel y devuelven 302/401
  en ~0,1 s sin llegar a la app.

## Entorno en un ordenador nuevo

Fuera de git, hay que recrearlo: `backend/.env` (`JWT_SECRET`, `COOKIE_SECURE`), Docker con
`docker compose up -d db`, `uv` y Corepack (`yarn`). Los tests de integración usan la base
`futsal_test` en el puerto 54329.

- Node 26 ya no trae Corepack: `mise.toml` fija Node 24 en el proyecto (`mise install`) y luego
  `corepack enable --install-directory "$(dirname "$(which node)")"`.
- En un checkout nuevo, `yarn typecheck` falla con `LayoutProps` hasta ejecutar `yarn next typegen`.
- `yarn build` exige `NEXT_PUBLIC_API_URL` con https.
