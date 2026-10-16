"""Semanas de puntuación: empiezan el lunes."""

from datetime import date, timedelta

DAYS_PER_WEEK = 7


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def next_week_start(day: date) -> date:
    return week_start(day) + timedelta(days=DAYS_PER_WEEK)
