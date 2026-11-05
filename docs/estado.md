# Estado del proyecto

Traspaso entre sesiones y ordenadores. Se actualiza al terminar cada sesión de trabajo.
Última actualización: 2026-11-05.

## Hecho y en producción

- **Fase 11, sesiones de refresco** (PR #7): tabla `refresh_sessions` (migración 0004), `jti`
  rotativo con gracia de 2 h, revocación por reutilización, logout que revoca, adopción de
  refrescos antiguos sin `jti`, tope absoluto de sesión y
  `DELETE /auth/users/{id}/sessions` (solo entrenador principal).
- **Caché de lecturas en el frontend** (PR #7): `useApiQuery`, `lib/query-cache.ts`,
  `lib/queries.ts` (clave y petición de cada pestaña) y `CacheWarmer`, que precarga las pestañas
  al abrir sesión. La caché es solo de memoria y se vacía al perder la sesión.
- Migraciones 0003 (alias de jugador) y 0004 aplicadas en Neon a mano.

## Pendiente

- **PR #8**: `"regions": ["fra1"]` en `vercel.json`. La función corría en `iad1` (Washington) con
  Neon en Fráncfort. Abierta, sin fusionar. Tras fusionarla: comprobar que `x-vercel-id` de
  `/api/health` salga con `fra1` y repetir la medición de latencia.
  Antes de ella: `/api/health` 0,2-0,5 s; una llamada con BD 1,2 s en caliente y 2,7 s en frío.
- **Puntuación de 1 a 10 por jugador** (encaja con la fase 12): sin diseñar. Faltan decisiones:
  - si es informativa o alimenta el Fantasy;
  - pesos de goles, asistencias, robos, pérdidas, faltas y tarjetas;
  - porteros (no se registran paradas ni goles encajados);
  - tratamiento de minutos bajos o cero;
  - escala fija o relativa al partido.

  Datos disponibles por jugador: segundos, goles, asistencias, tiros, pérdidas, robos, faltas,
  amarillas, rojas y partidos jugados. Propuesta: módulo puro en `backend/app/domain/` con tests.
- Caché en el detalle de estadísticas de un partido (`match-stats-view.tsx`).
- Limpieza de sesiones caducadas (borrado oportunista al hacer login o cron de Vercel).

## Decisiones tomadas

- Los cambios van por PR, no por push directo a `main`: así un despliegue automático no ocurre
  antes de aplicar la migración.
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
