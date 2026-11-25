"""inicio del partido

La alineación del Fantasy se bloquea al empezar el partido, no a las 00:00 de ese día. Los partidos
ya jugados toman como inicio la hora en que el servidor recibió el inicio de su 1ª parte.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-25 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0016"
down_revision: Union[str, Sequence[str], None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        """
        UPDATE matches m
        SET started_at = first.at
        FROM (
            SELECT match_id, min(created_at) AS at
            FROM lineup_events
            WHERE kind = 'part_started' AND (payload ->> 'part')::int = 1
            GROUP BY match_id
        ) AS first
        WHERE first.match_id = m.id
        """
    )


def downgrade() -> None:
    op.drop_column("matches", "started_at")
