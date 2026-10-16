"""esquema inicial

Revision ID: 0001
Revises:
Create Date: 2026-10-16 20:43:34.874006

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Necesaria para la restricción de exclusión de tramos solapados (stints_no_overlap).
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=300), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_app_settings")),
    )
    op.create_table(
        "infractions",
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column(
            "severity",
            sa.Enum(
                "light", "serious", "very_serious", name="severity", native_enum=False, length=32
            ),
            nullable=False,
        ),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=False),
        sa.Column(
            "deferral",
            sa.Enum(
                "none",
                "next_week",
                "next_week_if_in_match",
                name="deferral",
                native_enum=False,
                length=32,
            ),
            server_default="none",
            nullable=False,
        ),
        sa.Column(
            "sanction_kind",
            sa.Enum("no_play", "no_callup", name="sanctionkind", native_enum=False, length=32),
            nullable=True,
        ),
        sa.Column("sanction_min_matches", sa.Integer(), nullable=True),
        sa.Column("sanction_max_matches", sa.Integer(), nullable=True),
        sa.Column("in_pdf_letter", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint(
            "(sanction_kind IS NULL) = (sanction_min_matches IS NULL) AND (sanction_kind IS NULL) = (sanction_max_matches IS NULL)",
            name=op.f("ck_infractions_sanction_all_or_nothing"),
        ),
        sa.CheckConstraint("points <= 0", name=op.f("ck_infractions_points_not_positive")),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_infractions")),
    )
    op.create_table(
        "players",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("dorsal", sa.Integer(), nullable=False),
        sa.Column(
            "position",
            sa.Enum("field", "goalkeeper", name="position", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("available", "injured", name="playerstatus", native_enum=False, length=32),
            server_default="available",
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_players")),
        sa.UniqueConstraint("dorsal", name=op.f("uq_players_dorsal")),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "training",
                "match",
                "physio",
                "other",
                name="sessionkind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("held_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(length=300), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("head_coach", "assistant_coach", name="role", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "attendance",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "attended",
                "justified",
                "unjustified",
                "late",
                name="attendancestatus",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("notified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("minutes_late", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint(
            "minutes_late >= 0", name=op.f("ck_attendance_minutes_late_not_negative")
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_attendance_player_id_players")
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name=op.f("fk_attendance_session_id_sessions")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attendance")),
        sa.UniqueConstraint("session_id", "player_id", name=op.f("uq_attendance_session_id")),
    )
    op.create_table(
        "attendance_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "session_kind",
            sa.Enum(
                "training",
                "match",
                "physio",
                "other",
                name="sessionkind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "attended",
                "justified",
                "unjustified",
                "late",
                name="attendancestatus",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("notified", sa.Boolean(), nullable=False),
        sa.Column("infraction_code", sa.String(length=16), nullable=False),
        sa.Column("late_more_than", sa.Integer(), nullable=True),
        sa.Column(
            "sanction_kind",
            sa.Enum("no_play", "no_callup", name="sanctionkind", native_enum=False, length=32),
            nullable=True,
        ),
        sa.Column("sanction_min_matches", sa.Integer(), nullable=True),
        sa.Column("sanction_max_matches", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["infraction_code"],
            ["infractions.code"],
            name=op.f("fk_attendance_rules_infraction_code_infractions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attendance_rules")),
        sa.UniqueConstraint("position", name=op.f("uq_attendance_rules_position")),
    )
    op.create_table(
        "matches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("opponent", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name=op.f("fk_matches_session_id_sessions")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_matches")),
        sa.UniqueConstraint("session_id", name=op.f("uq_matches_session_id")),
    )
    op.create_table(
        "movements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("applies_week", sa.Date(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("infraction_code", sa.String(length=16), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "extract(isodow from applies_week) = 1",
            name=op.f("ck_movements_applies_week_is_monday"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_movements_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["infraction_code"],
            ["infractions.code"],
            name=op.f("fk_movements_infraction_code_infractions"),
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_movements_player_id_players")
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name=op.f("fk_movements_session_id_sessions")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movements")),
    )
    op.create_index(op.f("ix_movements_applies_week"), "movements", ["applies_week"], unique=False)
    op.create_table(
        "exclusions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("no_play", "no_callup", name="sanctionkind", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name=op.f("fk_exclusions_match_id_matches")
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_exclusions_player_id_players")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exclusions")),
        sa.UniqueConstraint("player_id", "match_id", "kind", name=op.f("uq_exclusions_player_id")),
    )
    op.create_table(
        "lineup_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column(
            "payload",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name=op.f("fk_lineup_events_match_id_matches")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lineup_events")),
        sa.UniqueConstraint("match_id", "seq", name=op.f("uq_lineup_events_match_id")),
    )
    op.create_index(op.f("ix_lineup_events_match_id"), "lineup_events", ["match_id"], unique=False)
    op.create_table(
        "match_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "goal",
                "assist",
                "shot",
                "turnover",
                "steal",
                "foul",
                "yellow",
                "red",
                "rival_goal",
                "undo",
                name="eventkind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("part", sa.Integer(), nullable=False),
        sa.Column("t", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=True),
        sa.Column("voids_event_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("part IN (1, 2)", name=op.f("ck_match_events_part_valid")),
        sa.CheckConstraint("t >= 0", name=op.f("ck_match_events_t_not_negative")),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name=op.f("fk_match_events_match_id_matches")
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_match_events_player_id_players")
        ),
        sa.ForeignKeyConstraint(
            ["voids_event_id"],
            ["match_events.id"],
            name=op.f("fk_match_events_voids_event_id_match_events"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_match_events")),
        sa.UniqueConstraint("match_id", "seq", name=op.f("uq_match_events_match_id")),
    )
    op.create_index(op.f("ix_match_events_match_id"), "match_events", ["match_id"], unique=False)
    op.create_table(
        "quintet_ratings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("part", sa.Integer(), nullable=False),
        sa.Column("t", sa.Integer(), nullable=False),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("part IN (1, 2)", name=op.f("ck_quintet_ratings_part_valid")),
        sa.CheckConstraint("stars BETWEEN 1 AND 5", name=op.f("ck_quintet_ratings_stars_valid")),
        sa.CheckConstraint("t >= 0", name=op.f("ck_quintet_ratings_t_not_negative")),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name=op.f("fk_quintet_ratings_match_id_matches")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quintet_ratings")),
    )
    op.create_index(
        op.f("ix_quintet_ratings_match_id"), "quintet_ratings", ["match_id"], unique=False
    )
    op.create_table(
        "stints",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("part", sa.Integer(), nullable=False),
        sa.Column("start_s", sa.Integer(), nullable=False),
        sa.Column("end_s", sa.Integer(), nullable=False),
        postgresql.ExcludeConstraint(
            (sa.column("match_id"), "="),
            (sa.column("player_id"), "="),
            (sa.column("part"), "="),
            (sa.text("int4range(start_s, end_s)"), "&&"),
            using="gist",
            name="stints_no_overlap",
        ),
        sa.CheckConstraint("end_s > start_s", name=op.f("ck_stints_end_after_start")),
        sa.CheckConstraint("part IN (1, 2)", name=op.f("ck_stints_part_valid")),
        sa.CheckConstraint("start_s >= 0", name=op.f("ck_stints_start_not_negative")),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name=op.f("fk_stints_match_id_matches")
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_stints_player_id_players")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stints")),
    )
    op.create_index(op.f("ix_stints_match_id"), "stints", ["match_id"], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f("ix_stints_match_id"), table_name="stints")
    op.drop_table("stints")
    op.drop_index(op.f("ix_quintet_ratings_match_id"), table_name="quintet_ratings")
    op.drop_table("quintet_ratings")
    op.drop_index(op.f("ix_match_events_match_id"), table_name="match_events")
    op.drop_table("match_events")
    op.drop_index(op.f("ix_lineup_events_match_id"), table_name="lineup_events")
    op.drop_table("lineup_events")
    op.drop_table("exclusions")
    op.drop_index(op.f("ix_movements_applies_week"), table_name="movements")
    op.drop_table("movements")
    op.drop_table("matches")
    op.drop_table("attendance_rules")
    op.drop_table("attendance")
    op.drop_table("users")
    op.drop_table("sessions")
    op.drop_table("players")
    op.drop_table("infractions")
    op.drop_table("app_settings")
    # ### end Alembic commands ###
