from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.core.sudoku import generate_puzzle, validate_board

app = FastAPI(title="Sudoku App")

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class BoardPayload(BaseModel):
    board: list[list[int]] = Field(min_length=9, max_length=9)


@app.get("/")
def read_root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


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
