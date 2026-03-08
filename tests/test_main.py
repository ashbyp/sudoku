from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Sudoku" in response.text


def test_get_puzzle() -> None:
    response = client.get("/api/puzzle?difficulty=medium")
    body = response.json()

    assert response.status_code == 200
    assert body["difficulty"] == "medium"
    assert len(body["puzzle"]) == 9
    assert len(body["solution"]) == 9
    assert sum(value == 0 for row in body["puzzle"] for value in row) > 0


def test_check_board_detects_conflict() -> None:
    board = [
        [1, 1, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]

    response = client.post("/api/check-board", json={"board": board})
    body = response.json()

    assert response.status_code == 200
    assert body["valid"] is False
    assert {"row": 0, "column": 0} in body["invalid_cells"]
    assert {"row": 0, "column": 1} in body["invalid_cells"]


def test_check_board_accepts_solved_grid() -> None:
    solution = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [4, 5, 6, 7, 8, 9, 1, 2, 3],
        [7, 8, 9, 1, 2, 3, 4, 5, 6],
        [2, 3, 4, 5, 6, 7, 8, 9, 1],
        [5, 6, 7, 8, 9, 1, 2, 3, 4],
        [8, 9, 1, 2, 3, 4, 5, 6, 7],
        [3, 4, 5, 6, 7, 8, 9, 1, 2],
        [6, 7, 8, 9, 1, 2, 3, 4, 5],
        [9, 1, 2, 3, 4, 5, 6, 7, 8],
    ]

    response = client.post("/api/check-board", json={"board": solution})
    body = response.json()

    assert response.status_code == 200
    assert body == {
        "complete": True,
        "valid": True,
        "solved": True,
        "invalid_cells": [],
    }


def test_healthcheck() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
