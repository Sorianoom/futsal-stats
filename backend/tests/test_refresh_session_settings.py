import pytest
from pydantic import ValidationError

from app.config import Settings


def settings_with(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_defaults_cap_a_session_at_30_days_with_a_two_hour_reuse_grace() -> None:
    config = settings_with()

    assert config.refresh_session_max_days == 30
    assert config.refresh_reuse_grace_seconds == 7200
    assert config.refresh_token_ttl_days == 30


def test_the_session_cap_and_the_grace_can_be_configured() -> None:
    config = settings_with(
        refresh_session_max_days=60, refresh_token_ttl_days=14, refresh_reuse_grace_seconds=600
    )

    assert (config.refresh_session_max_days, config.refresh_reuse_grace_seconds) == (60, 600)


def test_inactivity_ttl_cannot_exceed_the_absolute_cap() -> None:
    with pytest.raises(ValidationError, match="refresh_token_ttl_days"):
        settings_with(refresh_session_max_days=7, refresh_token_ttl_days=30)


@pytest.mark.parametrize("days", [0, -1, 366])
def test_the_session_cap_must_be_between_one_day_and_a_year(days: int) -> None:
    with pytest.raises(ValidationError):
        settings_with(refresh_session_max_days=days, refresh_token_ttl_days=1)


@pytest.mark.parametrize("seconds", [-1, 86401])
def test_the_reuse_grace_must_be_between_zero_and_a_day(seconds: int) -> None:
    with pytest.raises(ValidationError):
        settings_with(refresh_reuse_grace_seconds=seconds)


def test_a_zero_grace_is_allowed_to_disable_tolerance() -> None:
    assert settings_with(refresh_reuse_grace_seconds=0).refresh_reuse_grace_seconds == 0


@pytest.mark.parametrize("days", [0, -5])
def test_the_inactivity_ttl_must_be_at_least_one_day(days: int) -> None:
    with pytest.raises(ValidationError):
        settings_with(refresh_token_ttl_days=days)
