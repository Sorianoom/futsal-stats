"""Parte pura del limitador de login: claves, decisión de bloqueo e IP del cliente."""

import pytest

from app.auth.rate_limit import (
    INVITATION_MAX_FAILURES_PER_IP,
    PER_EMAIL_MAX_FAILURES,
    PER_IP_MAX_FAILURES,
    PER_PAIR_MAX_FAILURES,
    client_ip,
    invitation_ip_key,
    invitation_is_blocked,
    is_blocked,
    login_keys,
)

SECRET = "Zx9-Qm4_Lp7vWc2Rt8Ys5Uh3Nj6Bk1Dg0Fa"


def test_keys_are_hex_digests_without_the_ip_or_email_in_clear() -> None:
    keys = login_keys("1.1.1.1", "a@x.es", SECRET)

    for digest in (keys.pair, keys.ip, keys.email):
        assert len(digest) == 64
        assert int(digest, 16) >= 0
        assert "1.1.1.1" not in digest and "a@x.es" not in digest


def test_the_three_keys_are_different() -> None:
    keys = login_keys("1.1.1.1", "a@x.es", SECRET)

    assert len({keys.pair, keys.ip, keys.email}) == 3


def test_email_is_normalized_before_hashing() -> None:
    assert login_keys("1.1.1.1", " A@X.es ", SECRET) == login_keys("1.1.1.1", "a@x.es", SECRET)


def test_same_ip_shares_the_ip_key_but_not_the_pair_key() -> None:
    first = login_keys("1.1.1.1", "a@x.es", SECRET)
    second = login_keys("1.1.1.1", "b@x.es", SECRET)

    assert first.ip == second.ip
    assert first.pair != second.pair
    assert first.email != second.email


def test_an_ip_and_an_email_with_the_same_text_do_not_collide() -> None:
    assert login_keys("x", "x@x.es", SECRET).ip != login_keys("y", "x", SECRET).email


def test_keys_depend_on_the_secret() -> None:
    other = "Pq8-Rs5_Tu2vWx9Yz6Ab3Cd0Ef7Gh4Ij1Kl"

    assert login_keys("1.1.1.1", "a@x.es", SECRET) != login_keys("1.1.1.1", "a@x.es", other)


@pytest.mark.parametrize(
    ("pair", "ip", "email", "blocked"),
    [
        (0, 0, 0, False),
        (PER_PAIR_MAX_FAILURES - 1, PER_IP_MAX_FAILURES - 1, PER_EMAIL_MAX_FAILURES - 1, False),
        (PER_PAIR_MAX_FAILURES, 0, 0, True),
        (0, PER_IP_MAX_FAILURES, 0, True),
        (0, 0, PER_EMAIL_MAX_FAILURES, True),
    ],
)
def test_blocked_when_any_counter_reaches_its_limit(
    pair: int, ip: int, email: int, blocked: bool
) -> None:
    keys = login_keys("1.1.1.1", "a@x.es", SECRET)
    counts = {keys.pair: pair, keys.ip: ip, keys.email: email}

    assert is_blocked(keys, counts) is blocked


def test_missing_counts_mean_no_failures() -> None:
    assert not is_blocked(login_keys("1.1.1.1", "a@x.es", SECRET), {})


def test_client_ip_uses_the_socket_address_outside_vercel() -> None:
    ip = client_ip("10.0.0.1", {"x-real-ip": "6.6.6.6"}, behind_vercel=False)

    assert ip == "10.0.0.1"


def test_client_ip_uses_the_header_vercel_overwrites_behind_vercel() -> None:
    ip = client_ip("10.0.0.1", {"x-real-ip": " 81.2.3.4 "}, behind_vercel=True)

    assert ip == "81.2.3.4"


@pytest.mark.parametrize("headers", [{}, {"x-real-ip": "  "}])
def test_client_ip_falls_back_to_the_socket_when_the_header_is_missing(
    headers: dict[str, str],
) -> None:
    assert client_ip("10.0.0.1", headers, behind_vercel=True) == "10.0.0.1"


def test_client_ip_without_socket_or_header_is_unknown() -> None:
    assert client_ip(None, {}, behind_vercel=False) == "unknown"


def test_the_invitation_key_is_a_digest_apart_from_the_login_ip_key() -> None:
    key = invitation_ip_key("1.1.1.1", SECRET)

    assert len(key) == 64 and "1.1.1.1" not in key
    assert key != login_keys("1.1.1.1", "a@x.es", SECRET).ip
    assert key == invitation_ip_key("1.1.1.1", SECRET)
    assert key != invitation_ip_key("1.1.1.2", SECRET)


@pytest.mark.parametrize(
    ("failures", "blocked"),
    [
        (0, False),
        (INVITATION_MAX_FAILURES_PER_IP - 1, False),
        (INVITATION_MAX_FAILURES_PER_IP, True),
    ],
)
def test_invitations_block_when_the_ip_reaches_its_limit(failures: int, blocked: bool) -> None:
    key = invitation_ip_key("1.1.1.1", SECRET)

    assert invitation_is_blocked(key, {key: failures}) is blocked


def test_the_invitation_limit_is_ten() -> None:
    assert INVITATION_MAX_FAILURES_PER_IP == 10
