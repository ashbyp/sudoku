from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core.db import AVATAR_DIR, init_db
from app.routers.auth import router as auth_router
from app.routers.custom_puzzles import router as custom_puzzles_router
from app.routers.deps import require_admin
from app.routers.gameplay import router as gameplay_router

app = FastAPI(title="Sudoku App")

STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_PATH = STATIC_DIR / "index.html"
ADMIN_PATH = STATIC_DIR / "admin.html"
STYLE_PATH = STATIC_DIR / "style.css"
SCRIPT_PATH = STATIC_DIR / "app.js"
ADMIN_SCRIPT_PATH = STATIC_DIR / "admin.js"

AVATAR_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/avatars", StaticFiles(directory=AVATAR_DIR), name="avatars")


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


app.include_router(auth_router)
app.include_router(custom_puzzles_router)
app.include_router(gameplay_router)
