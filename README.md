# Sudoku App

A small web-based Sudoku game built with FastAPI and vanilla JavaScript.

## Features

- Generate a new puzzle in easy, medium, or hard mode
- Play directly in the browser with a 9x9 grid
- Keep fixed clue cells locked
- Check the board for row, column, and box conflicts
- Detect a solved board

## Quick start

1. Create a virtual environment.
2. Install dependencies:

```powershell
pip install -e .[dev]
```

3. Run the app:

```powershell
uvicorn app.main:app --reload
```

4. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Project layout

- `src/app/main.py`: FastAPI routes and static file hosting
- `src/app/core/sudoku.py`: puzzle generation and board validation
- `src/app/static/`: browser UI assets
- `tests/`: API and app tests
