from fastapi import Depends, HTTPException, Request

from app.core.auth import get_user_by_session


def get_current_user(request: Request) -> dict[str, object] | None:
    token = request.cookies.get("session")
    return get_user_by_session(token)


def require_admin(user: dict[str, object] | None = Depends(get_current_user)) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


def normalize_difficulty(value: str) -> str:
    normalized = value.strip().lower()
    return normalized or "easy"


def ensure_grid(grid: list[list[int]], label: str) -> list[list[int]]:
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


def ensure_notes(notes: list[list[list[int]]] | None) -> list[list[list[int]]]:
    if not notes:
        return [[[] for _ in range(9)] for _ in range(9)]
    if len(notes) != 9 or any(not isinstance(row, list) or len(row) != 9 for row in notes):
        raise HTTPException(status_code=400, detail="Notes must be a 9x9 grid.")
    normalized: list[list[list[int]]] = []
    for row in notes:
        normalized_row: list[list[int]] = []
        for entry in row:
            if entry is None:
                normalized_row.append([])
                continue
            if not isinstance(entry, list):
                raise HTTPException(status_code=400, detail="Notes entries must be lists.")
            digits: list[int] = []
            for value in entry:
                if not isinstance(value, int) or value < 1 or value > 9:
                    continue
                if value not in digits:
                    digits.append(value)
            normalized_row.append(digits)
        normalized.append(normalized_row)
    return normalized
