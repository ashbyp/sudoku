const boardElement = document.querySelector("#board");
const numberPadElement = document.querySelector("#number-pad");
const difficultyElement = document.querySelector("#difficulty");
const statusMessageElement = document.querySelector("#status-message");
const newGameButton = document.querySelector("#new-game");
const togglePencilButton = document.querySelector("#toggle-pencil");
const solveBoardButton = document.querySelector("#solve-board");
const clearCellButton = document.querySelector("#clear-cell");

let puzzle = [];
let solution = [];
let cells = [];
let pencilMode = false;
let selectedCells = new Set();
let activeCell = null;

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function currentBoard() {
  return Array.from({ length: 9 }, (_, row) => (
    Array.from({ length: 9 }, (_, column) => cells[row * 9 + column].value)
  ));
}

function clearInvalidStates() {
  cells.forEach((cell) => cell.container.classList.remove("invalid"));
}

function clearMatchHighlights() {
  cells.forEach((cell) => cell.container.classList.remove("match"));
}

function clearAxisHighlights() {
  cells.forEach((cell) => cell.container.classList.remove("axis-highlight"));
}

function clearSelection() {
  cells.forEach((cell) => cell.container.classList.remove("selected"));
  selectedCells = new Set();
  activeCell = null;
}

function clearTransientHighlights() {
  clearAxisHighlights();
}

function refreshSelectionStyles() {
  cells.forEach((cell) => {
    cell.container.classList.toggle("selected", selectedCells.has(cell));
  });
}

function updatePencilButton() {
  togglePencilButton.textContent = `Pencil mode: ${pencilMode ? "On" : "Off"}`;
  togglePencilButton.classList.toggle("control-active", pencilMode);
  togglePencilButton.classList.toggle("control-muted", !pencilMode);
}

function updateNotesVisibility(cell) {
  cell.noteElements.forEach((noteElement, index) => {
    noteElement.classList.toggle("visible", cell.notes.has(index + 1));
  });
}

function syncCellDisplay(cell) {
  cell.input.value = cell.value === 0 ? "" : String(cell.value);
  cell.input.readOnly = true;
  cell.input.classList.toggle("fixed", cell.fixed);
  cell.container.classList.toggle("fixed", cell.fixed);
  cell.notesElement.hidden = cell.value !== 0;
  updateNotesVisibility(cell);
}

function setCellValue(cell, value) {
  cell.value = value;
  if (value !== 0) {
    cell.notes.clear();
  }
  syncCellDisplay(cell);
}

function clearCellValue(cell) {
  cell.value = 0;
  syncCellDisplay(cell);
}

function highlightMatchingCells(value) {
  clearMatchHighlights();

  if (!value) {
    return;
  }

  cells.forEach((cell) => {
    if (cell.value === Number(value)) {
      cell.container.classList.add("match");
    }
  });
}

function highlightAxisForCell(cell) {
  clearAxisHighlights();

  if (!cell) {
    return;
  }

  cells.forEach((candidate) => {
    if (candidate.row === cell.row || candidate.column === cell.column) {
      candidate.container.classList.add("axis-highlight");
    }
  });
}

function syncHighlightFromCell(cell) {
  highlightMatchingCells(cell ? cell.input.value : "");
}

function updateLiveValidation() {
  clearInvalidStates();

  const board = currentBoard();
  const invalidPositions = new Set();

  function markGroup(positions) {
    const seen = new Map();

    positions.forEach(([row, column]) => {
      const value = board[row][column];
      if (value === 0) {
        return;
      }

      const previous = seen.get(value);
      if (previous) {
        invalidPositions.add(`${previous[0]}-${previous[1]}`);
        invalidPositions.add(`${row}-${column}`);
        return;
      }

      seen.set(value, [row, column]);
    });
  }

  for (let row = 0; row < 9; row += 1) {
    markGroup(Array.from({ length: 9 }, (_, column) => [row, column]));
  }

  for (let column = 0; column < 9; column += 1) {
    markGroup(Array.from({ length: 9 }, (_, row) => [row, column]));
  }

  for (let boxRow = 0; boxRow < 9; boxRow += 3) {
    for (let boxColumn = 0; boxColumn < 9; boxColumn += 3) {
      markGroup(
        Array.from({ length: 9 }, (_, index) => [
          boxRow + Math.floor(index / 3),
          boxColumn + (index % 3),
        ]),
      );
    }
  }

  invalidPositions.forEach((position) => {
    const [row, column] = position.split("-").map(Number);
    const cell = cells[row * 9 + column];
    if (cell) {
      cell.container.classList.add("invalid");
    }
  });

  return invalidPositions.size === 0;
}

function updateStatus(message) {
  statusMessageElement.textContent = message;
}

function selectedEditableCells() {
  return Array.from(selectedCells).filter((cell) => !cell.fixed);
}

function selectCell(cell, appendSelection = false) {
  clearTransientHighlights();

  if (appendSelection) {
    if (selectedCells.has(cell)) {
      selectedCells.delete(cell);
      activeCell = selectedCells.size > 0 ? Array.from(selectedCells).at(-1) : null;
      refreshSelectionStyles();
      syncHighlightFromCell(activeCell);
      return;
    }

    selectedCells.add(cell);
    activeCell = cell;
    refreshSelectionStyles();
    cell.input.focus();
    syncHighlightFromCell(activeCell);
    return;
  }

  selectedCells = new Set([cell]);
  activeCell = cell;
  refreshSelectionStyles();
  cell.input.focus();
  syncHighlightFromCell(activeCell);
}

function updateBoardStatus() {
  const boardIsValid = updateLiveValidation();
  updateStatus(boardIsValid ? "Puzzle in progress." : "That move creates a conflict in the board.");
}

function applyDigitToSelection(digit, forcePencil = false) {
  clearTransientHighlights();

  if (selectedCells.size === 0) {
    updateStatus("Select one or more cells first.");
    return;
  }

  const editableCells = selectedEditableCells();
  if (editableCells.length === 0) {
    updateStatus("Selected clue cells are locked.");
    return;
  }

  const usePencilMode = pencilMode || forcePencil;

  if (usePencilMode) {
    editableCells.forEach((cell) => {
      if (cell.value !== 0) {
        return;
      }
      if (cell.notes.has(digit)) {
        cell.notes.delete(digit);
      } else {
        cell.notes.add(digit);
      }
      syncCellDisplay(cell);
    });
    clearMatchHighlights();
    updateStatus(`Pencil mark ${digit} toggled for ${editableCells.length} cell${editableCells.length === 1 ? "" : "s"}.`);
    return;
  }

  editableCells.forEach((cell) => {
    setCellValue(cell, digit);
  });
  syncHighlightFromCell(activeCell);
  updateBoardStatus();
}

function clearSelectedCells() {
  clearTransientHighlights();

  if (selectedCells.size === 0) {
    updateStatus("Select one or more cells first.");
    return;
  }

  const editableCells = selectedEditableCells();
  if (editableCells.length === 0) {
    updateStatus("Selected clue cells are locked.");
    return;
  }

  if (pencilMode) {
    editableCells.forEach((cell) => {
      if (cell.value === 0) {
        cell.notes.clear();
        syncCellDisplay(cell);
      }
    });
    clearMatchHighlights();
    updateStatus(`Pencil marks cleared for ${editableCells.length} cell${editableCells.length === 1 ? "" : "s"}.`);
    return;
  }

  editableCells.forEach((cell) => {
    clearCellValue(cell);
  });
  syncHighlightFromCell(activeCell);
  updateBoardStatus();
}

function buildEditableCell(rowIndex, columnIndex, value) {
  const container = document.createElement("div");
  container.className = "cell";

  if ((columnIndex + 1) % 3 === 0 && columnIndex < 8) {
    container.classList.add("box-right");
  }
  if ((rowIndex + 1) % 3 === 0 && rowIndex < 8) {
    container.classList.add("box-bottom");
  }

  const input = document.createElement("input");
  input.className = "cell-input";
  input.type = "text";
  input.inputMode = "none";
  input.tabIndex = 0;
  input.dataset.row = String(rowIndex);
  input.dataset.column = String(columnIndex);
  input.autocomplete = "off";

  const notesElement = document.createElement("div");
  notesElement.className = "notes";
  notesElement.setAttribute("aria-hidden", "true");

  const noteElements = Array.from({ length: 9 }, (_, index) => {
    const note = document.createElement("span");
    note.className = "note";
    note.textContent = String(index + 1);
    notesElement.appendChild(note);
    return note;
  });

  const cell = {
    row: rowIndex,
    column: columnIndex,
    value,
    fixed: value !== 0,
    notes: new Set(),
    container,
    input,
    notesElement,
    noteElements,
  };

  container.addEventListener("click", (event) => {
    selectCell(cell, event.ctrlKey || event.metaKey);
  });

  container.addEventListener("dblclick", (event) => {
    event.preventDefault();
    selectCell(cell, event.ctrlKey || event.metaKey);
    highlightAxisForCell(cell);
  });

  input.addEventListener("focus", () => {
    activeCell = cell;
    syncHighlightFromCell(cell);
  });

  input.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCell(cell, event.ctrlKey || event.metaKey);
  });

  input.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectCell(cell, event.ctrlKey || event.metaKey);
    highlightAxisForCell(cell);
  });

  input.addEventListener("keydown", (event) => {
    clearTransientHighlights();

    if (event.key >= "1" && event.key <= "9") {
      event.preventDefault();
      applyDigitToSelection(Number(event.key));
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
      event.preventDefault();
      clearSelectedCells();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSelection();
      clearMatchHighlights();
      clearAxisHighlights();
      updateStatus("Selection cleared.");
    }
  });

  container.appendChild(notesElement);
  container.appendChild(input);
  syncCellDisplay(cell);

  return cell;
}

function renderNumberPad() {
  numberPadElement.innerHTML = "";

  for (let digit = 1; digit <= 9; digit += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pad-button";
    button.textContent = String(digit);
    button.addEventListener("click", (event) => {
      applyDigitToSelection(digit, event.shiftKey);
    });
    numberPadElement.appendChild(button);
  }
}

function renderBoard(grid) {
  boardElement.innerHTML = "";
  cells = [];
  selectedCells = new Set();
  activeCell = null;

  grid.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const cell = buildEditableCell(rowIndex, columnIndex, value);
      boardElement.appendChild(cell.container);
      cells.push(cell);
    });
  });
}

function solveBoard() {
  renderBoard(solution);
  clearInvalidStates();
  clearMatchHighlights();
  clearAxisHighlights();
  updateStatus("Solved! The full solution is now on the board.");
}

async function loadPuzzle() {
  updateStatus("Loading puzzle...");
  clearInvalidStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();

  const response = await fetch(`/api/puzzle?difficulty=${difficultyElement.value}`);
  const data = await response.json();

  puzzle = cloneGrid(data.puzzle);
  solution = cloneGrid(data.solution);
  renderBoard(puzzle);
  updateStatus(`New ${data.difficulty} puzzle ready. Select a cell to begin. Hold Ctrl to select multiple cells.`);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (boardElement.contains(target) || numberPadElement.contains(target)) {
    return;
  }

  clearSelection();
  clearMatchHighlights();
  clearAxisHighlights();
});

togglePencilButton.addEventListener("click", () => {
  clearTransientHighlights();
  pencilMode = !pencilMode;
  updatePencilButton();
  if (pencilMode) {
    updateStatus("Pencil mode is on.");
  }
});

clearCellButton.addEventListener("click", clearSelectedCells);
newGameButton.addEventListener("click", loadPuzzle);
solveBoardButton.addEventListener("click", solveBoard);

renderNumberPad();
updatePencilButton();
loadPuzzle().catch(() => {
  updateStatus("Could not load the puzzle.");
});
