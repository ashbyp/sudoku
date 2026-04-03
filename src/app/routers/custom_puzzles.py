import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.db import get_db
from app.core.sudoku import validate_board
from app.routers.deps import ensure_grid, get_current_user, require_admin
from app.schemas import BoardPayload, CustomPuzzlePayload

router = APIRouter()


@router.get("/api/custom-puzzles")
def list_custom_puzzles(user: dict[str, object] | None = Depends(get_current_user)) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    with get_db() as db:
        rows = db.execute(
            """
            SELECT custom_puzzles.id,
                   custom_puzzles.name,
                   custom_puzzles.solution_json,
                   CASE WHEN custom_puzzle_completions.user_id IS NULL THEN 0 ELSE 1 END AS completed
            FROM custom_puzzles
            LEFT JOIN custom_puzzle_completions
              ON custom_puzzles.id = custom_puzzle_completions.puzzle_id
             AND custom_puzzle_completions.user_id = ?
            WHERE custom_puzzles.archived_at IS NULL
            ORDER BY name ASC
            """,
            (user["id"],),
        ).fetchall()
    puzzles = [
        {
            "id": row["id"],
            "name": row["name"],
            "has_solution": row["solution_json"] is not None,
            "completed": bool(row["completed"]),
        }
        for row in rows
    ]
    return {"puzzles": puzzles}


@router.get("/api/custom-puzzles/{puzzle_id}")
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


@router.post("/api/custom-puzzles/{puzzle_id}/solution")
def save_custom_puzzle_solution(
    puzzle_id: int,
    payload: BoardPayload,
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    solution = ensure_grid(payload.board, "Solution")
    solution_validation = validate_board(solution)
    if not solution_validation["valid"] or not solution_validation["complete"]:
        raise HTTPException(status_code=400, detail="Solution must be a complete valid grid.")

    with get_db() as db:
        row = db.execute(
            """
            SELECT puzzle_json, solution_json
            FROM custom_puzzles
            WHERE id = ?
            """,
            (puzzle_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Custom puzzle not found.")
        if row["solution_json"]:
            raise HTTPException(status_code=400, detail="Solution already stored.")
        puzzle = json.loads(row["puzzle_json"])
        for r in range(9):
            for c in range(9):
                if puzzle[r][c] != 0 and puzzle[r][c] != solution[r][c]:
                    raise HTTPException(
                        status_code=400,
                        detail="Solution does not match the puzzle givens.",
                    )
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """
            UPDATE custom_puzzles
            SET solution_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(solution), now, puzzle_id),
        )

    return {"status": "ok"}


@router.post("/api/custom-puzzles/{puzzle_id}/complete")
def complete_custom_puzzle(
    puzzle_id: int,
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM custom_puzzles WHERE id = ?",
            (puzzle_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Custom puzzle not found.")
        db.execute(
            """
            INSERT OR IGNORE INTO custom_puzzle_completions (user_id, puzzle_id, completed_at)
            VALUES (?, ?, ?)
            """,
            (user["id"], puzzle_id, now),
        )
    return {"status": "ok"}


@router.get("/api/admin/custom-puzzles")
def list_admin_custom_puzzles(
    _: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    with get_db() as db:
        rows = db.execute(
            """
            SELECT custom_puzzles.id,
                   custom_puzzles.name,
                   custom_puzzles.solution_json,
                   custom_puzzles.created_at,
                   custom_puzzles.archived_at,
                   COUNT(custom_puzzle_completions.user_id) AS completion_count
            FROM custom_puzzles
            LEFT JOIN custom_puzzle_completions
              ON custom_puzzles.id = custom_puzzle_completions.puzzle_id
            GROUP BY custom_puzzles.id
            ORDER BY custom_puzzles.created_at DESC
            """
        ).fetchall()
    puzzles = [
        {
            "id": row["id"],
            "name": row["name"],
            "has_solution": row["solution_json"] is not None,
            "created_at": row["created_at"],
            "archived": row["archived_at"] is not None,
            "completion_count": int(row["completion_count"] or 0),
        }
        for row in rows
    ]
    return {"puzzles": puzzles}


@router.get("/api/admin/custom-puzzles/{puzzle_id}")
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


@router.post("/api/admin/custom-puzzles")
def create_custom_puzzle(
    payload: CustomPuzzlePayload,
    user: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Puzzle name is required.")

    puzzle = ensure_grid(payload.puzzle, "Puzzle")
    validation = validate_board(puzzle)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail="Puzzle has conflicting digits.")

    solution_json = None
    if payload.solution is not None:
        solution = ensure_grid(payload.solution, "Solution")
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


@router.put("/api/admin/custom-puzzles/{puzzle_id}")
def update_custom_puzzle(
    puzzle_id: int,
    payload: CustomPuzzlePayload,
    user: dict[str, object] = Depends(require_admin),
) -> dict[str, object]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Puzzle name is required.")

    puzzle = ensure_grid(payload.puzzle, "Puzzle")
    validation = validate_board(puzzle)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail="Puzzle has conflicting digits.")

    solution_json = None
    if payload.solution is not None:
        solution = ensure_grid(payload.solution, "Solution")
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


@router.delete("/api/admin/custom-puzzles/{puzzle_id}")
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


@router.post("/api/admin/custom-puzzles/{puzzle_id}/archive")
def archive_custom_puzzle(
    puzzle_id: int,
    _: dict[str, object] = Depends(require_admin),
) -> dict[str, str]:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM custom_puzzles WHERE id = ?",
            (puzzle_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Custom puzzle not found.")
        db.execute(
            "UPDATE custom_puzzles SET archived_at = ? WHERE id = ?",
            (now, puzzle_id),
        )
    return {"status": "ok"}


@router.post("/api/admin/custom-puzzles/{puzzle_id}/unarchive")
def unarchive_custom_puzzle(
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
        db.execute(
            "UPDATE custom_puzzles SET archived_at = NULL WHERE id = ?",
            (puzzle_id,),
        )
    return {"status": "ok"}
