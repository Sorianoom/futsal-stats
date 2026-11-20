"""cuentas del Fantasy del cuerpo técnico

Invitaciones sin ficha de jugador: crean una cuenta `fantasy` (solo Fantasy, plantilla privada)
con el nombre que puso el entrenador. Las cuentas de partidos del cuerpo técnico dejan de jugar:
sus jugadores vuelven a la banca y salen de la liga (su historial cae en cascada).

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-20 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: str | Sequence[str] | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STAFF = "('head_coach', 'assistant_coach')"


def upgrade() -> None:
    op.add_column(
        "player_invitations", sa.Column("display_name", sa.String(length=40), nullable=True)
    )
    op.alter_column("player_invitations", "player_id", existing_type=sa.UUID(), nullable=True)
    op.create_check_constraint(
        op.f("ck_player_invitations_player_or_fantasy"),
        "player_invitations",
        "(player_id IS NULL) = (display_name IS NOT NULL)",
    )
    staff_participants = (
        "SELECT p.id FROM fantasy_participants p JOIN users u ON u.id = p.user_id "
        f"WHERE u.role IN {_STAFF}"
    )
    op.execute(
        "UPDATE fantasy_copies SET owner_id = NULL, acquired_at = NULL, clause = NULL "
        f"WHERE owner_id IN ({staff_participants})"
    )
    op.execute(f"DELETE FROM fantasy_participants WHERE id IN ({staff_participants})")


def downgrade() -> None:
    # Lo borrado de las cuentas de partidos del cuerpo técnico no se recupera: al volver a entrar
    # al Fantasy se dan de alta de nuevo, como un alta tardía.
    op.execute("DELETE FROM player_invitations WHERE player_id IS NULL")
    op.drop_constraint(
        op.f("ck_player_invitations_player_or_fantasy"), "player_invitations", type_="check"
    )
    op.alter_column("player_invitations", "player_id", existing_type=sa.UUID(), nullable=False)
    op.drop_column("player_invitations", "display_name")
