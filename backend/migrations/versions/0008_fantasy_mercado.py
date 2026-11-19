"""fantasy mercado

Mercado diario, pujas, ventas, valores por jornada, cobros y cierre de jornada (paso 3).

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-14 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Valor inicial de los jugadores (INITIAL_PLAYER_VALUE en app/domain/fantasy/rules.py).
INITIAL_PLAYER_VALUE = 4000
OPEN_LISTING = "resolved_at IS NULL AND cancelled_at IS NULL"
TRANSFER_KINDS = ("initial", "market", "bank_sale")
LEDGER_KINDS = ("market_purchase", "market_sale", "bank_sale", "round_payout")


def _kind_column(name: str, kinds: tuple[str, ...]) -> sa.Column:
    return sa.Column(
        "kind", sa.Enum(*kinds, name=name, native_enum=False, length=32), nullable=False
    )


def _kind_check(table: str, kinds: tuple[str, ...]) -> sa.CheckConstraint:
    values = ", ".join(f"'{k}'" for k in kinds)
    return sa.CheckConstraint(f"kind IN ({values})", name=op.f(f"ck_{table}_kind_valid"))


def _participant_fk(table: str, column: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        ["fantasy_participants.id"],
        name=op.f(f"fk_{table}_{column}_fantasy_participants"),
        ondelete="CASCADE",
    )


def _league_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["league_id"],
        ["fantasy_leagues.id"],
        name=op.f(f"fk_{table}_league_id_fantasy_leagues"),
        ondelete="CASCADE",
    )


def _copy_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["copy_id"],
        ["fantasy_copies.id"],
        name=op.f(f"fk_{table}_copy_id_fantasy_copies"),
        ondelete="CASCADE",
    )


def _settled_round_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["league_id", "match_id"],
        ["fantasy_settled_rounds.league_id", "fantasy_settled_rounds.match_id"],
        name=op.f(f"fk_{table}_league_id_fantasy_settled_rounds"),
        ondelete="CASCADE",
    )


def _create_money_tables() -> None:
    op.create_table(
        "fantasy_player_values",
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.CheckConstraint("value >= 0", name=op.f("ck_fantasy_player_values_value_not_negative")),
        _league_fk("fantasy_player_values"),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_fantasy_player_values_player_id_players")
        ),
        sa.PrimaryKeyConstraint("league_id", "player_id", name=op.f("pk_fantasy_player_values")),
    )

    op.create_table(
        "fantasy_transfers",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("copy_id", sa.UUID(), nullable=False),
        sa.Column("from_participant_id", sa.UUID(), nullable=True),
        sa.Column("to_participant_id", sa.UUID(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=False),
        _kind_column("transferkind", TRANSFER_KINDS),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        _kind_check("fantasy_transfers", TRANSFER_KINDS),
        sa.CheckConstraint("price >= 0", name=op.f("ck_fantasy_transfers_price_not_negative")),
        _league_fk("fantasy_transfers"),
        _copy_fk("fantasy_transfers"),
        _participant_fk("fantasy_transfers", "from_participant_id"),
        _participant_fk("fantasy_transfers", "to_participant_id"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_transfers")),
    )
    op.create_index("ix_fantasy_transfers_copy_id_at", "fantasy_transfers", ["copy_id", "at"])
    op.create_index("ix_fantasy_transfers_league_id_at", "fantasy_transfers", ["league_id", "at"])

    op.create_table(
        "fantasy_ledger",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("participant_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        _kind_column("ledgerkind", LEDGER_KINDS),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        _kind_check("fantasy_ledger", LEDGER_KINDS),
        _participant_fk("fantasy_ledger", "participant_id"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_ledger")),
    )
    op.create_index(
        "ix_fantasy_ledger_participant_id_at", "fantasy_ledger", ["participant_id", "at"]
    )


def _create_market_tables() -> None:
    op.create_table(
        "fantasy_listings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("copy_id", sa.UUID(), nullable=False),
        sa.Column("seller_participant_id", sa.UUID(), nullable=True),
        sa.Column("min_price", sa.Integer(), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("market_day", sa.Date(), nullable=True),
        sa.CheckConstraint(
            "min_price IS NULL OR min_price >= 0",
            name=op.f("ck_fantasy_listings_min_price_not_negative"),
        ),
        # Las de la banca (sin vendedor) llevan el día de su mercado; las de un participante no.
        sa.CheckConstraint(
            "(seller_participant_id IS NULL) = (market_day IS NOT NULL)",
            name=op.f("ck_fantasy_listings_bank_has_day"),
        ),
        sa.CheckConstraint(
            "resolved_at IS NULL OR cancelled_at IS NULL",
            name=op.f("ck_fantasy_listings_one_ending"),
        ),
        sa.CheckConstraint(
            "closes_at > opened_at", name=op.f("ck_fantasy_listings_closes_after_opening")
        ),
        _league_fk("fantasy_listings"),
        _copy_fk("fantasy_listings"),
        _participant_fk("fantasy_listings", "seller_participant_id"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_listings")),
    )
    # Único parcial: una sola venta abierta por copia.
    op.create_index(
        "ux_fantasy_listings_one_open",
        "fantasy_listings",
        ["copy_id"],
        unique=True,
        postgresql_where=sa.text(OPEN_LISTING),
    )
    op.create_index(
        "ix_fantasy_listings_open_closes_at",
        "fantasy_listings",
        ["league_id", "closes_at"],
        postgresql_where=sa.text(OPEN_LISTING),
    )

    op.create_table(
        "fantasy_bids",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column("participant_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_fantasy_bids_amount_not_negative")),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["fantasy_listings.id"],
            name=op.f("fk_fantasy_bids_listing_id_fantasy_listings"),
            ondelete="CASCADE",
        ),
        _participant_fk("fantasy_bids", "participant_id"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fantasy_bids")),
        sa.UniqueConstraint(
            "listing_id", "participant_id", name=op.f("uq_fantasy_bids_listing_id")
        ),
    )
    op.create_index("ix_fantasy_bids_participant_id", "fantasy_bids", ["participant_id"])


def _create_round_tables() -> None:
    op.create_table(
        "fantasy_settled_rounds",
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=False),
        _league_fk("fantasy_settled_rounds"),
        sa.ForeignKeyConstraint(
            ["match_id"],
            ["matches.id"],
            name=op.f("fk_fantasy_settled_rounds_match_id_matches"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("league_id", "match_id", name=op.f("pk_fantasy_settled_rounds")),
    )

    op.create_table(
        "fantasy_round_scores",
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("participant_id", sa.UUID(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("payout", sa.Integer(), nullable=False),
        sa.Column("negative_balance", sa.Boolean(), nullable=False),
        sa.Column("slots", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _settled_round_fk("fantasy_round_scores"),
        _participant_fk("fantasy_round_scores", "participant_id"),
        sa.PrimaryKeyConstraint(
            "league_id", "match_id", "participant_id", name=op.f("pk_fantasy_round_scores")
        ),
    )

    op.create_table(
        "fantasy_value_changes",
        sa.Column("league_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("before", sa.Integer(), nullable=False),
        sa.Column("after", sa.Integer(), nullable=False),
        _settled_round_fk("fantasy_value_changes"),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_fantasy_value_changes_player_id_players")
        ),
        sa.PrimaryKeyConstraint(
            "league_id", "match_id", "player_id", name=op.f("pk_fantasy_value_changes")
        ),
    )


def _backfill() -> None:
    """Valor inicial de cada jugador con copias, y el reparto inicial como traspaso desde la
    banca para cada copia con dueño."""
    op.execute(
        sa.text(
            "INSERT INTO fantasy_player_values (league_id, player_id, value) "
            "SELECT DISTINCT league_id, player_id, :value FROM fantasy_copies"
        ).bindparams(value=INITIAL_PLAYER_VALUE)
    )
    op.execute(
        "INSERT INTO fantasy_transfers "
        "(league_id, copy_id, from_participant_id, to_participant_id, price, kind, at) "
        "SELECT league_id, id, NULL, owner_id, 0, 'initial', acquired_at "
        "FROM fantasy_copies WHERE owner_id IS NOT NULL ORDER BY acquired_at, id"
    )


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("fantasy_leagues", sa.Column("market_day", sa.Date(), nullable=True))
    _create_money_tables()
    _create_market_tables()
    _create_round_tables()
    _backfill()


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("fantasy_value_changes")
    op.drop_table("fantasy_round_scores")
    op.drop_table("fantasy_settled_rounds")
    op.drop_index("ix_fantasy_bids_participant_id", table_name="fantasy_bids")
    op.drop_table("fantasy_bids")
    op.drop_index(
        "ix_fantasy_listings_open_closes_at",
        table_name="fantasy_listings",
        postgresql_where=sa.text(OPEN_LISTING),
    )
    op.drop_index(
        "ux_fantasy_listings_one_open",
        table_name="fantasy_listings",
        postgresql_where=sa.text(OPEN_LISTING),
    )
    op.drop_table("fantasy_listings")
    op.drop_index("ix_fantasy_ledger_participant_id_at", table_name="fantasy_ledger")
    op.drop_table("fantasy_ledger")
    op.drop_index("ix_fantasy_transfers_league_id_at", table_name="fantasy_transfers")
    op.drop_index("ix_fantasy_transfers_copy_id_at", table_name="fantasy_transfers")
    op.drop_table("fantasy_transfers")
    op.drop_table("fantasy_player_values")
    op.drop_column("fantasy_leagues", "market_day")
