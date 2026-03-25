from __future__ import annotations

"""Hint generation for the Sudoku UI.

We keep this intentionally "human style": suggest what to look for next
without directly revealing the full solution.
"""

from collections import defaultdict
from itertools import combinations

from app.core.sudoku import Grid

# Reuse the candidate logic and unit definitions from the vicious module so
# hints stay consistent with the generator.
from app.core.sudoku_vicious import UNITS, _box_index, _build_candidate_map

def _detect_xwing(cand: dict[tuple[int, int], set[int]]) -> dict[str, object] | None:
    rows = {r: {} for r in range(9)}
    cols = {c: {} for c in range(9)}

    for (r, c), opts in cand.items():
        for d in opts:
            rows[r].setdefault(d, []).append(c)
            cols[c].setdefault(d, []).append(r)

    def pairs_for_digit(mapping):
        return {
            (line, tuple(sorted(cols)))
            for line, digits in mapping.items()
            for cols in (digits.get(2) and [])
        }

    def row_pairs(digit):
        result = []
        for r in range(9):
            cols = rows[r].get(digit)
            if cols and len(cols) == 2:
                result.append((r, tuple(sorted(cols))))
        return result

    def col_pairs(digit):
        result = []
        for c in range(9):
            rows_ = cols[c].get(digit)
            if rows_ and len(rows_) == 2:
                result.append((c, tuple(sorted(rows_))))
        return result

    for digit in range(1, 10):
        row_pairs_list = row_pairs(digit)
        for (r1, cs1), (r2, cs2) in combinations(row_pairs_list, 2):
            if cs1 != cs2:
                continue
            c1, c2 = cs1
            eliminate = []
            for r in range(9):
                if r in (r1, r2):
                    continue
                for c in cs1:
                    if (r, c) in cand and digit in cand[(r, c)]:
                        eliminate.append((r, c))
            if eliminate:
                message = (
                    f"X-wing: digit {digit} occupies columns {c1 + 1} and {c2 + 1} on rows {r1 + 1} and {r2 + 1}. "
                    "You can remove it from those columns elsewhere."
                )
                highlights = [{"row": r1, "column": c1, "kind": "focus"},
                              {"row": r1, "column": c2, "kind": "focus"},
                              {"row": r2, "column": c1, "kind": "focus"},
                              {"row": r2, "column": c2, "kind": "focus"}]
                eliminates = [{"row": r, "column": c, "kind": "elim"} for r, c in eliminate[:6]]
                return {
                    "message": message,
                    "highlights": highlights + eliminates,
                    "action": {"type": "note-remove", "digit": digit, "cells": eliminate},
                }
        col_pairs_list = col_pairs(digit)
        for (c1, rs1), (c2, rs2) in combinations(col_pairs_list, 2):
            if rs1 != rs2:
                continue
            r1, r2 = rs1
            eliminate = []
            for c in range(9):
                if c in (c1, c2):
                    continue
                for r in rs1:
                    if (r, c) in cand and digit in cand[(r, c)]:
                        eliminate.append((r, c))
            if eliminate:
                message = (
                    f"X-wing: digit {digit} occupies rows {r1 + 1} and {r2 + 1} on columns {c1 + 1} and {c2 + 1}. "
                    "You can remove it from those rows elsewhere."
                )
                highlights = [{"row": r1, "column": c1, "kind": "focus"},
                              {"row": r1, "column": c2, "kind": "focus"},
                              {"row": r2, "column": c1, "kind": "focus"},
                              {"row": r2, "column": c2, "kind": "focus"}]
                eliminates = [{"row": r, "column": c, "kind": "elim"} for r, c in eliminate[:6]]
                return {
                    "message": message,
                    "highlights": highlights + eliminates,
                    "action": {"type": "note-remove", "digit": digit, "cells": eliminate},
                }
    return None

def _solve_xwing_hint(cand: dict[tuple[int, int], set[int]]) -> dict[str, object] | None:
    return _detect_xwing(cand)


def _coord(r: int, c: int) -> str:
    return f"Row {r + 1}, Column {c + 1}"


def _notes_mask(notes: list[list[list[int]]] | None) -> dict[tuple[int, int], set[int]]:
    if not notes or len(notes) != 9:
        return {}
    mask: dict[tuple[int, int], set[int]] = {}
    for r, row in enumerate(notes):
        if not isinstance(row, list) or len(row) != 9:
            return {}
        for c, entry in enumerate(row):
            if not isinstance(entry, list):
                return {}
            digits = {int(d) for d in entry if isinstance(d, int) and 1 <= d <= 9}
            if digits:
                mask[(r, c)] = digits
    return mask


def _build_candidate_map_with_notes(board: Grid, notes: list[list[list[int]]] | None) -> dict[tuple[int, int], set[int]]:
    # Always trust the board state for candidates; notes can be incomplete or wrong.
    return _build_candidate_map(board)


def get_hint(board: Grid, notes: list[list[list[int]]] | None = None) -> dict[str, object]:
    cand = _build_candidate_map_with_notes(board, notes)
    note_mask = _notes_mask(notes)

    # Contradiction check.
    dead = [(r, c) for (r, c), opts in cand.items() if len(opts) == 0]
    if dead:
        r, c = dead[0]
        return {
            "message": f"Something is off: {_coord(r, c)} has no possible candidates. Try undoing the last move.",
            "highlights": [{"row": r, "column": c, "kind": "focus"}],
            "action": None,
        }

    # Prefer obvious placements first.
    # 1) Naked single.
    singles = [((r, c), next(iter(opts))) for (r, c), opts in cand.items() if len(opts) == 1]
    if singles:
        (r, c), d = singles[0]
        if note_mask and (r, c) in note_mask:
            shown = note_mask.get((r, c), set())
            if not (len(shown) == 1 and d in shown):
                singles = []
            else:
                return {
                    "message": f"Naked single: {_coord(r, c)} can only be {d}.",
                    "highlights": [{"row": r, "column": c, "kind": "focus"}],
                    "action": {"type": "place", "row": r, "column": c, "digit": d},
                }
        if not note_mask or (r, c) not in note_mask:
            return {
                "message": f"Naked single: {_coord(r, c)} can only be {d}.",
                "highlights": [{"row": r, "column": c, "kind": "focus"}],
                "action": {"type": "place", "row": r, "column": c, "digit": d},
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
                    if note_mask:
                        note_positions = [
                            (rr, cc)
                            for rr, cc in group
                            if d in note_mask.get((rr, cc), set())
                        ]
                        if note_positions and (len(note_positions) != 1 or note_positions[0] != (r, c)):
                            continue
                    return {
                        "message": f"Hidden single: in {unit_label}, only {_coord(r, c)} can be {d}.",
                        "highlights": [{"row": r, "column": c, "kind": "focus"}],
                        "action": {"type": "place", "row": r, "column": c, "digit": d},
                    }

    # 2b) Pencil mark suggestion: in a box, a digit appears in exactly two cells (board candidates).
    for box_idx, box in enumerate(UNITS["box"]):
        empties = [(r, c) for (r, c) in box if board[r][c] == 0]
        for d in range(1, 10):
            positions = [(r, c) for (r, c) in empties if d in cand.get((r, c), set())]
            if len(positions) != 2:
                continue
            note_positions = [pos for pos in empties if d in note_mask.get(pos, set())] if note_mask else []
            if note_positions:
                continue
            (r1, c1), (r2, c2) = positions
            rows = sorted({r1 + 1, r2 + 1})
            return {
                "message": (
                    f"Pencil marks: in box {box_idx + 1}, digit {d} can only go in "
                    f"row {rows[0]}" + (f" and row {rows[1]}" if len(rows) > 1 else "") +
                    f". Add {d} as a pencil mark in those two cells."
                ),
                "highlights": [
                    {"row": r1, "column": c1, "kind": "focus"},
                    {"row": r2, "column": c2, "kind": "focus"},
                ],
                "action": {
                    "type": "note-add",
                    "digit": d,
                    "cells": [{"row": r1, "column": c1}, {"row": r2, "column": c2}],
                },
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
                if note_mask:
                    note_positions = [
                        (rr, cc) for rr, cc in empties if d in note_mask.get((rr, cc), set())
                    ]
                    note_rows = {rr for rr, _ in note_positions}
                    if note_positions and (len(note_rows) != 1 or next(iter(note_rows), row) != row):
                        continue
                eliminations = []
                for c in range(9):
                    if _box_index(row, c) == box_idx:
                        continue
                    if d in cand.get((row, c), set()):
                        eliminations.append((row, c))
                if note_mask:
                    eliminations = [(rr, cc) for rr, cc in eliminations if d in note_mask.get((rr, cc), set())]
                if eliminations or not note_mask:
                    r, c = positions[0]
                    return {
                        "message": (
                            f"Locked candidate: in box {box_idx + 1}, candidate {d} only appears in row {row + 1}. "
                            f"So you can remove {d} from the other cells in row {row + 1}."
                        ),
                        "highlights": (
                            [{"row": r, "column": c, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                        "action": {
                            "type": "note-remove",
                            "digit": d,
                            "cells": [{"row": rr, "column": cc} for rr, cc in eliminations],
                        },
                    }

            if len(cols) == 1:
                col = next(iter(cols))
                if note_mask:
                    note_positions = [
                        (rr, cc) for rr, cc in empties if d in note_mask.get((rr, cc), set())
                    ]
                    note_cols = {cc for _, cc in note_positions}
                    if note_positions and (len(note_cols) != 1 or next(iter(note_cols), col) != col):
                        continue
                eliminations = []
                for r in range(9):
                    if _box_index(r, col) == box_idx:
                        continue
                    if d in cand.get((r, col), set()):
                        eliminations.append((r, col))
                if note_mask:
                    eliminations = [(rr, cc) for rr, cc in eliminations if d in note_mask.get((rr, cc), set())]
                if eliminations or not note_mask:
                    r, c = positions[0]
                    return {
                        "message": (
                            f"Locked candidate: in box {box_idx + 1}, candidate {d} only appears in column {col + 1}. "
                            f"So you can remove {d} from the other cells in column {col + 1}."
                        ),
                        "highlights": (
                            [{"row": r, "column": c, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                        "action": {
                            "type": "note-remove",
                            "digit": d,
                            "cells": [{"row": rr, "column": cc} for rr, cc in eliminations],
                        },
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
                if note_mask:
                    note_positions = [
                        (rr, cc) for rr, cc in empties if d in note_mask.get((rr, cc), set())
                    ]
                    note_boxes = {_box_index(rr, cc) for rr, cc in note_positions}
                    if note_positions and (len(note_boxes) != 1 or next(iter(note_boxes), box_idx) != box_idx):
                        continue
                eliminations = []
                for r, c in UNITS["box"][box_idx]:
                    if (r, c) in positions:
                        continue
                    if d in cand.get((r, c), set()):
                        eliminations.append((r, c))
                if note_mask:
                    eliminations = [(rr, cc) for rr, cc in eliminations if d in note_mask.get((rr, cc), set())]
                if eliminations or not note_mask:
                    r, c = positions[0]
                    unit_label = f"{unit_name} {idx + 1}"
                    return {
                        "message": (
                            f"Claiming: in {unit_label}, candidate {d} only appears inside box {box_idx + 1}. "
                            f"So you can remove {d} from the other cells in that box."
                        ),
                        "highlights": (
                            [{"row": r, "column": c, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                        "action": {
                            "type": "note-remove",
                            "digit": d,
                            "cells": [{"row": rr, "column": cc} for rr, cc in eliminations],
                        },
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
                if note_mask:
                    note_pairs = [
                        (rr, cc)
                        for rr, cc in group
                        if note_mask.get((rr, cc), set()) == set(digits)
                    ]
                    if note_pairs and sorted(note_pairs) != sorted(positions):
                        continue
                eliminations = []
                for r, c in group:
                    if board[r][c] != 0 or (r, c) in positions:
                        continue
                    opts = cand.get((r, c), set())
                    if d1 in opts or d2 in opts:
                        eliminations.append((r, c))
                if note_mask:
                    eliminations = [
                        (rr, cc)
                        for rr, cc in eliminations
                        if (d1 in note_mask.get((rr, cc), set()) or d2 in note_mask.get((rr, cc), set()))
                    ]
                if eliminations or not note_mask:
                    unit_label = f"{unit_name} {idx + 1}"
                    (r1, c1), (r2, c2) = positions
                    return {
                        "message": (
                            f"Naked pair: in {unit_label}, {_coord(r1, c1)} and {_coord(r2, c2)} are the pair "
                            f"{{{d1}, {d2}}}. You can remove {d1}/{d2} from the other cells in that unit."
                        ),
                        "highlights": (
                            [{"row": r1, "column": c1, "kind": "focus"}, {"row": r2, "column": c2, "kind": "focus"}]
                            + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                        ),
                        "action": None,
                    }

    # 5) Hidden pair (one unit).
    for unit_name, groups in UNITS.items():
        for idx, group in enumerate(groups):
            positions_by_digit: dict[int, list[tuple[int, int]]] = {d: [] for d in range(1, 10)}
            for r, c in group:
                if board[r][c] != 0:
                    continue
                for d in cand.get((r, c), set()):
                    positions_by_digit[d].append((r, c))

            for d1, d2 in combinations(range(1, 10), 2):
                pos1 = positions_by_digit[d1]
                pos2 = positions_by_digit[d2]
                if len(pos1) == 2 and pos1 == pos2:
                    (r1, c1), (r2, c2) = pos1
                    if note_mask:
                        note_pairs = [
                            (rr, cc)
                            for rr, cc in group
                            if note_mask.get((rr, cc), set()) == {d1, d2}
                        ]
                        if note_pairs and sorted(note_pairs) != sorted(pos1):
                            continue
                    unit_label = f"{unit_name} {idx + 1}"
                    return {
                        "message": (
                            f"Hidden pair: in {unit_label}, {_coord(r1, c1)} and {_coord(r2, c2)} are the only places "
                            f"for {d1} and {d2}. You can remove other candidates from those two cells."
                        ),
                        "highlights": [
                            {"row": r1, "column": c1, "kind": "focus"},
                            {"row": r2, "column": c2, "kind": "focus"},
                        ],
                        "action": None,
                    }

    # 6) Naked triple (one unit).
    for unit_name, groups in UNITS.items():
        for idx, group in enumerate(groups):
            triple_cells = [
                (r, c)
                for r, c in group
                if board[r][c] == 0 and 2 <= len(cand.get((r, c), set())) <= 3
            ]
            for a, b, c in combinations(triple_cells, 3):
                union = set(cand.get(a, set())) | set(cand.get(b, set())) | set(cand.get(c, set()))
                if len(union) != 3:
                    continue
                eliminations = []
                for r, cc in group:
                    pos = (r, cc)
                    if board[r][cc] != 0 or pos in (a, b, c):
                        continue
                    opts = cand.get(pos, set())
                    if opts & union:
                        eliminations.append(pos)
                if not eliminations and all(cand.get(pos, set()) == union for pos in (a, b, c)):
                    continue
                unit_label = f"{unit_name} {idx + 1}"
                (r1, c1), (r2, c2), (r3, c3) = a, b, c
                d1, d2, d3 = sorted(union)
                return {
                    "message": (
                        f"Naked triple: in {unit_label}, {_coord(r1, c1)}, {_coord(r2, c2)}, and {_coord(r3, c3)} "
                        f"can only be {{{d1}, {d2}, {d3}}}. You can remove these digits from the other cells in that unit."
                    ),
                    "highlights": (
                        [{"row": r1, "column": c1, "kind": "focus"},
                         {"row": r2, "column": c2, "kind": "focus"},
                         {"row": r3, "column": c3, "kind": "focus"}]
                        + [{"row": rr, "column": cc, "kind": "elim"} for rr, cc in eliminations[:6]]
                    ),
                    "action": None,
                }

    # 7) Hidden triple (one unit).
    for unit_name, groups in UNITS.items():
        for idx, group in enumerate(groups):
            positions_by_digit: dict[int, list[tuple[int, int]]] = {d: [] for d in range(1, 10)}
            for r, c in group:
                if board[r][c] != 0:
                    continue
                for d in cand.get((r, c), set()):
                    positions_by_digit[d].append((r, c))

            for d1, d2, d3 in combinations(range(1, 10), 3):
                pos1 = positions_by_digit[d1]
                pos2 = positions_by_digit[d2]
                pos3 = positions_by_digit[d3]
                if not (1 <= len(pos1) <= 3 and 1 <= len(pos2) <= 3 and 1 <= len(pos3) <= 3):
                    continue
                union = set(pos1) | set(pos2) | set(pos3)
                if len(union) != 3:
                    continue
                if all(cand.get(pos, set()).issubset({d1, d2, d3}) for pos in union):
                    continue
                unit_label = f"{unit_name} {idx + 1}"
                (r1, c1), (r2, c2), (r3, c3) = sorted(union)
                return {
                    "message": (
                        f"Hidden triple: in {unit_label}, only {_coord(r1, c1)}, {_coord(r2, c2)}, and {_coord(r3, c3)} "
                        f"can hold {d1}, {d2}, and {d3}. You can remove other candidates from those three cells."
                    ),
                    "highlights": [
                        {"row": r1, "column": c1, "kind": "focus"},
                        {"row": r2, "column": c2, "kind": "focus"},
                        {"row": r3, "column": c3, "kind": "focus"},
                    ],
                    "action": None,
                }

    # 9) X-wing, last ditch.
    xwing_hint = _solve_xwing_hint(cand)
    if xwing_hint:
        if note_mask and xwing_hint.get("action", {}).get("type") == "note-remove":
            digit = xwing_hint.get("action", {}).get("digit")
            cells = xwing_hint.get("action", {}).get("cells", [])
            filtered = [
                (cell["row"], cell["column"])
                for cell in cells
                if digit in note_mask.get((cell["row"], cell["column"]), set())
            ]
            if not filtered:
                return {"message": "No hints available.", "highlights": [], "action": None}
        return xwing_hint

    # Fallback: pick a cell with the fewest candidates.
    if cand:
        (r, c), opts = min(cand.items(), key=lambda item: (len(item[1]), item[0][0], item[0][1]))
        digits = ", ".join(str(d) for d in sorted(opts))
        return {
            "message": f"No simple forced move found. Consider {_coord(r, c)}. Candidates: {digits}.",
            "highlights": [{"row": r, "column": c, "kind": "focus"}],
            "action": {"type": "focus", "row": r, "column": c},
        }

    return {"message": "No hints available.", "highlights": [], "action": None}
