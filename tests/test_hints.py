from app.core.hints import get_hint


def test_hint_prefers_singles():
    board = [[0] * 9 for _ in range(9)]
    board[0][0] = 1
    board[0][1] = 2
    board[1][0] = 2
    board[2][0] = 3
    hint = get_hint(board)
    assert "Naked single" in hint["message"]


def test_hint_xwing_trigger():
    board = [[0] * 9 for _ in range(9)]
    # Set pencil/filled so x-wing triggers
    board[0][0] = 0
    board[0][1] = 0
    board[1][0] = 0
    board[1][1] = 0
    # Use notes to simulate x-wing pattern (two columns, rows 0,1)
    notes = [
        [[1, 4], [1, 4], [], [], [], [], [], [], []],
        [[1, 4], [1, 4], [], [], [], [], [], [], []],
    ] + [[[] for _ in range(9)] for _ in range(7)]
    hint = get_hint(board, notes)
    assert "X-wing" in hint["message"]
