"""fotos de jugadores

Una foto por jugador (la sube el entrenador principal). Se sirve por un enlace con token
aleatorio que cambia con cada foto.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-19 22:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, Sequence[str], None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "player_photos",
        sa.Column("player_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.Uuid(), nullable=False),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["player_id"],
            ["players.id"],
            name=op.f("fk_player_photos_player_id_players"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("player_id", name=op.f("pk_player_photos")),
        sa.UniqueConstraint("token", name=op.f("uq_player_photos_token")),
    )


def downgrade() -> None:
    op.drop_table("player_photos")
