from __future__ import annotations

from datetime import datetime, timezone
import json
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
from app.core.hints import get_hint
from app.core.sudoku import generate_puzzle, validate_board

app = FastAPI(title="Sudoku App")

STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_PATH = STATIC_DIR / "index.html"
ADMIN_PATH = STATIC_DIR / "admin.html"
STYLE_PATH = STATIC_DIR / "style.css"
SCRIPT_PATH = STATIC_DIR / "app.js"
ADMIN_SCRIPT_PATH = STATIC_DIR / "admin.js"

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


class HintPayload(BoardPayload):
    # Optional pencil marks grid (9x9). Each entry is a list of candidate digits shown in the UI.
    notes: list[list[list[int]]] | None = None


class TimePayload(BaseModel):
    difficulty: str
    seconds: int = Field(ge=1)


class CustomPuzzlePayload(BaseModel):
    name: str
    puzzle: list[list[int]] = Field(min_length=9, max_length=9)
    solution: list[list[int]] | None = None


def get_current_user(request: Request) -> dict[str, object] | None:
    token = request.cookies.get("session")
    return get_user_by_session(token)


def require_admin(user: dict[str, object] | None = Depends(get_current_user)) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


def _normalize_difficulty(value: str) -> str:
    normalized = value.strip().lower()
    return normalized or "easy"


def _ensure_grid(grid: list[list[int]], label: str) -> list[list[int]]:
    if len(grid) != 9 or any(len(row) != 9 for row in grid):
        raise HTTPException(status_code=400, detail=f"{label} must be a 9x9 grid.")
    normalized: list[list[int]] = []
    for row in grid:
        normalized_row: list[int] = []
        for value in row:
            if not isinstance(value, int) or value < 0 or value > 9:
                raise HTTPException(status_code=400, detail=f"{label} digits must be 0-9.")
            normalized_row.append(value)
        normalized.append(normalized_row)
    return normalized


def _asset_url(path: Path) -> str:
    version = path.stat().st_mtime_ns
    return f"/static/{path.name}?v={version}"


@app.get("/")
def read_root() -> HTMLResponse:
    html = INDEX_PATH.read_text(encoding="utf-8")
    html = html.replace("/static/style.css", _asset_url(STYLE_PATH))
    html = html.replace("/static/app.js", _asset_url(SCRIPT_PATH))
    return HTMLResponse(html)


@app.get("/admin")
def read_admin(_: dict[str, object] = Depends(require_admin)) -> HTMLResponse:
    html = ADMIN_PATH.read_text(encoding="utf-8")
    html = html.replace("/static/style.css", _asset_url(STYLE_PATH))
    html = html.replace("/static/admin.js", _asset_url(ADMIN_SCRIPT_PATH))
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


@app.get("/api/custom-puzzles")
def list_custom_puzzles(user: dict[str, object] | None = Depends(get_current_user)) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    with get_db() as db:
        rows = db.execute(
            """
            SELECT id, name, solution_json
            FROM custom_puzzles
            ORDER BY name ASC
            """
        ).fetchall()
    puzzles = [
        {"id": row["id"], "name": row["name"], "has_solution": row["solution_json"] is not None}
        for row in rows
    ]
    return {"puzzles": puzzles}


@app.get("/api/custom-puzzles/{puzzle_id}")
def get_custom_puzzle(
    puzzle_id: int,
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    with get_db() as db:
        row = db.execute(
            """
            SELECT id, name, puzzle_json, solution_json
            FROM custom_puzzles
            WHERE id = ?
            """,
            (puzzle_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Custom puzzle not found.")
    puzzle = json.loads(row["puzzle_json"])
    solution = json.loads(row["solution_json"]) if row["solution_json"] else None
    return {"id": row["id"], "name": row["name"], "puzzle": puzzle, "solution": solution}


@app.get("/api/admin/custom-puzzles")
def list_admin_custom_puzzles(
    _: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    with get_db() as db:
        rows = db.execute(
            """
            SELECT id, name, solution_json, created_at
            FROM custom_puzzles
            ORDER BY created_at DESC
            """
        ).fetchall()
    puzzles = [
        {
            "id": row["id"],
            "name": row["name"],
            "has_solution": row["solution_json"] is not None,
            "created_at": row["created_at"],
        }
        for row in rows
    ]
    return {"puzzles": puzzles}


@app.get("/api/admin/custom-puzzles/{puzzle_id}")
def get_admin_custom_puzzle(
    puzzle_id: int,
    _: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    with get_db() as db:
        row = db.execute(
            """
            SELECT id, name, puzzle_json, solution_json
            FROM custom_puzzles
            WHERE id = ?
            """,
            (puzzle_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Custom puzzle not found.")
    puzzle = json.loads(row["puzzle_json"])
    solution = json.loads(row["solution_json"]) if row["solution_json"] else None
    return {"id": row["id"], "name": row["name"], "puzzle": puzzle, "solution": solution}


@app.post("/api/admin/custom-puzzles")
def create_custom_puzzle(
    payload: CustomPuzzlePayload,
    user: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Puzzle name is required.")

    puzzle = _ensure_grid(payload.puzzle, "Puzzle")
    validation = validate_board(puzzle)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail="Puzzle has conflicting digits.")

    solution_json = None
    if payload.solution is not None:
        solution = _ensure_grid(payload.solution, "Solution")
        solution_validation = validate_board(solution)
        if not solution_validation["valid"] or not solution_validation["complete"]:
            raise HTTPException(status_code=400, detail="Solution must be a complete valid grid.")
        for r in range(9):
            for c in range(9):
                if puzzle[r][c] != 0 and puzzle[r][c] != solution[r][c]:
                    raise HTTPException(
                        status_code=400,
                        detail="Solution does not match the puzzle givens.",
                    )
        solution_json = json.dumps(solution)

    now = datetime.now(timezone.utc).isoformat()
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM custom_puzzles WHERE name = ?",
            (name,),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Puzzle name must be unique.")
        cursor = db.execute(
            """
            INSERT INTO custom_puzzles (name, puzzle_json, solution_json, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                json.dumps(puzzle),
                solution_json,
                user["id"],
                now,
                now,
            ),
        )
        puzzle_id = cursor.lastrowid
    return {"id": puzzle_id, "name": name, "has_solution": solution_json is not None}


@app.put("/api/admin/custom-puzzles/{puzzle_id}")
def update_custom_puzzle(
    puzzle_id: int,
    payload: CustomPuzzlePayload,
    user: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Puzzle name is required.")

    puzzle = _ensure_grid(payload.puzzle, "Puzzle")
    validation = validate_board(puzzle)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail="Puzzle has conflicting digits.")

    solution_json = None
    if payload.solution is not None:
        solution = _ensure_grid(payload.solution, "Solution")
        solution_validation = validate_board(solution)
        if not solution_validation["valid"] or not solution_validation["complete"]:
            raise HTTPException(status_code=400, detail="Solution must be a complete valid grid.")
        for r in range(9):
            for c in range(9):
                if puzzle[r][c] != 0 and puzzle[r][c] != solution[r][c]:
                    raise HTTPException(
                        status_code=400,
                        detail="Solution does not match the puzzle givens.",
                    )
        solution_json = json.dumps(solution)

    now = datetime.now(timezone.utc).isoformat()
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM custom_puzzles WHERE id = ?",
            (puzzle_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Custom puzzle not found.")
        name_conflict = db.execute(
            "SELECT id FROM custom_puzzles WHERE name = ? AND id <> ?",
            (name, puzzle_id),
        ).fetchone()
        if name_conflict:
            raise HTTPException(status_code=400, detail="Puzzle name must be unique.")
        db.execute(
            """
            UPDATE custom_puzzles
            SET name = ?, puzzle_json = ?, solution_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (name, json.dumps(puzzle), solution_json, now, puzzle_id),
        )
    return {"id": puzzle_id, "name": name, "has_solution": solution_json is not None}


@app.delete("/api/admin/custom-puzzles/{puzzle_id}")
def delete_custom_puzzle(
    puzzle_id: int,
    _: dict[str, object] = Depends(require_admin),
) -> dict[str, str]:
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM custom_puzzles WHERE id = ?",
            (puzzle_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Custom puzzle not found.")
        db.execute("DELETE FROM custom_puzzles WHERE id = ?", (puzzle_id,))
    return {"status": "ok"}


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


@app.post("/api/hint")
def hint(payload: HintPayload) -> dict[str, object]:
    return get_hint(payload.board, payload.notes)


@app.get("/api/best-time")
def best_time(
    difficulty: str = "easy",
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    normalized = _normalize_difficulty(difficulty)
    with get_db() as db:
        row = db.execute(
            """
            SELECT best_seconds
            FROM best_times
            WHERE user_id = ? AND difficulty = ?
            """,
            (user["id"], normalized),
        ).fetchone()

    return {"difficulty": normalized, "best_seconds": row["best_seconds"] if row else None}


@app.post("/api/record-time")
def record_time(
    payload: TimePayload,
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    normalized = _normalize_difficulty(payload.difficulty)
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as db:
        row = db.execute(
            """
            SELECT id, best_seconds
            FROM best_times
            WHERE user_id = ? AND difficulty = ?
            """,
            (user["id"], normalized),
        ).fetchone()

        if not row:
            db.execute(
                """
                INSERT INTO best_times (user_id, difficulty, best_seconds, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user["id"], normalized, payload.seconds, now, now),
            )
            return {"difficulty": normalized, "best_seconds": payload.seconds, "new_record": True}

        best_seconds = int(row["best_seconds"])
        if payload.seconds < best_seconds:
            db.execute(
                """
                UPDATE best_times
                SET best_seconds = ?, updated_at = ?
                WHERE id = ?
                """,
                (payload.seconds, now, row["id"]),
            )
            return {"difficulty": normalized, "best_seconds": payload.seconds, "new_record": True}

    return {"difficulty": normalized, "best_seconds": best_seconds, "new_record": False}


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
