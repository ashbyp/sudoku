from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.core.sudoku import generate_puzzle, validate_board

app = FastAPI(title="Sudoku App")

STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_PATH = STATIC_DIR / "index.html"
STYLE_PATH = STATIC_DIR / "style.css"
SCRIPT_PATH = STATIC_DIR / "app.js"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def disable_browser_cache(request: Request, call_next):
    response = await call_next(request)

    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response


class BoardPayload(BaseModel):
    board: list[list[int]] = Field(min_length=9, max_length=9)


def _asset_url(path: Path) -> str:
    version = path.stat().st_mtime_ns
    return f"/static/{path.name}?v={version}"


@app.get("/")
def read_root() -> HTMLResponse:
    html = INDEX_PATH.read_text(encoding="utf-8")
    html = html.replace("/static/style.css", _asset_url(STYLE_PATH))
    html = html.replace("/static/app.js", _asset_url(SCRIPT_PATH))
    return HTMLResponse(html)


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
