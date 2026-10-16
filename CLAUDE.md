# Futsal Stats

## Stack (obligatorio)
- Frontend (`frontend/`): Next.js 16 con `output: 'export'` (estático), React 19, TypeScript, Tailwind v4, shadcn/ui.
- Paquetes: Yarn 4 con Corepack. NUNCA npm ni npx; usar `yarn` y `yarn dlx`.
- Backend (`backend/`): FastAPI, Python 3.13, SQLAlchemy async, Alembic, Pydantic.
- BD: PostgreSQL (Supabase como Postgres gestionado; sin Supabase Auth ni SDK de Supabase).
- PWA: service worker y manifiesto propios, solo en producción.

## Dominio
- Reglamento de puntos y convocatorias: `docs/regimen-interno.pdf` (fuente de verdad).
- Uso principal: iPad en horizontal durante partidos; registro rápido y tolerante a cortes de red.
