"""cláusula tras compra

Las copias ya fichadas por mercado o clausulazo suben su cláusula a 1,25 × lo que pagó su dueño
actual, si es más que la que tienen (la regla nueva de `clause_after_purchase`). Nunca baja: el
dueño pudo haberla subido ya. Solo datos; no cambia el esquema.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-21 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0014"
down_revision: Union[str, Sequence[str], None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copia de `MAX_MONEY_AMOUNT` (1000 M, en miles) en el momento de escribir la migración.
MAX_MONEY_AMOUNT = 1_000_000


def upgrade() -> None:
    # Último fichaje de cada copia; solo cuenta si fue a su dueño actual.
    op.execute(
        f"""
        UPDATE fantasy_copies AS c
        SET clause = LEAST(t.price * 5 / 4, {MAX_MONEY_AMOUNT})
        FROM (
            SELECT DISTINCT ON (copy_id) copy_id, to_participant_id, price
            FROM fantasy_transfers
            ORDER BY copy_id, at DESC, id DESC
        ) AS t
        WHERE t.copy_id = c.id
          AND c.owner_id IS NOT NULL
          AND t.to_participant_id = c.owner_id
          AND LEAST(t.price * 5 / 4, {MAX_MONEY_AMOUNT}) > c.clause
        """
    )


def downgrade() -> None:
    # No se sabe qué cláusula tenía cada copia antes: se quedan como están.
    pass
