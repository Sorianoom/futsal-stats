"""sesiones de refresco

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-30 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("current_jti", sa.UUID(), nullable=False),
        sa.Column("previous_jti", sa.UUID(), nullable=True),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "revoke_reason",
            sa.Enum("logout", "reuse", "admin", name="revokereason", native_enum=False, length=32),
            nullable=True,
        ),
        sa.Column("legacy_token_hash", sa.String(length=64), nullable=True),
        sa.CheckConstraint(
            "absolute_expires_at > created_at",
            name=op.f("ck_refresh_sessions_expires_after_creation"),
        ),
        sa.CheckConstraint(
            "(revoked_at IS NULL) = (revoke_reason IS NULL)",
            name=op.f("ck_refresh_sessions_revocation_is_complete"),
        ),
        sa.CheckConstraint(
            "previous_jti IS DISTINCT FROM current_jti",
            name=op.f("ck_refresh_sessions_previous_differs_from_current"),
        ),
        sa.CheckConstraint(
            "(previous_jti IS NULL) = (rotated_at IS NULL)",
            name=op.f("ck_refresh_sessions_rotation_is_complete"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_sessions")),
        sa.UniqueConstraint(
            "legacy_token_hash", name=op.f("uq_refresh_sessions_legacy_token_hash")
        ),
    )
    op.create_index(
        op.f("ix_refresh_sessions_absolute_expires_at"),
        "refresh_sessions",
        ["absolute_expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_refresh_sessions_user_id"), "refresh_sessions", ["user_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_refresh_sessions_user_id"), table_name="refresh_sessions")
    op.drop_index(op.f("ix_refresh_sessions_absolute_expires_at"), table_name="refresh_sessions")
    op.drop_table("refresh_sessions")
