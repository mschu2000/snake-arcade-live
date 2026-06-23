from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.store import SnakeArenaStore


def test_sign_up_log_in_submit_score_and_read_leaderboard(tmp_path: Path):
    db_path = tmp_path / "integration.sqlite3"
    store = SnakeArenaStore(database_url=f"sqlite:///{db_path}")
    app = create_app(store, seed_demo_data=False, seed_bots=False, start_bots=False)

    with TestClient(app) as client:
        signup = client.post("/auth/sign-up", json={"username": "integration-user", "password": "pass1234"})
        assert signup.status_code == 201
        signup_token = signup.headers["authorization"]
        assert signup_token.startswith("Bearer ")
        assert signup.json()["username"] == "integration-user"

        signout = client.post("/auth/sign-out", headers={"Authorization": signup_token})
        assert signout.status_code == 204

        signin = client.post("/auth/sign-in", json={"username": "integration-user", "password": "pass1234"})
        assert signin.status_code == 200
        signin_token = signin.headers["authorization"]
        assert signin_token.startswith("Bearer ")

        submit = client.post(
            "/scores",
            json={"mode": "walls", "score": 123},
            headers={"Authorization": signin_token},
        )
        assert submit.status_code == 201
        assert submit.json()["score"] == 123
        assert submit.json()["username"] == "integration-user"

        leaderboard = client.get("/leaderboard/walls?limit=10")
        assert leaderboard.status_code == 200
        assert leaderboard.json() == [
            {
                "id": submit.json()["id"],
                "userId": signin.json()["id"],
                "username": "integration-user",
                "mode": "walls",
                "score": 123,
                "createdAt": submit.json()["createdAt"],
            }
        ]
