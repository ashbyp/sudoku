from app.core.hints import _solve_xwing_hint, get_hint


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
