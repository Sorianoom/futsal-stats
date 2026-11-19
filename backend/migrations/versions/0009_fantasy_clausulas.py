"""fantasy clausulas

Cláusula de rescisión de cada copia con dueño y los movimientos de los clausulazos (paso 4).

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# INITIAL_PLAYER_VALUE y la cláusula de 1,5 × valor (app/domain/fantasy/rules.py).
INITIAL_PLAYER_VALUE = 4000
OLD_TRANSFER_KINDS = ("initial", "market", "bank_sale")
NEW_TRANSFER_KINDS = (*OLD_TRANSFER_KINDS, "clause")
OLD_LEDGER_KINDS = ("market_purchase", "market_sale", "bank_sale", "round_payout")
NEW_LEDGER_KINDS = (*OLD_LEDGER_KINDS, "clause_purchase", "clause_sale", "clause_raise")


def _replace_kind_check(table: str, kinds: tuple[str, ...]) -> None:
    name = op.f(f"ck_{table}_kind_valid")
    values = ", ".join(f"'{k}'" for k in kinds)
    op.drop_constraint(name, table, type_="check")
    op.create_check_constraint(name, table, f"kind IN ({values})")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("fantasy_copies", sa.Column("clause", sa.Integer(), nullable=True))
    # Las copias que ya tienen dueño: 1,5 × el valor actual del jugador (hacia abajo).
    op.execute(
        sa.text(
            "UPDATE fantasy_copies c SET clause = COALESCE(("
            "  SELECT v.value FROM fantasy_player_values v"
            "  WHERE v.league_id = c.league_id AND v.player_id = c.player_id"
            "), :initial) * 3 / 2 WHERE c.owner_id IS NOT NULL"
        ).bindparams(initial=INITIAL_PLAYER_VALUE)
    )
    op.create_check_constraint(
        op.f("ck_fantasy_copies_clause_iff_owned"),
        "fantasy_copies",
        "(owner_id IS NULL) = (clause IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_fantasy_copies_clause_not_negative"), "fantasy_copies", "clause >= 0"
    )
    _replace_kind_check("fantasy_transfers", NEW_TRANSFER_KINDS)
    _replace_kind_check("fantasy_ledger", NEW_LEDGER_KINDS)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM fantasy_ledger WHERE kind LIKE 'clause_%'")
    op.execute("DELETE FROM fantasy_transfers WHERE kind = 'clause'")
    _replace_kind_check("fantasy_ledger", OLD_LEDGER_KINDS)
    _replace_kind_check("fantasy_transfers", OLD_TRANSFER_KINDS)
    op.drop_constraint(
        op.f("ck_fantasy_copies_clause_not_negative"), "fantasy_copies", type_="check"
    )
    op.drop_constraint(op.f("ck_fantasy_copies_clause_iff_owned"), "fantasy_copies", type_="check")
    op.drop_column("fantasy_copies", "clause")
