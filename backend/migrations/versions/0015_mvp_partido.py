"""mvp del partido

El entrenador elige el MVP de cada partido: suma puntos en el Fantasy.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-22 19:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0015"
down_revision: Union[str, Sequence[str], None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("mvp_player_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_matches_mvp_player_id_players"), "matches", "players", ["mvp_player_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_matches_mvp_player_id_players"), "matches", type_="foreignkey")
    op.drop_column("matches", "mvp_player_id")
