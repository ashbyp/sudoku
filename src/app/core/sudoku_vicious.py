from __future__ import annotations

"""Vicious Sudoku generator.

Design goal: when the user clicks "All notes" at the start, it should *not*
look like a singles-fest.

Hard constraints we try to enforce:
- Unique solution.
- Low clue count (<= MAX_CLUES).
- No naked singles at the initial state.
- No hidden singles at the initial state.

We keep this isolated from the baseline generator.
"""

from dataclasses import dataclass
from itertools import combinations
from random import Random
from time import perf_counter

from app.core.sudoku import Grid, _copy_grid, generate_solution


class _Timeout(Exception):
    pass


def _count_solutions_bounded(
    board: Grid, *, limit: int = 2, deadline: float | None = None
) -> int:
    """Count solutions up to `limit`, aborting when `deadline` is exceeded.

    This is intentionally faster than the baseline `_count_solutions()`:
    - Uses MRV (minimum remaining values) to pick the next cell.
    - Uses bitmasks for row/col/box constraints.
    - Stops after finding `limit` solutions.
    - Can be time-bounded to keep the UI responsive.
    """

    # Bit d (1..9) indicates digit presence.
    ALL = 0b1111111110

    def timed_out() -> bool:
        return deadline is not None and perf_counter() > deadline

    rows = [0] * 9
    cols = [0] * 9
    boxes = [0] * 9

    empties: list[tuple[int, int]] = []
    for r in range(9):
        for c in range(9):
            v = board[r][c]
            if v == 0:
                empties.append((r, c))
                continue
            bit = 1 << v
            b = (r // 3) * 3 + (c // 3)
            # Invalid placement => no solutions.
            if (rows[r] & bit) or (cols[c] & bit) or (boxes[b] & bit):
                return 0
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit

    def best_empty() -> tuple[int, int, int] | None:
        """Return (index_in_empties, r, c) for the cell with fewest candidates."""
        best_i = -1
        best_r = -1
        best_c = -1
        best_count = 10
        for i, (r, c) in enumerate(empties):
            if board[r][c] != 0:
                continue
            b = (r // 3) * 3 + (c // 3)
            mask = ALL & ~(rows[r] | cols[c] | boxes[b])
            cnt = mask.bit_count()
            if cnt == 0:
                return (i, r, c)  # dead end
            if cnt < best_count:
                best_i, best_r, best_c, best_count = i, r, c, cnt
                if cnt == 1:
                    break
        if best_i == -1:
            return None
        return (best_i, best_r, best_c)

    def iter_digits(mask: int):
        # Iterate candidate digits from the mask (lowest bit first).
        while mask:
            bit = mask & -mask
            d = bit.bit_length() - 1
            yield d, bit
            mask ^= bit

    def backtrack(total: int = 0) -> int:
        if timed_out():
            raise _Timeout()

        pick = best_empty()
        if pick is None:
            return total + 1

        _, r, c = pick
        if board[r][c] != 0:
            return backtrack(total)

        b = (r // 3) * 3 + (c // 3)
        mask = ALL & ~(rows[r] | cols[c] | boxes[b])
        if mask == 0:
            return total

        for d, bit in iter_digits(mask):
            board[r][c] = d
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit

            total = backtrack(total)
            if total >= limit:
                # unwind quickly
                board[r][c] = 0
                rows[r] ^= bit
                cols[c] ^= bit
                boxes[b] ^= bit
                return total

            board[r][c] = 0
            rows[r] ^= bit
            cols[c] ^= bit
            boxes[b] ^= bit

        return total

    return backtrack(0)


def _is_unique(board: Grid, *, deadline: float | None = None) -> bool:
    test = _copy_grid(board)
    try:
        return _count_solutions_bounded(test, limit=2, deadline=deadline) == 1
    except _Timeout:
        # If we can't prove uniqueness quickly, treat it as "not acceptable" for generation.
        return False


@dataclass(frozen=True)
class SolveStats:
    solved: bool
    steps_singles: int
    steps_hidden_singles: int
    steps_locked: int
    steps_naked_pairs: int
    steps_hidden_pairs: int
    steps_naked_triples: int
    steps_xwing: int

    @property
    def score(self) -> int:
        # Do NOT reward naked singles; prefer puzzles needing eliminations.
        return (
            self.steps_hidden_singles * 1
            + self.steps_locked * 8
            + self.steps_naked_pairs * 14
            + self.steps_hidden_pairs * 18
            + self.steps_naked_triples * 22
            + self.steps_xwing * 28
        )

    @property
    def advanced_steps(self) -> int:
        return (
            self.steps_locked
            + self.steps_naked_pairs
            + self.steps_hidden_pairs
            + self.steps_naked_triples
            + self.steps_xwing
        )


def _unit_cells() -> dict[str, list[list[tuple[int, int]]]]:
    rows = [[(r, c) for c in range(9)] for r in range(9)]
    cols = [[(r, c) for r in range(9)] for c in range(9)]
    boxes: list[list[tuple[int, int]]] = []
    for br in range(0, 9, 3):
        for bc in range(0, 9, 3):
            boxes.append([(r, c) for r in range(br, br + 3) for c in range(bc, bc + 3)])
    return {"row": rows, "col": cols, "box": boxes}


UNITS = _unit_cells()


def _box_index(r: int, c: int) -> int:
    return (r // 3) * 3 + (c // 3)


def _peers_of(r: int, c: int) -> set[tuple[int, int]]:
    peers: set[tuple[int, int]] = set()

    for cc in range(9):
        if cc != c:
            peers.add((r, cc))
    for rr in range(9):
        if rr != r:
            peers.add((rr, c))

    br, bc = (r // 3) * 3, (c // 3) * 3
    for rr in range(br, br + 3):
        for cc in range(bc, bc + 3):
            if rr == r and cc == c:
                continue
            peers.add((rr, cc))

    return peers


def _candidates(board: Grid, r: int, c: int) -> set[int]:
    if board[r][c] != 0:
        return set()

    blocked = set(board[r])
    blocked.update(board[i][c] for i in range(9))

    br, bc = (r // 3) * 3, (c // 3) * 3
    for rr in range(br, br + 3):
        for cc in range(bc, bc + 3):
            blocked.add(board[rr][cc])

    return {d for d in range(1, 10) if d not in blocked}


def _build_candidate_map(board: Grid) -> dict[tuple[int, int], set[int]]:
    return {(r, c): _candidates(board, r, c) for r in range(9) for c in range(9) if board[r][c] == 0}


def _count_naked_singles(cand: dict[tuple[int, int], set[int]]) -> int:
    return sum(1 for opts in cand.values() if len(opts) == 1)


def _count_hidden_singles(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    total = 0
    for groups in UNITS.values():
        for group in groups:
            positions_by_digit: dict[int, int] = {d: 0 for d in range(1, 10)}
            for r, c in group:
                if board[r][c] != 0:
                    continue
                for d in cand.get((r, c), set()):
                    positions_by_digit[d] += 1
            total += sum(1 for count in positions_by_digit.values() if count == 1)
    return total


def _fill_from_singles(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    placed = 0
    singles = [(pos, next(iter(opts))) for pos, opts in cand.items() if len(opts) == 1]
    for (r, c), value in singles:
        board[r][c] = value
        placed += 1
    return placed


def _apply_hidden_singles(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    placed = 0
    for groups in UNITS.values():
        for group in groups:
            positions_by_digit: dict[int, list[tuple[int, int]]] = {d: [] for d in range(1, 10)}
            for r, c in group:
                if board[r][c] != 0:
                    continue
                for d in cand.get((r, c), set()):
                    positions_by_digit[d].append((r, c))
            for d, positions in positions_by_digit.items():
                if len(positions) == 1:
                    rr, cc = positions[0]
                    board[rr][cc] = d
                    placed += 1
    return placed


def _apply_locked_candidates(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    eliminated = 0

    # Pointing (box -> row/col)
    for box in UNITS["box"]:
        box_cells = [(r, c) for (r, c) in box if board[r][c] == 0]
        for d in range(1, 10):
            positions = [(r, c) for (r, c) in box_cells if d in cand.get((r, c), set())]
            if len(positions) < 2:
                continue

            rows = {r for r, _ in positions}
            cols = {c for _, c in positions}
            box_id = _box_index(positions[0][0], positions[0][1])

            if len(rows) == 1:
                row = next(iter(rows))
                for c in range(9):
                    if _box_index(row, c) == box_id:
                        continue
                    if d in cand.get((row, c), set()):
                        cand[(row, c)].discard(d)
                        eliminated += 1

            if len(cols) == 1:
                col = next(iter(cols))
                for r in range(9):
                    if _box_index(r, col) == box_id:
                        continue
                    if d in cand.get((r, col), set()):
                        cand[(r, col)].discard(d)
                        eliminated += 1

    # Claiming (row/col -> box)
    for unit_type in ("row", "col"):
        for group in UNITS[unit_type]:
            empties = [(r, c) for (r, c) in group if board[r][c] == 0]
            for d in range(1, 10):
                positions = [(r, c) for (r, c) in empties if d in cand.get((r, c), set())]
                if len(positions) < 2:
                    continue

                boxes = {_box_index(r, c) for r, c in positions}
                if len(boxes) != 1:
                    continue

                box_index = next(iter(boxes))
                br, bc = (box_index // 3) * 3, (box_index % 3) * 3
                for rr in range(br, br + 3):
                    for cc in range(bc, bc + 3):
                        if (rr, cc) in positions:
                            continue
                        if (rr, cc) not in cand:
                            continue
                        if d in cand[(rr, cc)]:
                            cand[(rr, cc)].discard(d)
                            eliminated += 1

    return eliminated


def _apply_naked_pairs(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    eliminated = 0

    for groups in UNITS.values():
        for group in groups:
            pairs: dict[tuple[int, int], list[tuple[int, int]]] = {}
            for r, c in group:
                if board[r][c] != 0:
                    continue
                opts = cand.get((r, c), set())
                if len(opts) == 2:
                    key = tuple(sorted(opts))
                    pairs.setdefault(key, []).append((r, c))

            for digits, positions in pairs.items():
                if len(positions) != 2:
                    continue

                d1, d2 = digits
                for r, c in group:
                    if board[r][c] != 0 or (r, c) in positions:
                        continue
                    opts = cand.get((r, c), set())
                    if d1 in opts:
                        cand[(r, c)].discard(d1)
                        eliminated += 1
                    if d2 in opts:
                        cand[(r, c)].discard(d2)
                        eliminated += 1

    return eliminated


def _apply_hidden_pairs(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    eliminated = 0

    for groups in UNITS.values():
        for group in groups:
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
                    for pos in pos1:
                        before = set(cand.get(pos, set()))
                        after = {d1, d2}
                        if before != after:
                            cand[pos].intersection_update(after)
                            eliminated += len(before - after)

    return eliminated


def _apply_naked_triples(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    eliminated = 0

    for groups in UNITS.values():
        for group in groups:
            empties = [(r, c) for (r, c) in group if board[r][c] == 0]
            triple_cells = [(r, c) for (r, c) in empties if 2 <= len(cand.get((r, c), set())) <= 3]
            for a, b, c in combinations(triple_cells, 3):
                union = set(cand.get(a, set())) | set(cand.get(b, set())) | set(cand.get(c, set()))
                if len(union) != 3:
                    continue

                for r, cc in empties:
                    pos = (r, cc)
                    if pos in (a, b, c):
                        continue
                    before = set(cand.get(pos, set()))
                    if not (before & union):
                        continue
                    cand[pos].difference_update(union)
                    eliminated += len(before & union)

    return eliminated


def _apply_xwing(board: Grid, cand: dict[tuple[int, int], set[int]]) -> int:
    eliminated = 0

    for d in range(1, 10):
        row_positions: dict[int, tuple[int, int] | None] = {}
        for r in range(9):
            cols = [c for c in range(9) if (r, c) in cand and d in cand[(r, c)]]
            row_positions[r] = tuple(cols) if len(cols) == 2 else None

        rows = [r for r, cols in row_positions.items() if cols is not None]
        for r1, r2 in combinations(rows, 2):
            cols1 = row_positions[r1]
            cols2 = row_positions[r2]
            if cols1 != cols2 or cols1 is None:
                continue
            c1, c2 = cols1
            for rr in range(9):
                if rr in (r1, r2):
                    continue
                if (rr, c1) in cand and d in cand[(rr, c1)]:
                    cand[(rr, c1)].discard(d)
                    eliminated += 1
                if (rr, c2) in cand and d in cand[(rr, c2)]:
                    cand[(rr, c2)].discard(d)
                    eliminated += 1

    for d in range(1, 10):
        col_positions: dict[int, tuple[int, int] | None] = {}
        for c in range(9):
            rows = [r for r in range(9) if (r, c) in cand and d in cand[(r, c)]]
            col_positions[c] = tuple(rows) if len(rows) == 2 else None

        cols = [c for c, rows in col_positions.items() if rows is not None]
        for c1, c2 in combinations(cols, 2):
            rows1 = col_positions[c1]
            rows2 = col_positions[c2]
            if rows1 != rows2 or rows1 is None:
                continue
            r1, r2 = rows1
            for cc in range(9):
                if cc in (c1, c2):
                    continue
                if (r1, cc) in cand and d in cand[(r1, cc)]:
                    cand[(r1, cc)].discard(d)
                    eliminated += 1
                if (r2, cc) in cand and d in cand[(r2, cc)]:
                    cand[(r2, cc)].discard(d)
                    eliminated += 1

    return eliminated


def solve_with_techniques(
    board: Grid, step_limit: int = 12000, *, deadline: float | None = None
) -> SolveStats:
    board = _copy_grid(board)

    steps_singles = 0
    steps_hidden = 0
    steps_locked = 0
    steps_np = 0
    steps_hp = 0
    steps_nt = 0
    steps_xw = 0

    for _ in range(step_limit):
        if deadline is not None and perf_counter() > deadline:
            return SolveStats(
                False,
                steps_singles,
                steps_hidden,
                steps_locked,
                steps_np,
                steps_hp,
                steps_nt,
                steps_xw,
            )
        cand = _build_candidate_map(board)
        if not cand:
            return SolveStats(True, steps_singles, steps_hidden, steps_locked, steps_np, steps_hp, steps_nt, steps_xw)

        placed = _fill_from_singles(board, cand)
        if placed:
            steps_singles += placed
            continue

        cand = _build_candidate_map(board)
        placed = _apply_hidden_singles(board, cand)
        if placed:
            steps_hidden += placed
            continue

        cand = _build_candidate_map(board)
        eliminated = _apply_locked_candidates(board, cand)
        if eliminated:
            steps_locked += 1
            steps_singles += _fill_from_singles(board, cand)
            continue

        cand = _build_candidate_map(board)
        eliminated = _apply_naked_pairs(board, cand)
        if eliminated:
            steps_np += 1
            steps_singles += _fill_from_singles(board, cand)
            continue

        cand = _build_candidate_map(board)
        eliminated = _apply_hidden_pairs(board, cand)
        if eliminated:
            steps_hp += 1
            steps_singles += _fill_from_singles(board, cand)
            continue

        cand = _build_candidate_map(board)
        eliminated = _apply_naked_triples(board, cand)
        if eliminated:
            steps_nt += 1
            steps_singles += _fill_from_singles(board, cand)
            continue

        cand = _build_candidate_map(board)
        eliminated = _apply_xwing(board, cand)
        if eliminated:
            steps_xw += 1
            steps_singles += _fill_from_singles(board, cand)
            continue

        return SolveStats(False, steps_singles, steps_hidden, steps_locked, steps_np, steps_hp, steps_nt, steps_xw)

    return SolveStats(False, steps_singles, steps_hidden, steps_locked, steps_np, steps_hp, steps_nt, steps_xw)


def solve_basic(board: Grid, *, deadline: float | None = None, step_limit: int = 20000) -> SolveStats:
    """A deliberately weaker "human basic" solver.

    Used to filter out puzzles that become a straightforward chain after candidates
    are shown:
    - naked singles
    - hidden singles
    - locked candidates (pointing/claiming)
    """
    board = _copy_grid(board)

    steps_singles = 0
    steps_hidden = 0
    steps_locked = 0

    for _ in range(step_limit):
        if deadline is not None and perf_counter() > deadline:
            return SolveStats(False, steps_singles, steps_hidden, steps_locked, 0, 0, 0, 0)

        cand = _build_candidate_map(board)
        if not cand:
            return SolveStats(True, steps_singles, steps_hidden, steps_locked, 0, 0, 0, 0)

        placed = _fill_from_singles(board, cand)
        if placed:
            steps_singles += placed
            continue

        cand = _build_candidate_map(board)
        placed = _apply_hidden_singles(board, cand)
        if placed:
            steps_hidden += placed
            continue

        cand = _build_candidate_map(board)
        eliminated = _apply_locked_candidates(board, cand)
        if eliminated:
            steps_locked += 1
            steps_singles += _fill_from_singles(board, cand)
            continue

        return SolveStats(False, steps_singles, steps_hidden, steps_locked, 0, 0, 0, 0)

    return SolveStats(False, steps_singles, steps_hidden, steps_locked, 0, 0, 0, 0)


def _clue_count(grid: Grid) -> int:
    return sum(1 for r in range(9) for c in range(9) if grid[r][c] != 0)


def _sym(r: int, c: int) -> tuple[int, int]:
    return 8 - r, 8 - c


def generate_vicious_puzzle(rng: Random | None = None) -> tuple[Grid, Grid]:
    rng = rng or Random()

    # Keep generation bounded so the UI never spins for minutes.
    time_budget_s = 12.0
    max_attempts = 600

    # We reject anything with more clues than this.
    max_clues = 25

    # We may dig lower to eliminate singles, but we won't go below this.
    min_clues = 20

    start = perf_counter()
    deadline = start + time_budget_s

    # Best candidate seen so far (even if it doesn't meet all strict rules).
    best_score = -10**18
    best_puzzle: Grid | None = None
    best_solution: Grid | None = None

    for _ in range(max_attempts):
        if perf_counter() > deadline:
            break

        solution = generate_solution(rng)
        puzzle = _copy_grid(solution)

        # Build symmetric removal order.
        pairs: list[tuple[tuple[int, int], tuple[int, int]]] = []
        seen: set[tuple[int, int]] = set()
        for r in range(9):
            for c in range(9):
                if (r, c) in seen:
                    continue
                rr, cc = _sym(r, c)
                seen.add((r, c))
                seen.add((rr, cc))
                pairs.append(((r, c), (rr, cc)))
        rng.shuffle(pairs)

        # Phase 1: remove down to max_clues.
        for (a_r, a_c), (b_r, b_c) in pairs:
            if perf_counter() > deadline:
                break
            if _clue_count(puzzle) <= max_clues:
                break

            backup_a = puzzle[a_r][a_c]
            backup_b = puzzle[b_r][b_c]
            puzzle[a_r][a_c] = 0
            puzzle[b_r][b_c] = 0

            if not _is_unique(puzzle, deadline=deadline):
                puzzle[a_r][a_c] = backup_a
                puzzle[b_r][b_c] = backup_b

        # If we couldn't even get under the clue cap, skip.
        clues = _clue_count(puzzle)
        if clues > max_clues:
            continue

        # Phase 2: actively try to eliminate naked singles by removing peer clues.
        # (Removing clues tends to increase candidate counts, reducing singles.)
        for _tweak in range(80):
            if perf_counter() > deadline:
                break
            if _clue_count(puzzle) <= min_clues:
                break

            cand = _build_candidate_map(puzzle)
            naked = [(pos, opts) for pos, opts in cand.items() if len(opts) == 1]
            if not naked:
                break

            (sr, sc), _opts = naked[0]
            peer_clues = [(r, c) for (r, c) in _peers_of(sr, sc) if puzzle[r][c] != 0]
            if not peer_clues:
                break

            r, c = rng.choice(peer_clues)
            rr, cc = _sym(r, c)
            if puzzle[r][c] == 0 and puzzle[rr][cc] == 0:
                continue

            backup1 = puzzle[r][c]
            backup2 = puzzle[rr][cc]
            puzzle[r][c] = 0
            puzzle[rr][cc] = 0

            if not _is_unique(puzzle, deadline=deadline):
                puzzle[r][c] = backup1
                puzzle[rr][cc] = backup2

        # Now evaluate constraints.
        cand = _build_candidate_map(puzzle)
        naked_singles = _count_naked_singles(cand)
        hidden_singles = _count_hidden_singles(puzzle, cand)

        # If we are still above the clue cap due to tweaks (shouldn't happen), skip.
        clues = _clue_count(puzzle)
        if clues > max_clues:
            continue

        # Reject puzzles that basic techniques can plough through after candidates are shown.
        basic_stats = solve_basic(puzzle, deadline=deadline)
        basic_solved = basic_stats.solved
        basic_progress = basic_stats.steps_singles + basic_stats.steps_hidden_singles

        stats = solve_with_techniques(puzzle, deadline=deadline)

        # Track best overall candidate (prefer: fewer singles, fewer clues, more advanced steps).
        # Even if it's not perfect, we won't block the UI for minutes.
        candidate_score = (
            (stats.score if stats.solved else -1000) * 10000
            + (stats.advanced_steps if stats.solved else 0) * 2000
            - (naked_singles * 4000)
            - (hidden_singles * 2000)
            - (800000 if basic_solved else 0)
            - (basic_progress * 900)
            - (clues * 25)
        )
        if candidate_score > best_score:
            best_score = candidate_score
            best_puzzle = _copy_grid(puzzle)
            best_solution = _copy_grid(solution)

        # Strict acceptance for "vicious".
        if naked_singles != 0 or hidden_singles != 0:
            continue
        if basic_solved:
            continue
        # If basic techniques make too much progress, it'll feel like a singles chain.
        if basic_progress >= 18:
            continue
        if not stats.solved:
            continue

        # Require meaningful eliminations.
        if stats.advanced_steps < 12:
            continue
        if stats.steps_hidden_pairs < 2:
            continue
        if stats.steps_xwing < 1:
            continue
        if stats.score < 220:
            continue

        return puzzle, solution

    if best_puzzle is not None and best_solution is not None:
        return best_puzzle, best_solution

    # As a last resort, return any unique puzzle under the clue cap.
    rescue_deadline = perf_counter() + 2.0
    solution = generate_solution(rng)
    puzzle = _copy_grid(solution)
    positions = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(positions)

    for r, c in positions:
        if _clue_count(puzzle) <= max_clues:
            break
        backup = puzzle[r][c]
        puzzle[r][c] = 0
        if not _is_unique(puzzle, deadline=rescue_deadline):
            puzzle[r][c] = backup

    return puzzle, solution


def generate_evil_puzzle(rng: Random | None = None) -> tuple[Grid, Grid]:
    rng = rng or Random()

    # Harder: allow a bit more time and require heavier x-wing/advanced steps.
    time_budget_s = 14.0
    max_attempts = 800
    max_clues = 24
    min_clues = 19

    start = perf_counter()
    deadline = start + time_budget_s

    best_score = -10**18
    best_puzzle: Grid | None = None
    best_solution: Grid | None = None

    for _ in range(max_attempts):
        if perf_counter() > deadline:
            break

        solution = generate_solution(rng)
        puzzle = _copy_grid(solution)

        pairs: list[tuple[tuple[int, int], tuple[int, int]]] = []
        seen: set[tuple[int, int]] = set()
        for r in range(9):
            for c in range(9):
                if (r, c) in seen:
                    continue
                rr, cc = _sym(r, c)
                seen.add((r, c))
                seen.add((rr, cc))
                pairs.append(((r, c), (rr, cc)))
        rng.shuffle(pairs)

        for (a_r, a_c), (b_r, b_c) in pairs:
            if perf_counter() > deadline:
                break
            if _clue_count(puzzle) <= max_clues:
                break

            backup_a = puzzle[a_r][a_c]
            backup_b = puzzle[b_r][b_c]
            puzzle[a_r][a_c] = 0
            puzzle[b_r][b_c] = 0

            if not _is_unique(puzzle, deadline=deadline):
                puzzle[a_r][a_c] = backup_a
                puzzle[b_r][b_c] = backup_b

        clues = _clue_count(puzzle)
        if clues > max_clues:
            continue

        for _tweak in range(90):
            if perf_counter() > deadline:
                break
            if _clue_count(puzzle) <= min_clues:
                break

            cand = _build_candidate_map(puzzle)
            naked = [(pos, opts) for pos, opts in cand.items() if len(opts) == 1]
            if not naked:
                break

            (sr, sc), _opts = naked[0]
            peer_clues = [(r, c) for (r, c) in _peers_of(sr, sc) if puzzle[r][c] != 0]
            if not peer_clues:
                break

            r, c = rng.choice(peer_clues)
            rr, cc = _sym(r, c)
            if puzzle[r][c] == 0 and puzzle[rr][cc] == 0:
                continue

            backup1 = puzzle[r][c]
            backup2 = puzzle[rr][cc]
            puzzle[r][c] = 0
            puzzle[rr][cc] = 0

            if not _is_unique(puzzle, deadline=deadline):
                puzzle[r][c] = backup1
                puzzle[rr][cc] = backup2

        cand = _build_candidate_map(puzzle)
        naked_singles = _count_naked_singles(cand)
        hidden_singles = _count_hidden_singles(puzzle, cand)

        clues = _clue_count(puzzle)
        if clues > max_clues:
            continue

        basic_stats = solve_basic(puzzle, deadline=deadline)
        basic_solved = basic_stats.solved
        basic_progress = basic_stats.steps_singles + basic_stats.steps_hidden_singles

        stats = solve_with_techniques(puzzle, deadline=deadline)

        candidate_score = (
            (stats.score if stats.solved else -1000) * 10000
            + (stats.advanced_steps if stats.solved else 0) * 2400
            - (naked_singles * 5000)
            - (hidden_singles * 2600)
            - (900000 if basic_solved else 0)
            - (basic_progress * 1100)
            - (clues * 30)
        )
        if candidate_score > best_score:
            best_score = candidate_score
            best_puzzle = _copy_grid(puzzle)
            best_solution = _copy_grid(solution)

        # Evil acceptance: must lean on x-wings.
        if naked_singles != 0 or hidden_singles != 0:
            continue
        if basic_solved:
            continue
        if basic_progress >= 16:
            continue
        if not stats.solved:
            continue
        if stats.advanced_steps < 16:
            continue
        if stats.steps_xwing < 2:
            continue
        if stats.steps_hidden_pairs < 2:
            continue
        if stats.score < 260:
            continue

        return puzzle, solution

    if best_puzzle is not None and best_solution is not None:
        return best_puzzle, best_solution

    # As a last resort, return any unique puzzle under the clue cap.
    rescue_deadline = perf_counter() + 2.0
    solution = generate_solution(rng)
    puzzle = _copy_grid(solution)
    positions = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(positions)

    for r, c in positions:
        if _clue_count(puzzle) <= max_clues:
            break
        backup = puzzle[r][c]
        puzzle[r][c] = 0
        if not _is_unique(puzzle, deadline=rescue_deadline):
            puzzle[r][c] = backup

    return puzzle, solution
