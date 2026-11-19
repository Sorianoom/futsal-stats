"""Fotos de los jugadores: las sube el entrenador principal y las ve cualquiera con el enlace."""

from typing import Any

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
MAX_PHOTO_BYTES = 300 * 1024


async def upload(
    client: AsyncClient,
    headers: dict[str, str],
    player_id: object,
    body: bytes = JPEG,
    content_type: str = "image/jpeg",
) -> Any:
    return await client.put(
        f"/players/{player_id}/photo",
        content=body,
        headers={**headers, "Content-Type": content_type},
    )


async def test_the_head_coach_uploads_a_photo_that_anyone_with_the_link_sees(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)

    response = await upload(client, headers, player.id)

    assert response.status_code == 200, response.text
    url = response.json()["data"]["photo_url"]
    assert url.startswith("/player-photos/")
    photo = await client.get(url)
    assert photo.status_code == 200
    assert photo.content == JPEG
    assert photo.headers["content-type"] == "image/jpeg"
    assert "immutable" in photo.headers["cache-control"]
    listed = await client.get("/players", headers=headers)
    assert listed.json()["data"][0]["photo_url"] == url


async def test_without_photo_the_url_is_null(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)

    response = await client.get(f"/players/{player.id}", headers=headers)

    assert response.json()["data"]["photo_url"] is None


async def test_replacing_the_photo_changes_the_link_and_the_old_one_stops_working(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)
    first = (await upload(client, headers, player.id)).json()["data"]["photo_url"]

    second = (await upload(client, headers, player.id, WEBP, "image/webp")).json()["data"][
        "photo_url"
    ]

    assert second != first
    assert (await client.get(first)).status_code == 404
    photo = await client.get(second)
    assert (photo.content, photo.headers["content-type"]) == (WEBP, "image/webp")


async def test_the_photo_can_be_removed(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)
    url = (await upload(client, headers, player.id, PNG, "image/png")).json()["data"]["photo_url"]

    response = await client.delete(f"/players/{player.id}/photo", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"]["photo_url"] is None
    assert (await client.get(url)).status_code == 404


async def test_only_the_head_coach_changes_photos(
    client: AsyncClient, login: Login, make_player: MakePlayer, player_headers: dict[str, str]
) -> None:
    assistant = await login(Role.ASSISTANT_COACH)
    player = await make_player(7)

    for headers in (assistant, player_headers):
        assert (await upload(client, headers, player.id)).status_code == 403
        assert (
            await client.delete(f"/players/{player.id}/photo", headers=headers)
        ).status_code == 403
    assert (await upload(client, {}, player.id)).status_code == 401


async def test_a_photo_must_be_a_real_jpeg_png_or_webp(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)

    not_an_image = await upload(client, headers, player.id, b"<svg></svg>", "image/jpeg")
    svg = await upload(client, headers, player.id, b"<svg></svg>", "image/svg+xml")
    mismatch = await upload(client, headers, player.id, PNG, "image/jpeg")
    empty = await upload(client, headers, player.id, b"", "image/jpeg")

    for response in (not_an_image, svg, mismatch, empty):
        assert response.status_code == 422, response.text


async def test_a_photo_cannot_be_too_big(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)

    response = await upload(client, headers, player.id, JPEG + b"\x00" * MAX_PHOTO_BYTES)

    assert response.status_code == 413


async def test_unknown_player_or_link_is_not_found(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)
    missing = "00000000-0000-0000-0000-000000000000"

    assert (await upload(client, headers, missing)).status_code == 404
    assert (await client.delete(f"/players/{missing}/photo", headers=headers)).status_code == 404
    assert (await client.get(f"/player-photos/{missing}")).status_code == 404
    assert (await client.get("/player-photos/not-a-token")).status_code == 404


async def test_the_fantasy_shows_each_player_photo(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    players = [await make_player(n) for n in range(1, 7)]
    for player in players:
        await upload(client, headers, player.id)
    created = await client.post("/fantasy/league", headers=headers)
    assert created.status_code == 201, created.text

    me = (await client.get("/fantasy/me", headers=headers)).json()["data"]
    market = (await client.get("/fantasy/market", headers=headers)).json()["data"]["listings"]
    clauses = (await client.get("/fantasy/clauses", headers=headers)).json()["data"]["copies"]

    rows = [*me["squad"], *market, *clauses]
    assert rows
    assert all(row["photo_url"].startswith("/player-photos/") for row in rows)
