from app.auth.rate_limit import LoginRateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def limiter(clock: FakeClock) -> LoginRateLimiter:
    return LoginRateLimiter(max_failures=3, window_seconds=60, clock=clock)


def test_not_blocked_before_reaching_the_limit() -> None:
    rate_limiter = limiter(FakeClock())

    rate_limiter.record_failure("k")
    rate_limiter.record_failure("k")

    assert not rate_limiter.is_blocked("k")


def test_blocked_after_max_failures() -> None:
    rate_limiter = limiter(FakeClock())

    for _ in range(3):
        rate_limiter.record_failure("k")

    assert rate_limiter.is_blocked("k")


def test_other_keys_are_not_affected() -> None:
    rate_limiter = limiter(FakeClock())
    for _ in range(3):
        rate_limiter.record_failure("k")

    assert not rate_limiter.is_blocked("other")


def test_block_expires_when_the_window_passes() -> None:
    clock = FakeClock()
    rate_limiter = limiter(clock)
    for _ in range(3):
        rate_limiter.record_failure("k")

    clock.now += 61

    assert not rate_limiter.is_blocked("k")


def test_reset_clears_the_failures() -> None:
    rate_limiter = limiter(FakeClock())
    for _ in range(3):
        rate_limiter.record_failure("k")

    rate_limiter.reset("k")

    assert not rate_limiter.is_blocked("k")


def test_old_failures_do_not_add_up_with_new_ones() -> None:
    clock = FakeClock()
    rate_limiter = limiter(clock)
    rate_limiter.record_failure("k")
    rate_limiter.record_failure("k")
    clock.now += 61

    rate_limiter.record_failure("k")

    assert not rate_limiter.is_blocked("k")
