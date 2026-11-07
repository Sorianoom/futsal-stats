# Estado del proyecto

Traspaso entre sesiones y ordenadores. Se actualiza al terminar cada sesión de trabajo.
Última actualización: 2026-11-07 (limitador de login en la BD, en `main` con la migración 0005).

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
  - Cálculo en `backend/app/domain/rating/score.py`, con las tablas de pesos al principio.
    Base 6,0; gol +1,5; asistencia +0,7; robo +0,3; pérdida −0,3; falta −0,2; amarilla −0,5;
    roja −2,0. Campo: tiro sin gol +0,1 y ±0,3 por gol a favor o en contra en pista. Portero:
    parada +0,4, gol encajado −0,6 y portería a cero +1,0 (≥ 10 min sin encajar). Escala fija,
    limitada a 1–10, con un decimal. Sin nota con menos de 3 minutos o con el partido sin cerrar.
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

## Pendiente

- Comprobar en producción la nota, el botón «Parada» y la caché del detalle.
- Comprobar en producción que `x-real-ip` llega con la IP real y que el bloqueo funciona.
- Resto de la fase 12: cuentas para jugadores, separar datos internos de los públicos,
  plantillas, jornadas y clasificación.
- Decidir si se congelan las notas al cerrar un partido cuando exista el Fantasy.

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
