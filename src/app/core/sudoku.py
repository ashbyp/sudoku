from __future__ import annotations

from copy import deepcopy
from random import Random

Grid = list[list[int]]

BASE_SOLUTION: Grid = [
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

DIFFICULTY_REMOVALS = {
    "easy": 36,
    "medium": 45,
    "hard": 50,
}


def _copy_grid(grid: Grid) -> Grid:
    return [row[:] for row in grid]


def _transpose(grid: Grid) -> Grid:
    return [list(row) for row in zip(*grid)]


def _shuffle_groups(grid: Grid, rng: Random) -> Grid:
    updated = _copy_grid(grid)
    groups = [updated[index:index + 3] for index in range(0, 9, 3)]
    rng.shuffle(groups)
    updated = [row for group in groups for row in group]

    shuffled: Grid = []
    for start in range(0, 9, 3):
        chunk = updated[start:start + 3]
        rng.shuffle(chunk)
        shuffled.extend(chunk)

    return shuffled


def _remap_digits(grid: Grid, rng: Random) -> Grid:
    digits = list(range(1, 10))
    shuffled = digits[:]
    rng.shuffle(shuffled)
    mapping = dict(zip(digits, shuffled, strict=True))
    return [[mapping[value] for value in row] for row in grid]


def generate_solution(rng: Random | None = None) -> Grid:
    rng = rng or Random()
    grid = deepcopy(BASE_SOLUTION)

    for _ in range(3):
        grid = _shuffle_groups(grid, rng)
        transposed = _transpose(grid)
        transposed = _shuffle_groups(transposed, rng)
        grid = _transpose(transposed)

    return _remap_digits(grid, rng)


def generate_puzzle(difficulty: str = "easy", rng: Random | None = None) -> tuple[Grid, Grid]:
    rng = rng or Random()
    removals = DIFFICULTY_REMOVALS.get(difficulty.lower(), DIFFICULTY_REMOVALS["easy"])

    solution = generate_solution(rng)
    puzzle = _copy_grid(solution)

    positions = [(row, column) for row in range(9) for column in range(9)]
    rng.shuffle(positions)

    for row, column in positions[:removals]:
        puzzle[row][column] = 0

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
