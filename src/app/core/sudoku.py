from __future__ import annotations

from copy import deepcopy
from random import Random

Grid = list[list[int]]

DIFFICULTY_REMOVALS = {
    "easy": 42,
    "medium": 48,
    "hard": 54,
}


def _copy_grid(grid: Grid) -> Grid:
    return [row[:] for row in grid]


def _find_empty(board: Grid) -> tuple[int, int] | None:
    for r in range(9):
        for c in range(9):
            if board[r][c] == 0:
                return r, c
    return None


def _valid(board: Grid, r: int, c: int, n: int) -> bool:
    if n in board[r]:
        return False

    for i in range(9):
        if board[i][c] == n:
            return False

    br, bc = 3 * (r // 3), 3 * (c // 3)
    for i in range(br, br + 3):
        for j in range(bc, bc + 3):
            if board[i][j] == n:
                return False

    return True


def _solve(board: Grid, rng: Random) -> bool:
    empty = _find_empty(board)
    if not empty:
        return True

    r, c = empty
    numbers = list(range(1, 10))
    rng.shuffle(numbers)

    for n in numbers:
        if _valid(board, r, c, n):
            board[r][c] = n

            if _solve(board, rng):
                return True

            board[r][c] = 0

    return False


def _count_solutions(board: Grid, limit: int = 2) -> int:
    empty = _find_empty(board)
    if not empty:
        return 1

    r, c = empty
    total = 0

    for n in range(1, 10):
        if _valid(board, r, c, n):
            board[r][c] = n

            total += _count_solutions(board, limit)

            if total >= limit:
                board[r][c] = 0
                return total

            board[r][c] = 0

    return total


def generate_solution(rng: Random | None = None) -> Grid:
    rng = rng or Random()
    board = [[0 for _ in range(9)] for _ in range(9)]
    _solve(board, rng)
    return board


def generate_puzzle(
    difficulty: str = "easy", rng: Random | None = None
) -> tuple[Grid, Grid]:
    rng = rng or Random()
    if difficulty.lower() == "vicious":
        from app.core.sudoku_vicious import generate_vicious_puzzle

        return generate_vicious_puzzle(rng)
    if difficulty.lower() == "evil":
        from app.core.sudoku_vicious import generate_evil_puzzle

        return generate_evil_puzzle(rng)

    removals = DIFFICULTY_REMOVALS.get(
        difficulty.lower(), DIFFICULTY_REMOVALS["easy"]
    )

    solution = generate_solution(rng)
    puzzle = _copy_grid(solution)

    positions = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(positions)

    removed = 0

    for r, c in positions:
        if removed >= removals:
            break

        backup = puzzle[r][c]
        puzzle[r][c] = 0

        test = _copy_grid(puzzle)

        if _count_solutions(test) != 1:
            puzzle[r][c] = backup
        else:
            removed += 1

    return puzzle, solution


def validate_board(board: Grid) -> dict[str, object]:
    invalid_cells: list[dict[str, int]] = []

    def check_group(cells: list[tuple[int, int]]) -> None:
        seen: dict[int, tuple[int, int]] = {}
        for row, column in cells:
            value = board[row][column]

            if value == 0:
                continue

            previous = seen.get(value)

            if previous is not None:
                invalid_cells.append({"row": previous[0], "column": previous[1]})
                invalid_cells.append({"row": row, "column": column})
                continue

            seen[value] = (row, column)

    for row in range(9):
        check_group([(row, column) for column in range(9)])

    for column in range(9):
        check_group([(row, column) for row in range(9)])

    for box_row in range(0, 9, 3):
        for box_column in range(0, 9, 3):
            check_group(
                [
                    (row, column)
                    for row in range(box_row, box_row + 3)
                    for column in range(box_column, box_column + 3)
                ]
            )

    unique_cells = sorted({(cell["row"], cell["column"]) for cell in invalid_cells})
    invalid = [{"row": row, "column": column} for row, column in unique_cells]

    complete = all(all(value != 0 for value in row) for row in board)
    valid = not invalid

    return {
        "complete": complete,
        "valid": valid,
        "solved": complete and valid,
        "invalid_cells": invalid,
    }
