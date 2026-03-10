from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.core.auth import (
    create_session,
    delete_session,
    get_user_by_session,
    hash_password,
    verify_password,
)
from app.core.db import get_db, init_db
from app.core.sudoku import generate_puzzle, validate_board

app = FastAPI(title="Sudoku App")

STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_PATH = STATIC_DIR / "index.html"
STYLE_PATH = STATIC_DIR / "style.css"
SCRIPT_PATH = STATIC_DIR / "app.js"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.middleware("http")
async def disable_browser_cache(request: Request, call_next):
    response = await call_next(request)

    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response


class AuthPayload(BaseModel):
    email: str
    password: str


class BoardPayload(BaseModel):
    board: list[list[int]] = Field(min_length=9, max_length=9)


def get_current_user(request: Request) -> dict[str, object] | None:
    token = request.cookies.get("session")
    return get_user_by_session(token)


def _asset_url(path: Path) -> str:
    version = path.stat().st_mtime_ns
    return f"/static/{path.name}?v={version}"


@app.get("/")
def read_root() -> HTMLResponse:
    html = INDEX_PATH.read_text(encoding="utf-8")
    html = html.replace("/static/style.css", _asset_url(STYLE_PATH))
    html = html.replace("/static/app.js", _asset_url(SCRIPT_PATH))
    return HTMLResponse(html)


@app.post("/api/register")
def register(payload: AuthPayload, request: Request, response: Response) -> dict[str, object]:
    email = payload.email.strip().lower()
    password = payload.password

    if "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered.")
        password_hash = hash_password(password)
        created_at = datetime.now(timezone.utc).isoformat()
        cursor = db.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email, password_hash, created_at),
        )
        user_id = cursor.lastrowid

    token = create_session(int(user_id))
    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return {"id": user_id, "email": email}


@app.post("/api/login")
def login(payload: AuthPayload, request: Request, response: Response) -> dict[str, object]:
    email = payload.email.strip().lower()
    password = payload.password

    with get_db() as db:
        row = db.execute(
            "SELECT id, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Invalid email or password.")
        user_id = row["id"]

    token = create_session(int(user_id))
    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return {"id": user_id, "email": email}


@app.post("/api/logout")
def logout(request: Request, response: Response) -> dict[str, str]:
    token = request.cookies.get("session")
    if token:
        delete_session(token)
    response.delete_cookie("session")
    return {"status": "ok"}


@app.get("/api/me")
def me(user: dict[str, object] | None = Depends(get_current_user)) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user


@app.get("/api/puzzle")
def get_puzzle(difficulty: str = "easy") -> dict[str, object]:
    puzzle, solution = generate_puzzle(difficulty=difficulty)
    return {
        "difficulty": difficulty.lower(),
        "puzzle": puzzle,
        "solution": solution,
    }


@app.post("/api/check-board")
def check_board(payload: BoardPayload) -> dict[str, object]:
    return validate_board(payload.board)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
