"""fantasy liga

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-11 12:36:22.098374

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Los partidos que ya existen pasan a ser oficiales (server_default).
    op.add_column(
        "matches",
        sa.Column("is_official", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )

    op.create_table(
        "fantasy_leagues",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_fantasy_leagues_created_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_leagues")),
    )
    # Único parcial: como mucho una liga activa.
    op.create_index(
        "ux_fantasy_leagues_one_active",
        "fantasy_leagues",
        ["is_active"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.create_table(
        "fantasy_participants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("balance", sa.Integer(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["league_id"],
            ["fantasy_leagues.id"],
            name=op.f("fk_fantasy_participants_league_id_fantasy_leagues"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_fantasy_participants_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_participants")),
        sa.UniqueConstraint(
            "league_id", "user_id", name=op.f("uq_fantasy_participants_league_id")
        ),
    )
    op.create_index(
        op.f("ix_fantasy_participants_user_id"), "fantasy_participants", ["user_id"], unique=False
    )

    op.create_table(
        "fantasy_copies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("copy_number", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=True),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(owner_id IS NULL) = (acquired_at IS NULL)",
            name=op.f("ck_fantasy_copies_acquired_iff_owned"),
        ),
        sa.CheckConstraint(
            "copy_number >= 1", name=op.f("ck_fantasy_copies_copy_number_positive")
        ),
        sa.ForeignKeyConstraint(
            ["league_id"],
            ["fantasy_leagues.id"],
            name=op.f("fk_fantasy_copies_league_id_fantasy_leagues"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["fantasy_participants.id"],
            name=op.f("fk_fantasy_copies_owner_id_fantasy_participants"),
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_fantasy_copies_player_id_players")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_copies")),
        sa.UniqueConstraint(
            "league_id", "player_id", "copy_number", name=op.f("uq_fantasy_copies_league_id")
        ),
        # Un dueño no repite jugador. Las copias de la banca (owner_id NULL) no chocan: en
        # Postgres los NULL son distintos en un UNIQUE, así que equivale a un único parcial.
        sa.UniqueConstraint("owner_id", "player_id", name=op.f("uq_fantasy_copies_owner_id")),
    )

    op.create_table(
        "fantasy_lineups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("participant_id", sa.UUID(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["participant_id"],
            ["fantasy_participants.id"],
            name=op.f("fk_fantasy_lineups_participant_id_fantasy_participants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_lineups")),
    )
    op.create_index(
        "ix_fantasy_lineups_participant_id_saved_at",
        "fantasy_lineups",
        ["participant_id", "saved_at"],
        unique=False,
    )

    op.create_table(
        "fantasy_lineup_slots",
        sa.Column("lineup_id", sa.UUID(), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("copy_id", sa.UUID(), nullable=True),
        # 0 = portero, 1-4 = campo.
        sa.CheckConstraint("slot BETWEEN 0 AND 4", name=op.f("ck_fantasy_lineup_slots_slot_valid")),
        sa.ForeignKeyConstraint(
            ["copy_id"],
            ["fantasy_copies.id"],
            name=op.f("fk_fantasy_lineup_slots_copy_id_fantasy_copies"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["lineup_id"],
            ["fantasy_lineups.id"],
            name=op.f("fk_fantasy_lineup_slots_lineup_id_fantasy_lineups"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("lineup_id", "slot", name=op.f("pk_fantasy_lineup_slots")),
        sa.UniqueConstraint(
            "lineup_id", "copy_id", name=op.f("uq_fantasy_lineup_slots_lineup_id")
        ),
    )
    op.create_index(
        op.f("ix_fantasy_lineup_slots_copy_id"), "fantasy_lineup_slots", ["copy_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_fantasy_lineup_slots_copy_id"), table_name="fantasy_lineup_slots")
    op.drop_table("fantasy_lineup_slots")
    op.drop_index("ix_fantasy_lineups_participant_id_saved_at", table_name="fantasy_lineups")
    op.drop_table("fantasy_lineups")
    op.drop_table("fantasy_copies")
    op.drop_index(op.f("ix_fantasy_participants_user_id"), table_name="fantasy_participants")
    op.drop_table("fantasy_participants")
    op.drop_index(
        "ux_fantasy_leagues_one_active",
        table_name="fantasy_leagues",
        postgresql_where=sa.text("is_active"),
    )
    op.drop_table("fantasy_leagues")
    op.drop_column("matches", "is_official")
