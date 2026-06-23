from __future__ import annotations

import asyncio
import os
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers.auth import build_auth_router
from .routers.games import build_games_router
from .routers.leaderboard import build_leaderboard_router
from .store import SnakeArenaStore, store

FRONTEND_DIST_DIR = Path(
    os.getenv("FRONTEND_DIST_DIR")
    or Path(__file__).resolve().parents[2] / "static"
)
FRONTEND_SSR_PORT = int(os.getenv("FRONTEND_SSR_PORT", "3001"))
FRONTEND_SSR_URL = f"http://127.0.0.1:{FRONTEND_SSR_PORT}"


@dataclass(slots=True)
class FrontendSSRProcess:
    process: asyncio.subprocess.Process | None = None


frontend_ssr = FrontendSSRProcess()


def _is_api_path(path: str) -> bool:
    return path.startswith(
        (
            "/auth",
            "/games",
            "/leaderboard",
            "/scores",
            "/docs",
            "/redoc",
            "/openapi.json",
        )
    )


def _frontend_ssr_script() -> Path:
    return Path(__file__).with_name("frontend_ssr.mjs")


def _frontend_ssr_is_available() -> bool:
    script = _frontend_ssr_script()
    server_entry = FRONTEND_DIST_DIR / "server" / "server.js"
    return script.is_file() and server_entry.is_file()


async def _wait_for_frontend_ssr_ready(timeout_seconds: float = 15.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    url = f"{FRONTEND_SSR_URL}/__health"
    last_error: Exception | None = None

    while asyncio.get_running_loop().time() < deadline:
        try:
            def probe() -> int:
                with urllib.request.urlopen(url, timeout=1) as response:
                    return response.status

            if await asyncio.to_thread(probe) == 200:
                return
        except Exception as exc:  # pragma: no cover - startup retry path
            last_error = exc
        await asyncio.sleep(0.2)

    raise RuntimeError(f"Frontend SSR server failed to start: {last_error}")


async def _start_frontend_ssr() -> None:
    if not _frontend_ssr_is_available():
        frontend_ssr.process = None
        return

    if frontend_ssr.process is not None and frontend_ssr.process.returncode is None:
        return

    script = _frontend_ssr_script()
    env = os.environ.copy()
    env["FRONTEND_DIST_DIR"] = str(FRONTEND_DIST_DIR)
    env["FRONTEND_SSR_PORT"] = str(FRONTEND_SSR_PORT)

    frontend_ssr.process = await asyncio.create_subprocess_exec(
        "node",
        str(script),
        cwd=str(Path(__file__).resolve().parents[1]),
        env=env,
    )
    await _wait_for_frontend_ssr_ready()


async def _stop_frontend_ssr() -> None:
    process = frontend_ssr.process
    if process is None:
        return

    if process.returncode is None:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except TimeoutError:  # pragma: no cover - defensive shutdown path
            process.kill()
            await process.wait()
    frontend_ssr.process = None


async def _proxy_frontend_request(request: Request) -> Response:
    if frontend_ssr.process is None or frontend_ssr.process.returncode is not None:
        return JSONResponse({"detail": "Frontend SSR bundle is not available"}, status_code=503)

    url = f"{FRONTEND_SSR_URL}{request.url.path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in {"host", "content-length", "connection", "accept-encoding"}
    }

    method = request.method
    body = await request.body()

    def fetch() -> tuple[int, dict[str, str], bytes]:
        proxy_request = urllib.request.Request(url, data=body if body else None, headers=headers, method=method)
        try:
            with urllib.request.urlopen(proxy_request, timeout=30) as response:
                return response.status, dict(response.headers.items()), response.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers.items()), error.read()

    status_code, response_headers, response_body = await asyncio.to_thread(fetch)
    headers_to_return = {
        key: value
        for key, value in response_headers.items()
        if key.lower() not in {"transfer-encoding", "content-length", "connection"}
    }
    content_type = response_headers.get("Content-Type")
    if content_type:
        headers_to_return["content-type"] = content_type
    return Response(content=response_body, status_code=status_code, headers=headers_to_return)


def create_app(
    store_override: SnakeArenaStore | None = None,
    *,
    seed_demo_data: bool = True,
    seed_bots: bool = True,
    start_bots: bool = True,
) -> FastAPI:
    app_store = store_override or store

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await _start_frontend_ssr()
        if seed_demo_data:
            app_store.seed_demo_data()
        if seed_bots:
            app_store.seed_bots()
        task = asyncio.create_task(app_store.run_bots()) if start_bots else None
        app_store.bot_task = task
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            await _stop_frontend_ssr()

    app = FastAPI(title="Snake Arena API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:4173", "http://localhost:3000", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(build_auth_router(app_store))
    app.include_router(build_leaderboard_router(app_store))
    app.include_router(build_games_router(app_store))

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str, request: Request):
        if _is_api_path(f"/{path}") or path == "health":
            return JSONResponse({"detail": "Not found"}, status_code=404)
        return await _proxy_frontend_request(request)

    app.state.store = app_store
    return app


app = create_app(store)
