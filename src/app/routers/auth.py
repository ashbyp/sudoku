from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile

from app.core.auth import create_session, delete_session, hash_password, verify_password
from app.core.db import AVATAR_DIR, get_db
from app.routers.deps import get_current_user
from app.schemas import AuthPayload

router = APIRouter()

ALLOWED_AVATAR_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
MAX_AVATAR_BYTES = 2 * 1024 * 1024


@router.post("/api/register")
def register(payload: AuthPayload, request: Request, response: Response) -> dict[str, object]:
    email = payload.email.strip().lower()
    password = payload.password

    if "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    is_admin = email == "ashbyp@yahoo.co.uk"

    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered.")
        password_hash = hash_password(password)
        created_at = datetime.now(timezone.utc).isoformat()
        cursor = db.execute(
            "INSERT INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)",
            (email, password_hash, 1 if is_admin else 0, created_at),
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
    return {"id": user_id, "email": email, "avatar_url": None, "is_admin": is_admin}


@router.post("/api/login")
def login(payload: AuthPayload, request: Request, response: Response) -> dict[str, object]:
    email = payload.email.strip().lower()
    password = payload.password

    with get_db() as db:
        row = db.execute(
            "SELECT id, password_hash, avatar_path, is_admin FROM users WHERE email = ?",
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
    avatar_path = row["avatar_path"]
    avatar_url = f"/avatars/{avatar_path}" if avatar_path else None
    return {
        "id": user_id,
        "email": email,
        "avatar_url": avatar_url,
        "is_admin": bool(row["is_admin"]),
    }


@router.post("/api/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: dict[str, object] | None = Depends(get_current_user),
) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="Avatar must be a PNG, JPEG, or WEBP image.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Avatar upload was empty.")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Avatar must be under 2MB.")

    ext = ALLOWED_AVATAR_TYPES[content_type]
    timestamp = int(datetime.now(timezone.utc).timestamp())
    filename = f"user_{user['id']}_{timestamp}.{ext}"
    target = AVATAR_DIR / filename
    target.write_bytes(data)

    with get_db() as db:
        row = db.execute(
            "SELECT avatar_path FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        previous = row["avatar_path"] if row else None
        db.execute(
            "UPDATE users SET avatar_path = ? WHERE id = ?",
            (filename, user["id"]),
        )

    if previous and previous != filename:
        prior_path = AVATAR_DIR / previous
        if prior_path.exists():
            try:
                prior_path.unlink()
            except OSError:
                pass

    return {"avatar_url": f"/avatars/{filename}"}


@router.post("/api/logout")
def logout(request: Request, response: Response) -> dict[str, str]:
    token = request.cookies.get("session")
    if token:
        delete_session(token)
    response.delete_cookie("session")
    return {"status": "ok"}


@router.get("/api/me")
def me(user: dict[str, object] | None = Depends(get_current_user)) -> dict[str, object]:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user
