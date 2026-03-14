from __future__ import annotations

"""Hint generation for the Sudoku UI.

We keep this intentionally "human style": suggest what to look for next
without directly revealing the full solution.
"""

from collections import defaultdict

from app.core.sudoku import Grid

# Reuse the candidate logic and unit definitions from the vicious module so
# hints stay consistent with the generator.
from app.core.sudoku_vicious import UNITS, _box_index, _build_candidate_map


def _coord(r: int, c: int) -> str:
    return f"R{r + 1}C{c + 1}"


def get_hint(board: Grid) -> dict[str, object]:
    cand = _build_candidate_map(board)

    # Contradiction check.
    dead = [(r, c) for (r, c), opts in cand.items() if len(opts) == 0]
    if dead:
        r, c = dead[0]
        return {
            "message": f"Something is off: {_coord(r, c)} has no possible candidates. Try undoing the last move.",
            "highlights": [{"row": r, "column": c, "kind": "focus"}],
        }

    # 1) Naked single.
    singles = [((r, c), next(iter(opts))) for (r, c), opts in cand.items() if len(opts) == 1]
    if singles:
        (r, c), d = singles[0]
        return {
            "message": f"Naked single: {_coord(r, c)} can only be {d}.",
            "highlights": [{"row": r, "column": c, "kind": "focus"}],
        }

    # 2) Hidden single (row/col/box).
    for unit_name, groups in UNITS.items():
        for idx, group in enumerate(groups):
            positions_by_digit: dict[int, list[tuple[int, int]]] = {d: [] for d in range(1, 10)}
            for r, c in group:
                if board[r][c] != 0:
                    continue
                for d in cand.get((r, c), set()):
                    positions_by_digit[d].append((r, c))
            for d, positions in positions_by_digit.items():
                if len(positions) == 1:
                    r, c = positions[0]
                    unit_label = f"{unit_name} {idx + 1}"
                    return {
                        "message": f"Hidden single: in {unit_label}, only {_coord(r, c)} can be {d}.",
                        "highlights": [{"row": r, "column": c, "kind": "focus"}],
                    }

    # 3) Locked candidates (pointing/claiming).
    # Pointing: in a box, a digit is confined to one row/col => eliminate elsewhere in that row/col.
    for box_idx, box in enumerate(UNITS["box"]):
        empties = [(r, c) for (r, c) in box if board[r][c] == 0]
        for d in range(1, 10):
            positions = [(r, c) for (r, c) in empties if d in cand.get((r, c), set())]
            if len(positions) < 2:
                continue
            rows = {r for r, _ in positions}
            cols = {c for _, c in positions}

            if len(rows) == 1:
                row = next(iter(rows))
                eliminations = []
                for c in range(9):
                    if _box_index(row, c) == box_idx:
                        continue
                    if d in cand.get((row, c), set()):
                        eliminations.append((row, c))
                if eliminations:
                    r, c = positions[0]
                    return {
                        "message": (
                            f"Locked candidate: in box {box_idx + 1}, {d} is confined to row {row + 1}. "
                            f"That means you can remove {d} from other cells in row {row + 1}."
                        ),
                        "highlights": (
                            [{"row": r, "column": c, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                    }

            if len(cols) == 1:
                col = next(iter(cols))
                eliminations = []
                for r in range(9):
                    if _box_index(r, col) == box_idx:
                        continue
                    if d in cand.get((r, col), set()):
                        eliminations.append((r, col))
                if eliminations:
                    r, c = positions[0]
                    return {
                        "message": (
                            f"Locked candidate: in box {box_idx + 1}, {d} is confined to column {col + 1}. "
                            f"That means you can remove {d} from other cells in column {col + 1}."
                        ),
                        "highlights": (
                            [{"row": r, "column": c, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                    }

    # Claiming: in a row/col, a digit is confined to one box => eliminate elsewhere in that box.
    for unit_name in ("row", "col"):
        for idx, group in enumerate(UNITS[unit_name]):
            empties = [(r, c) for (r, c) in group if board[r][c] == 0]
            for d in range(1, 10):
                positions = [(r, c) for (r, c) in empties if d in cand.get((r, c), set())]
                if len(positions) < 2:
                    continue
                boxes = {_box_index(r, c) for r, c in positions}
                if len(boxes) != 1:
                    continue
                box_idx = next(iter(boxes))
                eliminations = []
                for r, c in UNITS["box"][box_idx]:
                    if (r, c) in positions:
                        continue
                    if d in cand.get((r, c), set()):
                        eliminations.append((r, c))
                if eliminations:
                    r, c = positions[0]
                    unit_label = f"{unit_name} {idx + 1}"
                    return {
                        "message": (
                            f"Claiming: in {unit_label}, candidates for {d} all sit inside box {box_idx + 1}. "
                            f"So you can remove {d} from the other cells in that box."
                        ),
                        "highlights": (
                            [{"row": r, "column": c, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                    }

    # 4) Naked pair (one unit).
    for unit_name, groups in UNITS.items():
        for idx, group in enumerate(groups):
            pairs: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
            for r, c in group:
                if board[r][c] != 0:
                    continue
                opts = cand.get((r, c), set())
                if len(opts) == 2:
                    key = tuple(sorted(opts))
                    pairs[key].append((r, c))
            for digits, positions in pairs.items():
                if len(positions) != 2:
                    continue
                d1, d2 = digits
                eliminations = []
                for r, c in group:
                    if board[r][c] != 0 or (r, c) in positions:
                        continue
                    opts = cand.get((r, c), set())
                    if d1 in opts or d2 in opts:
                        eliminations.append((r, c))
                if eliminations:
                    unit_label = f"{unit_name} {idx + 1}"
                    (r1, c1), (r2, c2) = positions
                    return {
                        "message": (
                            f"Naked pair: in {unit_label}, {_coord(r1, c1)} and {_coord(r2, c2)} are the pair "
                            f"{{{d1}, {d2}}}. You can remove {d1}/{d2} from other cells in that unit."
                        ),
                        "highlights": (
                            [{"row": r1, "column": c1, "kind": "focus"}, {"row": r2, "column": c2, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                    }

    # Fallback: pick a cell with the fewest candidates.
    if cand:
        (r, c), opts = min(cand.items(), key=lambda item: (len(item[1]), item[0][0], item[0][1]))
        digits = ", ".join(str(d) for d in sorted(opts))
        return {
            "message": f"No simple forced move found. Consider {_coord(r, c)} (candidates: {digits}).",
            "highlights": [{"row": r, "column": c, "kind": "focus"}],
        }

    return {"message": "No hints available.", "highlights": []}

