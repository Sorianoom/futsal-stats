from app.auth.rate_limit import LoginGuard, LoginRateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def guard(clock: FakeClock | None = None) -> LoginGuard:
    return LoginGuard(
        per_pair=3, per_ip=6, per_email=5, window_seconds=60, clock=clock or FakeClock()
    )


def fail(login_guard: LoginGuard, ip: str, email: str, times: int = 1) -> None:
    for _ in range(times):
        login_guard.record_failure(ip, email)


def test_pair_is_blocked_after_its_limit() -> None:
    login_guard = guard()

    fail(login_guard, "1.1.1.1", "a@x.es", 3)

    assert login_guard.is_blocked("1.1.1.1", "a@x.es")


def test_same_ip_rotating_emails_is_blocked_by_the_ip_counter() -> None:
    login_guard = guard()

    for index in range(6):
        fail(login_guard, "1.1.1.1", f"user{index}@x.es")

    assert login_guard.is_blocked("1.1.1.1", "brand-new@x.es")


def test_many_ips_against_one_email_is_blocked_by_the_email_counter() -> None:
    login_guard = guard()

    for index in range(5):
        fail(login_guard, f"10.0.0.{index}", "target@x.es")

    assert login_guard.is_blocked("10.9.9.9", "target@x.es")


def test_unrelated_ip_and_email_are_not_blocked() -> None:
    login_guard = guard()
    fail(login_guard, "1.1.1.1", "a@x.es", 3)

    assert not login_guard.is_blocked("2.2.2.2", "b@x.es")


def test_email_is_case_insensitive() -> None:
    login_guard = guard()
    fail(login_guard, "1.1.1.1", "A@x.es", 3)

    assert login_guard.is_blocked("1.1.1.1", "a@X.ES")


def test_success_clears_the_pair_and_email_counters_but_not_the_ip_one() -> None:
    login_guard = guard()
    for index in range(5):
        fail(login_guard, "1.1.1.1", f"user{index}@x.es")
    fail(login_guard, "1.1.1.1", "a@x.es", 2)

    login_guard.reset("1.1.1.1", "a@x.es")

    assert login_guard.is_blocked("1.1.1.1", "other@x.es")
    assert not login_guard.is_blocked("9.9.9.9", "a@x.es")


def test_blocks_expire_with_the_window() -> None:
    clock = FakeClock()
    login_guard = guard(clock)
    fail(login_guard, "1.1.1.1", "a@x.es", 3)

    clock.now += 61

    assert not login_guard.is_blocked("1.1.1.1", "a@x.es")


def test_limiter_forgets_the_oldest_keys_beyond_its_capacity() -> None:
    limiter = LoginRateLimiter(max_failures=1, window_seconds=60, clock=FakeClock(), max_keys=3)

    for index in range(5):
        limiter.record_failure(f"k{index}")

    assert not limiter.is_blocked("k0")
    assert not limiter.is_blocked("k1")
    assert limiter.is_blocked("k4")
