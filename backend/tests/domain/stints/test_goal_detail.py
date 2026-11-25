import pytest

from app.domain.stints.events import EventKind
from app.domain.stints.goal_detail import (
    GoalDetail,
    GoalDetailError,
    GoalTag,
    validate_goal_detail,
)


def test_a_goal_against_can_carry_types_and_a_point() -> None:
    detail = GoalDetail((GoalTag.SET_PIECE, GoalTag.FAR_POST), x=80, y=10)

    validate_goal_detail(EventKind.RIVAL_GOAL, detail)
    validate_goal_detail(EventKind.GOAL, detail)


def test_detail_is_optional() -> None:
    validate_goal_detail(EventKind.RIVAL_GOAL, GoalDetail())
    validate_goal_detail(EventKind.GOAL, GoalDetail((GoalTag.COUNTER,)))
    validate_goal_detail(EventKind.GOAL, GoalDetail(x=0, y=100))


def test_only_goals_carry_detail() -> None:
    validate_goal_detail(EventKind.FOUL, GoalDetail())
    with pytest.raises(GoalDetailError, match="Solo un gol"):
        validate_goal_detail(EventKind.SHOT, GoalDetail(x=50, y=50))


@pytest.mark.parametrize(
    ("detail", "message"),
    [
        (GoalDetail((GoalTag.COUNTER,) * 2), "repetido"),
        (
            GoalDetail((GoalTag.COUNTER, GoalTag.REBOUND, GoalTag.PENALTY, GoalTag.OWN_GOAL)),
            "Como mucho 3",
        ),
        (GoalDetail(x=10), "dos coordenadas"),
        (GoalDetail(x=101, y=5), "fuera de la pista"),
        (GoalDetail(x=5, y=-1), "fuera de la pista"),
    ],
)
def test_impossible_details_are_rejected(detail: GoalDetail, message: str) -> None:
    with pytest.raises(GoalDetailError, match=message):
        validate_goal_detail(EventKind.RIVAL_GOAL, detail)
