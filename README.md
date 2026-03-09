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

## Deploy to Render

This repo includes a `render.yaml` blueprint for a free Render web service.

1. Push this repo to GitHub.
2. In Render, choose `New +` -> `Blueprint`.
3. Connect the GitHub repo.
4. Render will read `render.yaml` and create the web service.
5. Deploy, then open the generated `onrender.com` URL.

If you prefer to create the service manually, use these settings:

- Environment: `Python`
- Build command: `pip install .`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## Project layout

- `src/app/main.py`: FastAPI routes and static file hosting
- `src/app/core/sudoku.py`: puzzle generation and board validation
- `src/app/static/`: browser UI assets
- `tests/`: API and app tests
