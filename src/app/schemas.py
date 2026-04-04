from pydantic import BaseModel, Field


class AuthPayload(BaseModel):
    email: str
    password: str


class BoardPayload(BaseModel):
    board: list[list[int]] = Field(min_length=9, max_length=9)


class HintPayload(BoardPayload):
    # Optional pencil marks grid (9x9). Each entry is a list of candidate digits shown in the UI.
    notes: list[list[list[int]]] | None = None
    center_notes: list[list[list[int]]] | None = None


class TimePayload(BaseModel):
    difficulty: str
    seconds: int = Field(ge=1)


class PuzzleSavePayload(BaseModel):
    puzzle: list[list[int]] = Field(min_length=9, max_length=9)
    current: list[list[int]] = Field(min_length=9, max_length=9)
    notes: list[list[list[int]]] | None = None
    center_notes: list[list[list[int]]] | None = None
    solution: list[list[int]] | None = None
    difficulty: str | None = None
    custom_puzzle_id: int | None = None
    has_solution: bool = False
    elapsed_seconds: int = Field(ge=0)


class CustomPuzzlePayload(BaseModel):
    name: str
    puzzle: list[list[int]] = Field(min_length=9, max_length=9)
    solution: list[list[int]] | None = None
