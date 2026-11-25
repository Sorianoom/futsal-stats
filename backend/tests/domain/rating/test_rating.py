from dataclasses import fields

import pytest

from app.domain.rating import (
    RatingError,
    RatingInput,
    RatingPart,
    player_rating,
    rating_breakdown,
    rating_score,
)

THIRTY_MIN = 30 * 60
FORTY_MIN = 40 * 60
FOUR_MIN = 4 * 60
TEN_MIN = 10 * 60


def field_player(seconds: int = THIRTY_MIN, **counts: int) -> RatingInput:
    return RatingInput(is_goalkeeper=False, seconds=seconds, **counts)


def goalkeeper(seconds: int = THIRTY_MIN, **counts: int) -> RatingInput:
    return RatingInput(is_goalkeeper=True, seconds=seconds, **counts)


# --- Minutos mínimos -------------------------------------------------------------------------


def test_less_than_three_minutes_has_no_rating() -> None:
    assert player_rating(field_player(seconds=179)) is None
    assert rating_score(field_player(seconds=179)) is None
    assert player_rating(goalkeeper(seconds=0)) is None


def test_exactly_three_minutes_has_rating() -> None:
    assert player_rating(field_player(seconds=180)) == 5.4


def test_base_rating_without_actions_is_a_poor_match() -> None:
    assert player_rating(field_player()) == 5.4
    assert player_rating(goalkeeper(seconds=300)) == 5.4


# --- Jugador de campo ------------------------------------------------------------------------


def test_field_player_great_match_shows_ten_but_keeps_the_exact_score() -> None:
    # 5,4 + 7,5 + 1,4 = 14,3
    data = field_player(goals=3, assists=2)

    assert player_rating(data) == 10.0
    assert rating_score(data) == 14.3


def test_field_player_goal_and_assist() -> None:
    # 5,4 + 2,5 + 0,7 − 0,3 + 0,30 − 0,15 = 8,45 → se ve 8,5
    data = field_player(
        goals=1, assists=1, turnovers=1, goals_for_on_court=2, goals_against_on_court=1
    )

    assert rating_score(data) == 8.45
    assert player_rating(data) == 8.5


def test_field_player_defensive_match_with_bad_plus_minus() -> None:
    # 5,4 + 0,6 − 0,6 − 0,4 + 0,15 − 0,45 = 4,7
    data = field_player(
        steals=2, turnovers=2, fouls=1, goals_for_on_court=1, goals_against_on_court=3
    )

    assert player_rating(data) == 4.7


def test_a_foul_weighs_more_than_a_turnover() -> None:
    assert player_rating(field_player(fouls=1)) == 5.0
    assert player_rating(field_player(turnovers=1)) == 5.1


def test_field_player_four_minutes_one_steal() -> None:
    assert player_rating(field_player(seconds=FOUR_MIN, steals=1)) == 5.7


def test_a_key_action_adds_two_tenths_to_anyone() -> None:
    assert player_rating(field_player(key_actions=1)) == 5.6
    assert player_rating(goalkeeper(key_actions=2)) == 5.8
    assert rating_breakdown(field_player(key_actions=3))[1] == RatingPart("key_actions", 3, 60)


def test_field_player_saves_do_not_count() -> None:
    assert player_rating(field_player(saves=5)) == 5.4


def test_cards_penalize_any_player() -> None:
    assert player_rating(field_player(yellows=1)) == 4.9
    assert player_rating(goalkeeper(seconds=300, reds=1)) == 3.4


def test_the_shown_rating_is_floored_at_one_but_the_score_is_not() -> None:
    # 5,4 − 4,0 − 1,5 − 0,6 = −0,7
    data = field_player(reds=2, turnovers=5, goals_against_on_court=4)

    assert player_rating(data) == 1.0
    assert rating_score(data) == -0.7


def test_rating_avoids_float_drift() -> None:
    # 0,1 × 3 en coma flotante daría 5,700000000000001
    assert player_rating(field_player(shots=3)) == 5.7


def test_the_shown_rating_rounds_hundredths_half_up() -> None:
    # 5,4 + 0,15 = 5,55 → 5,6
    data = field_player(goals_for_on_court=1)

    assert rating_score(data) == 5.55
    assert player_rating(data) == 5.6


# --- Rachas sin gol en contra ----------------------------------------------------------------


def test_each_clean_streak_adds_to_any_player() -> None:
    assert player_rating(field_player(clean_streaks=2)) == 6.0
    assert player_rating(goalkeeper(seconds=FORTY_MIN, clean_streaks=4)) == 6.6


def test_the_goalkeeper_has_no_separate_clean_sheet_bonus() -> None:
    assert player_rating(goalkeeper(seconds=TEN_MIN)) == 5.4


# --- Portero ---------------------------------------------------------------------------------


def test_goalkeeper_many_saves_one_conceded() -> None:
    # 5,4 + 2,8 − 0,4 = 7,8
    assert player_rating(goalkeeper(seconds=FORTY_MIN, saves=7, goals_against_on_court=1)) == 7.8


def test_goalkeeper_bad_match() -> None:
    # 5,4 + 0,4 − 2,0 = 3,8
    assert player_rating(goalkeeper(saves=1, goals_against_on_court=5)) == 3.8


def test_a_goalkeeper_goal_is_worth_double() -> None:
    assert player_rating(field_player(goals=1)) == 7.9
    assert player_rating(goalkeeper(goals=1)) == 10.0
    assert rating_score(goalkeeper(goals=1)) == 10.4


def test_goalkeeper_ignores_shots_and_goals_for_on_court() -> None:
    data = goalkeeper(saves=1, shots=4, goals_for_on_court=3, goals_against_on_court=1)

    # 5,4 + 0,4 − 0,4 = 5,4
    assert player_rating(data) == 5.4


def test_goalkeeper_common_actions_count() -> None:
    # 5,4 + 5,0 + 0,7 + 0,3 − 0,3 − 0,4 − 0,4 = 10,3
    data = goalkeeper(goals=1, assists=1, steals=1, turnovers=1, fouls=1, goals_against_on_court=1)

    assert rating_score(data) == 10.3


def test_goalkeeper_huge_match_shows_ten_and_keeps_the_exact_score() -> None:
    # Joan contra el Athletic Txapeldunak: 17 paradas, gol, robo, 3 pérdidas, 5 encajados y
    # dos rachas de 10 minutos. 5,4 + 5,0 + 0,3 − 0,9 + 6,8 − 2,0 + 0,6 = 15,2
    data = goalkeeper(
        seconds=FORTY_MIN,
        saves=17,
        goals=1,
        steals=1,
        turnovers=3,
        shots=1,
        goals_against_on_court=5,
        goals_for_on_court=5,
        clean_streaks=2,
    )

    assert player_rating(data) == 10.0
    assert rating_score(data) == 15.2


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


# --- Desglose ----------------------------------------------------------------------------------


def test_the_breakdown_explains_every_action_and_adds_up_to_the_score() -> None:
    data = goalkeeper(
        seconds=FORTY_MIN,
        saves=17,
        goals=1,
        steals=1,
        turnovers=3,
        shots=1,  # al portero no le cuenta: no sale
        goals_against_on_court=5,
        clean_streaks=2,
    )

    parts = rating_breakdown(data)

    assert [(p.key, p.count, p.hundredths) for p in parts] == [
        ("base", 1, 540),
        ("goals", 1, 500),  # el gol del portero vale el doble
        ("steals", 1, 30),
        ("turnovers", 3, -90),
        ("clean_streaks", 2, 60),
        ("saves", 17, 680),
        ("goals_against_on_court", 5, -200),
    ]
    assert sum(p.hundredths for p in parts) / 100 == rating_score(data) == 15.2


def test_without_rating_there_is_no_breakdown() -> None:
    assert rating_breakdown(field_player(seconds=60, goals=1)) == []
