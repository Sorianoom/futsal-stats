# Estado del proyecto

Traspaso entre sesiones y ordenadores. Se actualiza al terminar cada sesión de trabajo.
Última actualización: 2026-11-05 (tras fusionar las PR #8 y #9).

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

## Pendiente

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
