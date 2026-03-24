from app.core.hints import _solve_xwing_hint, get_hint


def _blank_board():
    return [[0 for _ in range(9)] for _ in range(9)]


def _blank_notes():
    return [[[] for _ in range(9)] for _ in range(9)]


def test_hint_prefers_singles():
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
    solution[0][0] = 0
    hint = get_hint(solution)
    assert "Naked single" in hint["message"]


def test_xwing_detector():
    cand = {
        (0, 0): {7},
        (0, 3): {7},
        (1, 0): {7},
        (1, 3): {7},
    }
    hint = _solve_xwing_hint(cand)
    assert hint is not None
    assert "X-wing" in hint["message"]


def test_hint_respects_notes_for_single():
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
    solution[0][0] = 0
    notes = _blank_notes()
    notes[0][0] = [2, 3]
    hint = get_hint(solution, notes)
    assert "Naked single" not in hint["message"]
    assert "Hidden single" not in hint["message"]


def test_hint_accepts_notes_for_single():
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
    solution[0][0] = 0
    notes = _blank_notes()
    notes[0][0] = [1]
    hint = get_hint(solution, notes)
    assert "Naked single" in hint["message"]


def test_pencil_mark_hint_box_pair():
    board = _blank_board()
    board[2][3] = 5
    board[3][1] = 5
    board[6][2] = 5
    hint = get_hint(board, _blank_notes())
    assert "Pencil marks" in hint["message"]
    assert hint["action"]["type"] == "note-add"
    cells = {(cell["row"], cell["column"]) for cell in hint["action"]["cells"]}
    assert cells == {(0, 0), (1, 0)}


def test_pencil_mark_hint_skips_when_notes_present():
    board = _blank_board()
    board[2][3] = 5
    board[3][1] = 5
    board[6][2] = 5
    notes = _blank_notes()
    notes[0][0] = [5]
    notes[1][0] = [5]
    hint = get_hint(board, notes)
    assert not (hint.get("action") and hint["action"].get("type") == "note-add")
