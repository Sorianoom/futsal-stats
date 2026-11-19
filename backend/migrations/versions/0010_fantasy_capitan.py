"""fantasy capitan

Capitán opcional en cada alineación guardada: sus puntos de la jornada cuentan el doble.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-19 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "fantasy_lineups",
        sa.Column("captain_copy_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_fantasy_lineups_captain_copy_id_fantasy_copies",
        "fantasy_lineups",
        "fantasy_copies",
        ["captain_copy_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_fantasy_lineups_captain_copy_id_fantasy_copies", "fantasy_lineups", type_="foreignkey"
    )
    op.drop_column("fantasy_lineups", "captain_copy_id")
