from dataclasses import fields

import pytest

from app.domain.rating import RatingError, RatingInput, player_rating

THIRTY_MIN = 30 * 60
FORTY_MIN = 40 * 60
TWENTY_MIN = 20 * 60
FOUR_MIN = 4 * 60


def field_player(seconds: int = THIRTY_MIN, **counts: int) -> RatingInput:
    return RatingInput(is_goalkeeper=False, seconds=seconds, **counts)


def goalkeeper(seconds: int = THIRTY_MIN, **counts: int) -> RatingInput:
    return RatingInput(is_goalkeeper=True, seconds=seconds, **counts)


# --- Minutos mínimos -------------------------------------------------------------------------


def test_less_than_three_minutes_has_no_rating() -> None:
    assert player_rating(field_player(seconds=179)) is None
    assert player_rating(goalkeeper(seconds=0)) is None


def test_exactly_three_minutes_has_rating() -> None:
    assert player_rating(field_player(seconds=180)) == 6.0


def test_base_rating_is_six_without_actions() -> None:
    assert player_rating(field_player()) == 6.0
    assert player_rating(goalkeeper(seconds=300)) == 6.0


# --- Jugador de campo ------------------------------------------------------------------------


def test_field_player_great_match_is_capped_at_ten() -> None:
    # 6 + 3 + 0,7 + 0,3 − 0,3 + 0,9 − 0,3 = 10,3 → 10,0
    data = field_player(
        goals=2,
        assists=1,
        shots=3,
        turnovers=1,
        goals_for_on_court=3,
        goals_against_on_court=1,
    )

    assert player_rating(data) == 10.0


def test_field_player_goal_and_assist() -> None:
    # 6 + 1,5 + 0,7 − 0,3 + 0,6 − 0,3 = 8,2
    data = field_player(
        goals=1, assists=1, turnovers=1, goals_for_on_court=2, goals_against_on_court=1
    )

    assert player_rating(data) == 8.2


def test_field_player_defensive_match_with_bad_plus_minus() -> None:
    # 6 + 0,6 − 0,6 − 0,2 + 0,3 − 0,9 = 5,2
    data = field_player(
        steals=2, turnovers=2, fouls=1, goals_for_on_court=1, goals_against_on_court=3
    )

    assert player_rating(data) == 5.2


def test_field_player_four_minutes_one_steal() -> None:
    assert player_rating(field_player(seconds=FOUR_MIN, steals=1)) == 6.3


def test_field_player_saves_do_not_count() -> None:
    assert player_rating(field_player(saves=5)) == 6.0


def test_cards_penalize_any_player() -> None:
    assert player_rating(field_player(yellows=1)) == 5.5
    # Menos de 10 min para que no entre la bonificación de portería a cero.
    assert player_rating(goalkeeper(seconds=300, reds=1)) == 4.0


def test_rating_is_floored_at_one() -> None:
    data = field_player(reds=2, turnovers=5, goals_against_on_court=4)

    assert player_rating(data) == 1.0


def test_rating_avoids_float_drift() -> None:
    # 0,1 × 3 en coma flotante daría 6,300000000000001
    assert player_rating(field_player(shots=3)) == 6.3


# --- Portero ---------------------------------------------------------------------------------


def test_goalkeeper_many_saves_one_conceded() -> None:
    # 6 + 2,8 − 0,6 = 8,2
    assert player_rating(goalkeeper(seconds=FORTY_MIN, saves=7, goals_against_on_court=1)) == 8.2


def test_goalkeeper_bad_match() -> None:
    # 6 + 0,4 − 3,0 = 3,4
    assert player_rating(goalkeeper(saves=1, goals_against_on_court=5)) == 3.4


def test_goalkeeper_clean_sheet() -> None:
    # 6 + 1,6 + 1,0 = 8,6
    assert player_rating(goalkeeper(seconds=TWENTY_MIN, saves=4)) == 8.6


def test_goalkeeper_clean_sheet_needs_ten_minutes() -> None:
    assert player_rating(goalkeeper(seconds=599)) == 6.0
    assert player_rating(goalkeeper(seconds=600)) == 7.0


def test_goalkeeper_ignores_shots_and_goals_for_on_court() -> None:
    data = goalkeeper(saves=1, shots=4, goals_for_on_court=3, goals_against_on_court=1)

    # 6 + 0,4 − 0,6 = 5,8
    assert player_rating(data) == 5.8


def test_goalkeeper_common_actions_count() -> None:
    # 6 + 1,5 + 0,7 + 0,3 − 0,3 − 0,2 − 0,6 = 7,4
    data = goalkeeper(goals=1, assists=1, steals=1, turnovers=1, fouls=1, goals_against_on_court=1)

    assert player_rating(data) == 7.4


def test_goalkeeper_rating_is_capped_at_ten() -> None:
    assert player_rating(goalkeeper(saves=20)) == 10.0


# --- Validación ------------------------------------------------------------------------------


def test_negative_seconds_raise_rating_error() -> None:
    with pytest.raises(RatingError):
        player_rating(field_player(seconds=-1))


@pytest.mark.parametrize(
    "name", [f.name for f in fields(RatingInput) if f.name not in ("is_goalkeeper", "seconds")]
)
def test_negative_counters_raise_rating_error(name: str) -> None:
    with pytest.raises(RatingError, match=name):
        player_rating(field_player(**{name: -1}))


def test_rating_error_is_a_value_error() -> None:
    assert issubclass(RatingError, ValueError)
