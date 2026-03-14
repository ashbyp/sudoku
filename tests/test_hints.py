from app.core.hints import _solve_xwing_hint, get_hint


def test_hint_prefers_singles():
    board = [[0] * 9 for _ in range(9)]
    board[0][1] = 2
    board[1][0] = 3
    board[1][1] = 4
    # Force only one empty cell with candidate 1.
    board[0][0] = 0
    hint = get_hint(board)
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
