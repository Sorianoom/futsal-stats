import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.auth.tokens import TokenError, TokenType, create_token, decode_token
from app.config import Settings
from app.domain.roles import Role

SECRET = "Zx9-Qm4_Lp7vWc2Rt8Ys5Uh3Nj6Bk1Dg0Fa"
USER_ID = uuid.uuid4()


def settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, jwt_secret=SECRET, **overrides)  # type: ignore[arg-type]


def forged_payload(role: str = "head_coach") -> dict[str, object]:
    now = datetime.now(UTC)
    return {
        "sub": str(USER_ID),
        "role": role,
        "type": "access",
        "iss": "futsal-stats",
        "aud": "futsal-stats-app",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }


def test_access_token_round_trips_user_role_and_type() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings())

    claims = decode_token(token, TokenType.ACCESS, settings())

    assert (claims.user_id, claims.role, claims.type) == (
        USER_ID,
        Role.HEAD_COACH,
        TokenType.ACCESS,
    )


def test_refresh_token_cannot_be_used_as_access_token() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.REFRESH, settings())

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_access_token_cannot_be_used_as_refresh_token() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings())

    with pytest.raises(TokenError):
        decode_token(token, TokenType.REFRESH, settings())


def test_expired_token_is_rejected() -> None:
    long_ago = datetime.now(UTC) - timedelta(days=1)
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings(), now=long_ago)

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_token_issued_a_few_seconds_ahead_is_accepted_to_tolerate_clock_skew() -> None:
    # Otra instancia, o un salto del reloj, puede ir unos segundos por delante.
    ahead = datetime.now(UTC) + timedelta(seconds=5)
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings(), now=ahead)

    claims = decode_token(token, TokenType.ACCESS, settings())

    assert claims.user_id == USER_ID


def test_token_issued_far_in_the_future_is_rejected() -> None:
    far_ahead = datetime.now(UTC) + timedelta(minutes=5)
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings(), now=far_ahead)

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_token_expired_beyond_the_tolerance_is_rejected() -> None:
    config = settings(access_token_ttl_minutes=1)
    issued = datetime.now(UTC) - timedelta(minutes=1, seconds=60)
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, config, now=issued)

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, config)


def test_access_token_lives_for_the_configured_minutes() -> None:
    config = settings(access_token_ttl_minutes=7)
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, config)

    payload = jwt.decode(token, SECRET, algorithms=["HS256"], audience="futsal-stats-app")

    assert payload["exp"] - payload["iat"] == 7 * 60


def test_refresh_token_lives_for_the_configured_days() -> None:
    config = settings(refresh_token_ttl_days=3)
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.REFRESH, config)

    payload = jwt.decode(token, SECRET, algorithms=["HS256"], audience="futsal-stats-app")

    assert payload["exp"] - payload["iat"] == 3 * 24 * 3600


def test_token_signed_with_another_secret_is_rejected() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings())

    with pytest.raises(TokenError):
        decode_token(
            token,
            TokenType.ACCESS,
            Settings(_env_file=None, jwt_secret="Aq1-Ws2_Ed3rFt4Gy5Hu6Ji7Ko8Lp9Zx0Cv"),
        )


def test_wrong_audience_is_rejected() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings(jwt_audience="other"))

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_wrong_issuer_is_rejected() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings(jwt_issuer="other"))

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_unsigned_token_is_rejected() -> None:
    token = jwt.encode(forged_payload(), key=None, algorithm="none")  # type: ignore[arg-type]

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_garbage_is_rejected() -> None:
    with pytest.raises(TokenError):
        decode_token("not.a.token", TokenType.ACCESS, settings())


def test_unknown_role_in_token_is_rejected() -> None:
    token = jwt.encode(forged_payload(role="admin"), SECRET, algorithm="HS256")

    with pytest.raises(TokenError):
        decode_token(token, TokenType.ACCESS, settings())


def test_missing_secret_is_a_configuration_error() -> None:
    config = Settings(_env_file=None, jwt_secret=None)

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        create_token(USER_ID, Role.HEAD_COACH, TokenType.ACCESS, config)


def test_short_secret_is_a_configuration_error() -> None:
    with pytest.raises(RuntimeError, match="32"):
        Settings(_env_file=None, jwt_secret="short").require_jwt_secret()


def test_wildcard_cors_origin_is_rejected() -> None:
    with pytest.raises(ValueError, match="CORS"):
        Settings(_env_file=None, cors_origins=["*"])


def test_refresh_token_round_trips_its_jti() -> None:
    jti = uuid.uuid4()
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.REFRESH, settings(), jti=jti)

    claims = decode_token(token, TokenType.REFRESH, settings())

    assert claims.jti == jti


def test_a_token_without_jti_decodes_with_none() -> None:
    token = create_token(USER_ID, Role.HEAD_COACH, TokenType.REFRESH, settings())

    assert decode_token(token, TokenType.REFRESH, settings()).jti is None


def test_a_malformed_jti_is_rejected() -> None:
    payload = {**forged_payload(), "type": "refresh", "jti": "no-es-un-uuid"}
    token = jwt.encode(payload, SECRET, algorithm="HS256")

    with pytest.raises(TokenError):
        decode_token(token, TokenType.REFRESH, settings())


def test_expiry_is_capped_by_the_absolute_limit() -> None:
    issued = datetime.now(UTC)
    cap = issued + timedelta(days=3)
    token = create_token(
        USER_ID, Role.HEAD_COACH, TokenType.REFRESH, settings(), now=issued, expires_cap=cap
    )

    exp = jwt.decode(token, SECRET, algorithms=["HS256"], options={"verify_aud": False})["exp"]

    assert exp == int(cap.timestamp())


def test_a_cap_beyond_the_normal_lifetime_does_not_extend_it() -> None:
    issued = datetime.now(UTC)
    cap = issued + timedelta(days=365)
    token = create_token(
        USER_ID, Role.HEAD_COACH, TokenType.ACCESS, settings(), now=issued, expires_cap=cap
    )

    exp = jwt.decode(token, SECRET, algorithms=["HS256"], options={"verify_aud": False})["exp"]

    assert exp == int((issued + timedelta(minutes=settings().access_token_ttl_minutes)).timestamp())
