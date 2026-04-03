import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.db import get_db
from app.core.hints import get_hint
from app.core.sudoku import generate_puzzle, validate_board
from app.routers.deps import ensure_center_notes, ensure_grid, ensure_notes, get_current_user, normalize_difficulty
from app.schemas import BoardPayload, HintPayload, PuzzleSavePayload, TimePayload

router = APIRouter()


@router.get("/api/puzzle")
def get_puzzle(difficulty: str = "easy") -> dict[str, object]:
    puzzle, solution = generate_puzzle(difficulty=difficulty)
    return {
        "difficulty": difficulty.lower(),
        "puzzle": puzzle,
        "solution": solution,
    }


@router.post("/api/check-board")
def check_board(payload: BoardPayload) -> dict[str, object]:
    return validate_board(payload.board)


@router.post("/api/hint")
def hint(payload: HintPayload) -> dict[str, object]:
    return get_hint(payload.board, payload.notes)


@router.get("/api/best-time")
def best_time(
    difficulty: str = "easy",
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    normalized = normalize_difficulty(difficulty)
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


@router.post("/api/record-time")
def record_time(
    payload: TimePayload,
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    normalized = normalize_difficulty(payload.difficulty)
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


@router.get("/api/puzzle-save")
def get_puzzle_save(
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    with get_db() as db:
        row = db.execute(
            """
            SELECT puzzle_json, notes_json
            FROM puzzle_saves
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user["id"],),
        ).fetchone()
    if not row:
        return {"save": None}
    payload = json.loads(row["puzzle_json"]) if row["puzzle_json"] else {}
    payload["notes"] = json.loads(row["notes_json"]) if row["notes_json"] else []
    return {"save": payload}


@router.post("/api/puzzle-save")
def save_puzzle(
    payload: PuzzleSavePayload,
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, str]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    puzzle = ensure_grid(payload.puzzle, "Puzzle")
    current = ensure_grid(payload.current, "Current board")
    solution = ensure_grid(payload.solution, "Solution") if payload.solution is not None else None
    notes = ensure_notes(payload.notes)
    center_notes = ensure_center_notes(payload.center_notes)

    state = {
        "puzzle": puzzle,
        "current": current,
        "solution": solution,
        "difficulty": payload.difficulty,
        "custom_puzzle_id": payload.custom_puzzle_id,
        "has_solution": bool(payload.has_solution),
        "center_notes": center_notes,
        "elapsed_seconds": int(payload.elapsed_seconds),
    }

    now = datetime.now(timezone.utc).isoformat()
    with get_db() as db:
        db.execute("DELETE FROM puzzle_saves WHERE user_id = ?", (user["id"],))
        db.execute(
            """
            INSERT INTO puzzle_saves (user_id, puzzle_json, notes_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (user["id"], json.dumps(state), json.dumps(notes), now),
        )
    return {"status": "ok"}


@router.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
