"""nombre de usuario

Nombre visible de la cuenta (Fantasy y cabecera). Lo usan los entrenadores, que no tienen ficha de
jugador con nombre.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-19 23:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: Union[str, Sequence[str], None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "display_name")
