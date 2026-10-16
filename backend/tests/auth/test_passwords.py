from app.auth.passwords import hash_password, verify_password


def test_hash_is_not_the_plain_password() -> None:
    assert "correct horse" not in hash_password("correct horse")


def test_correct_password_verifies() -> None:
    assert verify_password("correct horse", hash_password("correct horse"))


def test_wrong_password_does_not_verify() -> None:
    assert not verify_password("battery staple", hash_password("correct horse"))


def test_same_password_hashes_differently_each_time() -> None:
    assert hash_password("correct horse") != hash_password("correct horse")


def test_malformed_hash_does_not_verify_and_does_not_raise() -> None:
    assert not verify_password("anything", "not-a-hash")
