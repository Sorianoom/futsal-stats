"""detalle del gol

Los goles (a favor y en contra) pueden llevar sus tipos (balón parado, segundo palo…) y el punto
de media pista desde el que se marcaron. Todo opcional: los goles ya anotados quedan sin detalle.

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-26 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0017"
down_revision: Union[str, Sequence[str], None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "match_events", sa.Column("goal_tags", postgresql.ARRAY(sa.String(32)), nullable=True)
    )
    op.add_column("match_events", sa.Column("goal_x", sa.SmallInteger(), nullable=True))
    op.add_column("match_events", sa.Column("goal_y", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_match_events_goal_point_complete"),
        "match_events",
        "(goal_x IS NULL) = (goal_y IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_match_events_goal_point_valid"),
        "match_events",
        "goal_x BETWEEN 0 AND 100 AND goal_y BETWEEN 0 AND 100",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_match_events_goal_point_valid"), "match_events", type_="check")
    op.drop_constraint(op.f("ck_match_events_goal_point_complete"), "match_events", type_="check")
    op.drop_column("match_events", "goal_y")
    op.drop_column("match_events", "goal_x")
    op.drop_column("match_events", "goal_tags")
