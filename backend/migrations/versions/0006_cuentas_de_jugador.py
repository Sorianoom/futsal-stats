"""cuentas de jugador

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-07 15:31:42.637098

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "player_invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "expires_at > created_at", name=op.f("ck_player_invitations_expires_after_creation")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_player_invitations_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["player_id"],
            ["players.id"],
            name=op.f("fk_player_invitations_player_id_players"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_player_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_player_invitations_token_hash")),
    )
    op.create_index(
        op.f("ix_player_invitations_player_id"), "player_invitations", ["player_id"], unique=False
    )
    op.add_column("users", sa.Column("player_id", sa.UUID(), nullable=True))
    op.create_unique_constraint(op.f("uq_users_player_id"), "users", ["player_id"])
    op.create_foreign_key(
        op.f("fk_users_player_id_players"), "users", "players", ["player_id"], ["id"]
    )
    # Autogenerate no detecta CHECK nuevos en tablas existentes. La columna `role` no tiene CHECK
    # de valores (enum no nativo sin `create_constraint`), así que `player` no exige ampliarlo.
    op.create_check_constraint(
        op.f("ck_users_player_link_matches_role"),
        "users",
        "(role = 'player') = (player_id IS NOT NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("ck_users_player_link_matches_role"), "users", type_="check")
    # Sin la columna, una cuenta de jugador no tendría a quién pertenecer: se borran (sus sesiones
    # de refresco caen en cascada).
    op.execute("DELETE FROM users WHERE role = 'player'")
    op.drop_constraint(op.f("fk_users_player_id_players"), "users", type_="foreignkey")
    op.drop_constraint(op.f("uq_users_player_id"), "users", type_="unique")
    op.drop_column("users", "player_id")
    op.drop_index(op.f("ix_player_invitations_player_id"), table_name="player_invitations")
    op.drop_table("player_invitations")
