from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.append(str(SRC))

from app.core.db import DB_PATH, init_db


def main() -> None:
    parser = argparse.ArgumentParser(description="Grant admin access to a user.")
    parser.add_argument("email", help="User email to update")
    args = parser.parse_args()

    init_db()
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("PRAGMA foreign_keys = ON;")
        cursor = connection.execute(
            "UPDATE users SET is_admin = 1 WHERE LOWER(email) = LOWER(?)",
            (args.email.strip(),),
        )
        if cursor.rowcount == 0:
            raise SystemExit("No user found with that email.")

    print(f"Admin access granted for {args.email}.")


if __name__ == "__main__":
    main()
