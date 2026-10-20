# Futsal Stats

## Stack (obligatorio)
- Frontend (`frontend/`): Next.js 16 con `output: 'export'` (estático), React 19, TypeScript, Tailwind v4, shadcn/ui.
- Paquetes: Yarn 4 con Corepack. NUNCA npm ni npx; usar `yarn` y `yarn dlx`.
- Backend (`backend/`): FastAPI, Python 3.13, SQLAlchemy async, Alembic, Pydantic.
- BD: PostgreSQL (Neon como Postgres gestionado; sin SDK propietario del proveedor).
- PWA: service worker y manifiesto propios, solo en producción.

## Dominio
- Reglamento de puntos y convocatorias: `docs/regimen-interno.pdf` (fuente de verdad).
- Plan por fases y decisiones cerradas: `docs/plan.md`.
- Uso principal: iPad en horizontal durante partidos; registro rápido y tolerante a cortes de red.
