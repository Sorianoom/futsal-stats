# Plan: Futsal Stats

Fuente de verdad del reglamento: `docs/regimen-interno.pdf`. Stack en `CLAUDE.md`.

## Decisiones cerradas

1. Se convocan 2 porteros (además de 10 de campo).
2. Los titulares no pierden puntos; solo se marcan (los 4 con más puntos, según perfiles).
3. Los lesionados no entran en el ranking.
4. Las sanciones (no jugar, 1–2 partidos sin convocatoria) solo se proponen; el entrenador confirma.
5. 4 leves (−12) se suman a la grave (h, −5) = −17. La quinta leve no genera otra grave hasta completar otras 4.
6. Muy grave (c): −10 solo la semana siguiente.
7. Se añaden al catálogo las faltas muy graves sin letra (marcadas "sin letra en el PDF").
8. Llegar entre 5 y 15 min tarde a un entreno no tiene falta.
9. En la rotación de petos/material/agua entran todos los jugadores.

## Modelo de puntos

- Cada lunes todos arrancan con 20 puntos, pase lo que pase.
- Saldo semanal = 20 + movimientos con `applies_week` igual a esa semana.
- Los puntos ganados o perdidos no pasan a la semana siguiente. Solo lo hacen las faltas con efecto diferido, registradas hoy con `applies_week` = lunes siguiente (muy grave c, g y la i si es en partido).
- Semanas como `date` del lunes en Europe/Madrid.

## Arquitectura

- Eventos de partido como registro de solo añadir; deshacer = evento compensatorio (`voids_event_id`). Ids UUIDv7 del cliente; `POST /sync` con `ON CONFLICT DO NOTHING`.
- Tiempo en segundos enteros; la UI muestra minutos.
- Evento extra `gol_rival` (sin jugador) para goles en contra y marcador.
- Lógica de tramos y puntos duplicada en TS (cliente offline) y Python (autoritativa), probada con fixtures JSON compartidos (`shared/fixtures/`).
- "Sancionado" se deriva de exclusiones activas; `Player.status` guarda disponible/lesionado.
- Next 16 export estático: sin rutas dinámicas con id (`/partido?id=…`).
- Auth: JWT corto + refresh en cookie httpOnly, subdominios hermanos.
- Alembic por conexión directa/session pooler; la app por pooler de transacción (`statement_cache_size=0`, `prepared_statement_cache_size=0`).

## Fases

Cada fase: TDD, cobertura ≥ 80 %, revisión con `code-reviewer`, commit convencional.

0. **Andamiaje**: entorno (Python 3.13, uv, Corepack), `backend/` y `frontend/`, CI. Verifica: pytest, `yarn build`, `/health`.
1. **Lógica pura de tramos/minutos** (`backend/app/domain/stints/`): tramos, cambios, expulsión, solapes, minutos, quintetos, faltas por parte. Cobertura ≥ 95 %.
2. **Lógica pura de puntos/convocatoria** (`backend/app/domain/points/`): semana, saldo, reglas (4 leves → grave), diferidos, exclusiones, asistencia → falta propuesta, convocatoria (10 campo + 2 porteros + 4 titulares, empates marcados, desglose), rotación de petos.
3. **BD**: modelos, Alembic, seed del catálogo y reglas de asistencia, tests de integración.
4. **Auth, roles y plantilla**.
5. **API de puntos y partidos** + `POST /sync` idempotente.
6. **Frontend base y plantilla** (iPad horizontal).
7. **UI de puntos y convocatoria**.
8. **Partido en vivo** (con red): cronómetro, tramos, eventos, deshacer, quinteto, roja → falta (o).
9. **Offline-first**: IndexedDB, cola de sync, service worker, Wake Lock.
10. **Estadísticas y edición post-partido**.
11. **Despliegue y endurecimiento** (Vercel + Railway/Render; prueba en iPad real).

## Riesgos

- Safari/iOS puede limpiar IndexedDB o matar la pestaña: instalar como PWA y `navigator.storage.persist()`.
- Reloj en segundo plano: calcular por diferencia de marcas de tiempo.
- Divergencia TS/Python: fixtures compartidos.
- Entorno local (Python 3.12, sin uv/pip/yarn en PATH).

## Alojamiento de FastAPI

Recomendado: Railway o Render con instancia siempre activa (sin arranques en frío el día del partido). Vercel Functions: más simple pero con arranque en frío y límites. Verificar precios vigentes.
