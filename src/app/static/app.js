const boardElement = document.querySelector("#board");
const numberPadElement = document.querySelector("#number-pad");
const difficultyElement = document.querySelector("#difficulty");
const statusMessageElement = document.querySelector("#status-message");
const newGameButton = document.querySelector("#new-game");
const resetBoardButton = document.querySelector("#reset-board");
const showIncorrectButton = document.querySelector("#show-incorrect");
const togglePencilButton = document.querySelector("#toggle-pencil");
const solveBoardButton = document.querySelector("#solve-board");
const autoNotesButton = document.querySelector("#auto-notes");
const undoActionButton = document.querySelector("#undo-action");
const clearCellButton = document.querySelector("#clear-cell");
const completionBurstElement = document.querySelector("#completion-burst");
const confettiFieldElement = document.querySelector("#confetti-field");
const dismissCompletionButton = document.querySelector("#dismiss-completion");

let puzzle = [];
let solution = [];
let cells = [];
let pencilMode = false;
let selectedCells = new Set();
let activeCell = null;
let highlightedValue = null;
let historyStack = [];
let padButtons = new Map();

let hasCelebratedCompletion = false;

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function clearCompletionCelebration() {
  if (!completionBurstElement) {
    return;
  }

  completionBurstElement.classList.remove("active");
  completionBurstElement.setAttribute("aria-hidden", "true");
}

function triggerCompletionCelebration() {
  if (!completionBurstElement) {
    return;
  }

  clearCompletionCelebration();
  completionBurstElement.classList.add("active");
  completionBurstElement.setAttribute("aria-hidden", "false");
}

function boardMatchesSolution() {
  return cells.length === 81 && cells.every((cell) => cell.value === solution[cell.row][cell.column]);
}

function currentBoard() {
  return Array.from({ length: 9 }, (_, row) => (
    Array.from({ length: 9 }, (_, column) => cells[row * 9 + column].value)
  ));
}

function snapshotCell(cell) {
  return {
    row: cell.row,
    column: cell.column,
    value: cell.value,
    notes: [...cell.notes],
  };
}

function restoreCell(snapshot) {
  const cell = cells[snapshot.row * 9 + snapshot.column];
  if (!cell || cell.fixed) {
    return;
  }

  cell.value = snapshot.value;
  cell.notes = new Set(snapshot.notes);
  syncCellDisplay(cell);
}

function pushHistory(action) {
  if (!action.cells.length) {
    return;
  }
  historyStack.push(action);
}

function clearInvalidStates() {
  cells.forEach((cell) => cell.container.classList.remove("invalid"));
}

function clearIncorrectStates() {
  cells.forEach((cell) => cell.container.classList.remove("incorrect"));
}

function clearMatchHighlights() {
  cells.forEach((cell) => cell.container.classList.remove("match"));
  highlightedValue = null;
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

function updateNumberPadAvailability() {
  if (padButtons.size === 0) {
    return;
  }

  const digitCounts = new Map();
  cells.forEach((cell) => {
    if (cell.value !== 0) {
      digitCounts.set(cell.value, (digitCounts.get(cell.value) ?? 0) + 1);
    }
  });

  padButtons.forEach((button, digit) => {
    const exhausted = (digitCounts.get(digit) ?? 0) >= 9;
    button.disabled = exhausted;
    button.setAttribute("aria-disabled", exhausted ? "true" : "false");
    button.title = exhausted ? `All 9 ${digit}s are already on the board.` : "";
  });
}

function syncCellDisplay(cell) {
  cell.input.value = cell.value === 0 ? "" : String(cell.value);
  cell.input.readOnly = true;
  cell.input.classList.toggle("fixed", cell.fixed);
  cell.container.classList.toggle("fixed", cell.fixed);
  cell.notesElement.hidden = cell.value !== 0;
  updateNotesVisibility(cell);
  updateNumberPadAvailability();
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

function applyMatchHighlights(value) {
  cells.forEach((cell) => cell.container.classList.remove("match"));

  if (!value) {
    return;
  }

  cells.forEach((cell) => {
    if (cell.value === Number(value)) {
      cell.container.classList.add("match");
    }
  });
}

function highlightMatchingCells(value) {
  highlightedValue = value ? Number(value) : null;
  applyMatchHighlights(highlightedValue);
}

function refreshMatchHighlights() {
  applyMatchHighlights(highlightedValue);
}

function syncHighlightFromCell(cell) {
  if (cell && cell.value !== 0) {
    highlightMatchingCells(cell.value);
  }
}

function suppressInputSelection(input) {
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(0, 0);
  }
  if (typeof window.getSelection === "function") {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }
  input.blur();
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

function finalizeBatchSelection() {
  clearSelection();
  clearAxisHighlights();
}

function resetBoard() {
  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  renderBoard(puzzle);
  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();
  historyStack = [];
  updateStatus("Board reset to the original puzzle.");
}

function candidateDigitsForCell(cell, board) {
  const blocked = new Set();

  for (let column = 0; column < 9; column += 1) {
    const value = board[cell.row][column];
    if (value !== 0) {
      blocked.add(value);
    }
  }

  for (let row = 0; row < 9; row += 1) {
    const value = board[row][cell.column];
    if (value !== 0) {
      blocked.add(value);
    }
  }

  const boxRowStart = Math.floor(cell.row / 3) * 3;
  const boxColumnStart = Math.floor(cell.column / 3) * 3;
  for (let row = boxRowStart; row < boxRowStart + 3; row += 1) {
    for (let column = boxColumnStart; column < boxColumnStart + 3; column += 1) {
      const value = board[row][column];
      if (value !== 0) {
        blocked.add(value);
      }
    }
  }

  return Array.from({ length: 9 }, (_, index) => index + 1).filter((digit) => !blocked.has(digit));
}

function fillAutoNotes() {
  clearTransientHighlights();

  if (selectedCells.size === 0) {
    updateStatus("Select one or more cells first.");
    return;
  }

  const editableCells = selectedEditableCells();
  if (!editableCells.length) {
    updateStatus("Selected clue cells are locked.");
    return;
  }

  if (editableCells.some((cell) => cell.value !== 0)) {
    updateStatus("Auto notes only works on empty cells or cells that only contain pencil marks.");
    return;
  }

  const board = currentBoard();
  const changedCells = editableCells.filter((cell) => {
    const candidates = candidateDigitsForCell(cell, board);
    const currentNotes = [...cell.notes].sort((a, b) => a - b);
    return candidates.length !== currentNotes.length || candidates.some((digit, index) => digit !== currentNotes[index]);
  });

  if (!changedCells.length) {
    updateStatus("Selected cells already show the current possible pencil marks.");
    return;
  }

  pushHistory({
    label: "auto notes",
    highlightedValue,
    cells: changedCells.map(snapshotCell),
  });

  changedCells.forEach((cell) => {
    cell.notes = new Set(candidateDigitsForCell(cell, board));
    syncCellDisplay(cell);
  });

  refreshMatchHighlights();
  finalizeBatchSelection();
  updateStatus(`Auto notes added for ${changedCells.length} cell${changedCells.length === 1 ? "" : "s"}.`);
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

function showIncorrectNumbers() {
  clearTransientHighlights();
  clearIncorrectStates();

  const incorrectCells = cells.filter((cell) => (
    !cell.fixed && cell.value !== 0 && solution[cell.row][cell.column] !== cell.value
  ));

  incorrectCells.forEach((cell) => {
    cell.container.classList.add("incorrect");
  });

  if (incorrectCells.length === 0) {
    updateStatus("No incorrect numbers are currently on the board.");
    return;
  }

  updateStatus(`Highlighted ${incorrectCells.length} incorrect number${incorrectCells.length === 1 ? "" : "s"}.`);
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
  const boardIsComplete = cells.length === 81 && cells.every((cell) => cell.value !== 0);
  const boardIsSolved = boardIsValid && boardIsComplete && boardMatchesSolution();

  if (boardIsSolved) {
    updateStatus("Puzzle solved! Every number is exactly where it should be.");
    if (!hasCelebratedCompletion) {
      triggerCompletionCelebration();
      hasCelebratedCompletion = true;
    }
    return;
  }

  hasCelebratedCompletion = false;
  clearCompletionCelebration();
  updateStatus(boardIsValid ? "Puzzle in progress." : "That move creates a conflict in the board.");
}

function undoLastAction() {
  clearTransientHighlights();
  clearIncorrectStates();

  const action = historyStack.pop();
  if (!action) {
    updateStatus("Nothing to undo.");
    return;
  }

  action.cells.forEach(restoreCell);
  if (action.highlightedValue == null) {
    clearMatchHighlights();
  } else {
    highlightMatchingCells(action.highlightedValue);
  }
  clearSelection();
  updateBoardStatus();
  updateStatus(`Undid ${action.label}.`);
}

function applyDigitToSelection(digit, forcePencil = false) {
  clearTransientHighlights();
  clearIncorrectStates();

  const digitButton = padButtons.get(digit);
  if (digitButton?.disabled) {
    updateStatus(`All 9 ${digit}s are already on the board.`);
    return;
  }

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
  const changedCells = editableCells.filter((cell) => (usePencilMode ? cell.value === 0 : true));
  if (!changedCells.length) {
    updateStatus(usePencilMode ? "Selected cells cannot take pencil marks right now." : "Selected clue cells are locked.");
    return;
  }

  const action = {
    label: usePencilMode ? "pencil marks" : `number ${digit}`,
    highlightedValue,
    cells: changedCells.map(snapshotCell),
  };

  if (usePencilMode) {
    changedCells.forEach((cell) => {
      if (cell.notes.has(digit)) {
        cell.notes.delete(digit);
      } else {
        cell.notes.add(digit);
      }
      syncCellDisplay(cell);
    });
    pushHistory(action);
    refreshMatchHighlights();
    refreshSelectionStyles();
    updateStatus(`Pencil mark ${digit} toggled for ${changedCells.length} cell${changedCells.length === 1 ? "" : "s"}.`);
    return;
  }

  changedCells.forEach((cell) => {
    setCellValue(cell, digit);
  });
  pushHistory(action);
  highlightMatchingCells(digit);
  finalizeBatchSelection();
  updateBoardStatus();
}

function clearSelectedCells() {
  clearTransientHighlights();
  clearIncorrectStates();

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
    const changedCells = editableCells.filter((cell) => cell.value === 0 && cell.notes.size > 0);
    if (!changedCells.length) {
      updateStatus("There are no pencil marks to clear in the selected cells.");
      return;
    }

    pushHistory({
      label: "pencil marks",
      highlightedValue,
      cells: changedCells.map(snapshotCell),
    });

    changedCells.forEach((cell) => {
      cell.notes.clear();
      syncCellDisplay(cell);
    });
    refreshMatchHighlights();
    finalizeBatchSelection();
    updateStatus(`Pencil marks cleared for ${changedCells.length} cell${changedCells.length === 1 ? "" : "s"}.`);
    return;
  }

  const changedCells = editableCells.filter((cell) => cell.value !== 0);
  if (!changedCells.length) {
    updateStatus("There are no values to clear in the selected cells.");
    return;
  }

  pushHistory({
    label: "cell values",
    highlightedValue,
    cells: changedCells.map(snapshotCell),
  });

  changedCells.forEach((cell) => {
    clearCellValue(cell);
  });
  refreshMatchHighlights();
  finalizeBatchSelection();
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

  input.addEventListener("mousedown", (event) => {
    if (event.detail > 1) {
      event.preventDefault();
    }
  });

  input.addEventListener("selectstart", (event) => {
    event.preventDefault();
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
    suppressInputSelection(input);
  });

  input.addEventListener("keydown", (event) => {
    clearTransientHighlights();

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastAction();
      return;
    }

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
  padButtons = new Map();

  for (let digit = 1; digit <= 9; digit += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pad-button";
    button.textContent = String(digit);
    button.addEventListener("click", (event) => {
      applyDigitToSelection(digit, event.ctrlKey || event.metaKey);
    });
    numberPadElement.appendChild(button);
    padButtons.set(digit, button);
  }

  updateNumberPadAvailability();
}

function renderBoard(grid) {
  boardElement.innerHTML = "";
  cells = [];
  selectedCells = new Set();
  activeCell = null;
  highlightedValue = null;
  historyStack = [];

  grid.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const cell = buildEditableCell(rowIndex, columnIndex, value);
      boardElement.appendChild(cell.container);
      cells.push(cell);
    });
  });
}

function solveBoard() {
  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  renderBoard(solution);
  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  updateStatus("Solved! The full solution is now on the board.");
}

async function loadPuzzle() {
  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  updateStatus("Loading puzzle...");
  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();
  historyStack = [];

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

  if (boardElement.contains(target) || numberPadElement.contains(target) || target.closest(".number-pad-wrap")) {
    return;
  }

  clearSelection();
  clearMatchHighlights();
  clearAxisHighlights();
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastAction();
  }
});

togglePencilButton.addEventListener("click", () => {
  clearTransientHighlights();
  pencilMode = !pencilMode;
  updatePencilButton();
  if (pencilMode) {
    updateStatus("Pencil mode is on.");
  }
});

autoNotesButton.addEventListener("click", fillAutoNotes);
undoActionButton.addEventListener("click", undoLastAction);
clearCellButton.addEventListener("click", clearSelectedCells);
newGameButton.addEventListener("click", loadPuzzle);
resetBoardButton.addEventListener("click", resetBoard);
showIncorrectButton.addEventListener("click", showIncorrectNumbers);
solveBoardButton.addEventListener("click", solveBoard);
if (dismissCompletionButton) {
  dismissCompletionButton.addEventListener("click", clearCompletionCelebration);
}

if (confettiFieldElement) {
  for (let index = 0; index < 24; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.setProperty("--piece-rotate", `${(index * 29) % 360}deg`);
    piece.style.setProperty("--piece-x", `${-210 + ((index % 6) * 78)}px`);
    piece.style.setProperty("--piece-delay", `${(index % 8) * 0.04}s`);
    confettiFieldElement.appendChild(piece);
  }
}

renderNumberPad();
updatePencilButton();
loadPuzzle().catch(() => {
  updateStatus("Could not load the puzzle.");
});








