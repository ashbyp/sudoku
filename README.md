# Sudoku App

A small web-based Sudoku game built with FastAPI and vanilla JavaScript.

## Features

- Generate a new puzzle in easy, medium, or hard mode
- Play directly in the browser with a 9x9 grid
- Keep fixed clue cells locked
- Check the board for row, column, and box conflicts
- Detect a solved board

## Local development

1. Create and activate a virtual environment.
2. Install dependencies:

```powershell
python -m pip install -e ".[dev]"
```

3. Run the app:

```powershell
python -m uvicorn app.main:app --reload --port 8765
```

4. Open [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Docker (CLI)

Build the image:

```powershell
docker build -t sudoku-app:latest .
```

Run the container:

```powershell
docker run --rm -p 8765:8765 -v "${PWD}/.docker-data:/app/src/data" sudoku-app:latest
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Docker Desktop

1. Go to `Images`.
2. Find `sudoku-app:latest` and click `Run`.
3. Open `Optional settings`.
4. Under `Ports`, set host `8765` to container `8765`.
5. Under `Volumes`, map a host folder (for example `C:\Users\ashbyp\dev\databases\sudoku`) to `/app/src/data`.
6. Run the container and open [http://127.0.0.1:8765](http://127.0.0.1:8765).

Note: do not open `http://0.0.0.0:8765` in a browser. Use `localhost` or `127.0.0.1`.

## Project layout

- `src/app/main.py`: FastAPI routes and static file hosting
- `src/app/core/sudoku.py`: puzzle generation and board validation
- `src/app/static/`: browser UI assets
- `tests/`: API and app tests
