# Estado del proyecto

Traspaso entre sesiones y ordenadores. Se actualiza al terminar cada sesión de trabajo.
Última actualización: 2026-11-05 (nota por jugador subida a `main` en `5621d5b`).

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
  verde; el despliegue no se ha comprobado en producción. Alimentará el Fantasy (fase 12).
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

## Pendiente

- Decidir si se congelan las notas al cerrar un partido cuando exista el Fantasy.
- Caché en el detalle de estadísticas de un partido (`match-stats-view.tsx`).
- Limpieza de sesiones caducadas (borrado oportunista al hacer login o cron de Vercel).

## Decisiones tomadas

- Los cambios con migración van por PR, no por push directo a `main`: así un despliegue automático
  no ocurre antes de aplicar la migración. Sin migración se puede subir directo a `main`.
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
