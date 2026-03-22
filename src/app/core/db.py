from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

# Vercel serverless functions run on a read-only filesystem, except for /tmp.
# Use /tmp for SQLite storage when deployed there.
if os.getenv("VERCEL") or os.getenv("VERCEL_ENV"):
    DATA_DIR = Path(os.getenv("SQLITE_DIR", "/tmp"))
else:
    DATA_DIR = BASE_DIR / "data"

DB_PATH = DATA_DIR / "app.db"

def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("PRAGMA foreign_keys = ON;")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS puzzle_saves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                puzzle_json TEXT NOT NULL,
                notes_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS best_times (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                difficulty TEXT NOT NULL,
                best_seconds INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, difficulty),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_puzzles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                puzzle_json TEXT NOT NULL,
                solution_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                created_by INTEGER,
                FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
            );
            """
        )
        puzzle_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(custom_puzzles);").fetchall()
        }
        if "created_by" not in puzzle_columns:
            connection.execute("ALTER TABLE custom_puzzles ADD COLUMN created_by INTEGER;")
        if "solution_json" not in puzzle_columns:
            connection.execute("ALTER TABLE custom_puzzles ADD COLUMN solution_json TEXT;")
        if "updated_at" not in puzzle_columns:
            connection.execute(
                "ALTER TABLE custom_puzzles ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';"
            )
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(users);").fetchall()
        }
        if "is_admin" not in columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;"
            )
        connection.commit()


@contextmanager
def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys = ON;")
        yield connection
        connection.commit()
    finally:
        connection.close()
