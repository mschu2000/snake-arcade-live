from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app, store


@pytest.fixture(autouse=True)
def reset_store():
    store.users_by_name.clear()
    store.users_by_id.clear()
    store.sessions.clear()
    store.scores.clear()
    store.games.clear()
    store.game_subscribers.clear()
    store.active_subscribers.clear()
    store.bot_states.clear()
    yield
    store.users_by_name.clear()
    store.users_by_id.clear()
    store.sessions.clear()
    store.scores.clear()
    store.games.clear()
    store.game_subscribers.clear()
    store.active_subscribers.clear()
    store.bot_states.clear()


def client() -> TestClient:
    return TestClient(app)


def test_sign_up_sign_in_and_me():
    with client() as c:
        res = c.post("/auth/sign-up", json={"username": "alice", "password": "pass1234"})
        assert res.status_code == 201
        assert res.json()["username"] == "alice"

        me = c.get("/auth/me")
        assert me.status_code == 200
        assert me.json()["username"] == "alice"

        c.post("/auth/sign-out")
        me2 = c.get("/auth/me")
        assert me2.status_code == 401

        signin = c.post("/auth/sign-in", json={"username": "alice", "password": "pass1234"})
        assert signin.status_code == 200
        assert signin.json()["id"] == res.json()["id"]


def test_duplicate_username_rejected():
    with client() as c:
        assert c.post("/auth/sign-up", json={"username": "bob", "password": "pass1234"}).status_code == 201
        dup = c.post("/auth/sign-up", json={"username": "bob", "password": "other1234"})
        assert dup.status_code == 409


def test_leaderboard_and_score_submission_require_auth():
    with client() as c:
        no_auth = c.post("/scores", json={"mode": "walls", "score": 10})
        assert no_auth.status_code == 401

        c.post("/auth/sign-up", json={"username": "carol", "password": "pass1234"})
        c.post("/scores", json={"mode": "walls", "score": 30})
        c.post("/scores", json={"mode": "walls", "score": 80})
        c.post("/scores", json={"mode": "wrap", "score": 50})

        walls = c.get("/leaderboard/walls")
        assert walls.status_code == 200
        assert [entry["score"] for entry in walls.json()] == [140, 90, 80, 30]

        wrap = c.get("/leaderboard/wrap?limit=1")
        assert wrap.status_code == 200
        assert [entry["score"] for entry in wrap.json()] == [110]


def test_bearer_tokens_work_and_passwords_are_hashed():
    with client() as c:
        signup = c.post("/auth/sign-up", json={"username": "dana", "password": "pass1234"})
        assert signup.status_code == 201
        token = signup.headers["authorization"]
        assert token.startswith("Bearer ")

        stored = store.users_by_name["dana"]
        assert stored.password_hash != "pass1234"
        assert stored.password_hash.startswith("pbkdf2_sha256$")

        c.cookies.clear()
        me = c.get("/auth/me", headers={"Authorization": token})
        assert me.status_code == 200
        assert me.json()["username"] == "dana"

        score = c.post("/scores", json={"mode": "wrap", "score": 70}, headers={"Authorization": token})
        assert score.status_code == 201

        signout = c.post("/auth/sign-out", headers={"Authorization": token})
        assert signout.status_code == 204

        me_after = c.get("/auth/me", headers={"Authorization": token})
        assert me_after.status_code == 401


def test_games_endpoints_expose_bot_games():
    with client() as c:
        games = c.get("/games")
        assert games.status_code == 200
        assert len(games.json()) >= 1
        first = games.json()[0]
        game = c.get(f"/games/{first['id']}")
        assert game.status_code == 200
        assert game.json()["id"] == first["id"]


def test_publish_game_requires_auth_and_matches_path():
    with client() as c:
        payload = {
            "id": "me-1",
            "username": "zoe",
            "mode": "walls",
            "state": {
                "width": 22,
                "height": 22,
                "mode": "walls",
                "snake": [{"x": 11, "y": 11}],
                "dir": "right",
                "queuedDir": "right",
                "food": {"x": 5, "y": 5},
                "score": 0,
                "alive": True,
                "tick": 0,
            },
            "isBot": False,
            "updatedAt": 1,
        }

        assert c.put("/games/me-1", json=payload).status_code == 401

        c.post("/auth/sign-up", json={"username": "zoe", "password": "pass1234"})
        ok = c.put("/games/me-1", json=payload)
        assert ok.status_code == 200
