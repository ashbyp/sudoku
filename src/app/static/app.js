const boardElement = document.querySelector("#board");
const numberPadElement = document.querySelector("#number-pad");
const highlightPaletteElement = document.querySelector("#highlight-palette");
const difficultyElement = document.querySelector("#difficulty");
const statusMessageElement = document.querySelector("#status-message");
const newGameButton = document.querySelector("#new-game");
const resetBoardButton = document.querySelector("#reset-board");
const showIncorrectButton = document.querySelector("#show-incorrect");
const togglePencilButton = document.querySelector("#toggle-pencil");
const solveBoardButton = document.querySelector("#solve-board");
const autoNotesButton = document.querySelector("#auto-notes");
const autoNotesAllButton = document.querySelector("#auto-notes-all");
const undoActionButton = document.querySelector("#undo-action");
const clearCellButton = document.querySelector("#clear-cell");
const completionBurstElement = document.querySelector("#completion-burst");
const confettiFieldElement = document.querySelector("#confetti-field");
const dismissCompletionButton = document.querySelector("#dismiss-completion");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const authRegisterButton = document.querySelector("#auth-register");
const authLoginButton = document.querySelector("#auth-login");
const authLogoutButton = document.querySelector("#auth-logout");
const authSection = document.querySelector("#auth-section");
const gameShell = document.querySelector("#game-shell");
const userBadgeElement = document.querySelector("#user-badge");
const userBadgeText = document.querySelector("#user-badge-text");
const userLogoutButton = document.querySelector("#user-logout");
const authStatusElement = document.querySelector("#auth-status");

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
let isLoadingPuzzle = false;

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function blankGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
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
    mark: cell.mark ?? null,
  };
}

function restoreCell(snapshot) {
  const cell = cells[snapshot.row * 9 + snapshot.column];
  if (!cell) {
    return;
  }

  if (!cell.fixed) {
    cell.value = snapshot.value;
    cell.notes = new Set(snapshot.notes ?? []);
  }

  if ("mark" in snapshot) {
    setCellMark(cell, snapshot.mark ?? null);
  }

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
  highlightedValue = null;
  applyMatchHighlights(null);
}
function clearAxisHighlights() {
  cells.forEach((cell) => cell.container.classList.remove("axis-highlight"));
}

function clearSelection() {
  cells.forEach((cell) => {
    cell.container.classList.remove("selected");
    cell.container.setAttribute("aria-selected", "false");
  });
  selectedCells = new Set();
  activeCell = null;
}
function clearTransientHighlights() {
  clearAxisHighlights();
}

function refreshSelectionStyles() {
  cells.forEach((cell) => {
    const selected = selectedCells.has(cell);
    cell.container.classList.toggle("selected", selected);
    cell.container.setAttribute("aria-selected", selected ? "true" : "false");
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
  cells.forEach((cell) => {
    cell.noteElements.forEach((noteElement) => noteElement.classList.remove("match-note"));
  });

  if (!value) {
    return;
  }

  cells.forEach((cell) => {
    if (cell.value === Number(value)) {
      cell.container.classList.add("match");
    }
    cell.noteElements.forEach((noteElement, index) => {
      if (index + 1 === Number(value)) {
        noteElement.classList.add("match-note");
      }
    });
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

function peerCells(cell) {
  const boxRowStart = Math.floor(cell.row / 3) * 3;
  const boxColumnStart = Math.floor(cell.column / 3) * 3;

  return cells.filter((candidate) => (
    (candidate.row !== cell.row || candidate.column !== cell.column)
    && (
      candidate.row === cell.row
      || candidate.column === cell.column
      || (
        candidate.row >= boxRowStart
        && candidate.row < boxRowStart + 3
        && candidate.column >= boxColumnStart
        && candidate.column < boxColumnStart + 3
      )
    )
  ));
}
function applyAutoNotes(targetCells, options) {
  const board = currentBoard();
  const changedCells = targetCells.filter((cell) => {
    const candidates = candidateDigitsForCell(cell, board);
    const currentNotes = [...cell.notes].sort((a, b) => a - b);
    return candidates.length !== currentNotes.length || candidates.some((digit, index) => digit !== currentNotes[index]);
  });

  if (!changedCells.length) {
    updateStatus(options.noChangeMessage);
    return;
  }

  pushHistory({
    label: options.historyLabel,
    highlightedValue,
    cells: changedCells.map(snapshotCell),
  });

  changedCells.forEach((cell) => {
    cell.notes = new Set(candidateDigitsForCell(cell, board));
    syncCellDisplay(cell);
  });

  refreshMatchHighlights();
  if (options.clearSelection) {
    finalizeBatchSelection();
  }
  updateStatus(options.successMessage(changedCells.length));
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
    updateStatus("Cell notes only works on empty cells or cells that only contain pencil marks.");
    return;
  }

  applyAutoNotes(editableCells, {
    historyLabel: "cell notes",
    clearSelection: true,
    noChangeMessage: "Selected cells already show the current possible pencil marks.",
    successMessage: (count) => `Cell notes added for ${count} cell${count === 1 ? "" : "s"}.`,
  });
}

function fillAllAutoNotes() {
  clearTransientHighlights();

  const editableCells = cells.filter((cell) => !cell.fixed);
  if (!editableCells.length) {
    updateStatus("There are no editable cells on the board.");
    return;
  }

  const board = currentBoard();
  const changedCells = editableCells.filter((cell) => {
    if (cell.value !== 0) {
      return cell.notes.size > 0;
    }

    const candidates = candidateDigitsForCell(cell, board);
    const currentNotes = [...cell.notes].sort((a, b) => a - b);
    return candidates.length !== currentNotes.length || candidates.some((digit, index) => digit !== currentNotes[index]);
  });

  if (changedCells.length) {
    pushHistory({
      label: "all notes",
      highlightedValue,
      cells: changedCells.map(snapshotCell),
    });
  }

  editableCells.forEach((cell) => {
    cell.notes.clear();
    if (cell.value === 0) {
      cell.notes = new Set(candidateDigitsForCell(cell, board));
    }
    syncCellDisplay(cell);
  });

  refreshMatchHighlights();
  finalizeBatchSelection();
  const emptyCells = editableCells.filter((cell) => cell.value === 0).length;
  updateStatus(`All notes rebuilt for ${emptyCells} empty cell${emptyCells === 1 ? "" : "s"}.`);
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

let currentUser = null;

function setAuthStatus(message, isError = false) {
  if (!authStatusElement) {
    return;
  }
  authStatusElement.textContent = message;
  authStatusElement.classList.toggle("error", isError);
}

function updateAuthUI() {
  if (!authEmailInput || !authPasswordInput || !authRegisterButton || !authLoginButton || !authLogoutButton) {
    return;
  }

  const signedIn = Boolean(currentUser);
  authEmailInput.disabled = signedIn;
  authPasswordInput.disabled = signedIn;
  authRegisterButton.classList.toggle("hidden", signedIn);
  authLoginButton.classList.toggle("hidden", signedIn);
  authLogoutButton.classList.toggle("hidden", !signedIn);

  if (authSection) {
    authSection.classList.toggle("hidden", signedIn);
  }
  if (gameShell) {
    gameShell.classList.toggle("hidden", !signedIn);
  }
  if (userBadgeElement) {
    userBadgeElement.classList.toggle("hidden", !signedIn);
  }
  if (userBadgeText) {
    userBadgeText.textContent = signedIn && currentUser ? `Signed in as ${currentUser.email}` : "";
  }
}
async function refreshCurrentUser() {
  if (!authStatusElement) {
    return;
  }

  try {
    const response = await fetch("/api/me", { credentials: "include" });
    if (!response.ok) {
      currentUser = null;
      setAuthStatus("Not signed in.");
      updateAuthUI();
      return;
    }

    currentUser = await response.json();
    setAuthStatus(`Signed in as ${currentUser.email}.`);
    updateAuthUI();
    loadPuzzle();
  } catch (error) {
    currentUser = null;
    setAuthStatus("Auth service unavailable.", true);
    updateAuthUI();
  }
}

async function handleRegister() {
  if (!authEmailInput || !authPasswordInput) {
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    setAuthStatus("Enter email and password.", true);
    return;
  }

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setAuthStatus(body.detail ?? "Registration failed.", true);
      return;
    }

    currentUser = await response.json();
    authPasswordInput.value = "";
    setAuthStatus(`Signed in as ${currentUser.email}.`);
    updateAuthUI();
    loadPuzzle();
  } catch (error) {
    setAuthStatus("Registration failed.", true);
  }
}

async function handleLogin() {
  if (!authEmailInput || !authPasswordInput) {
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    setAuthStatus("Enter email and password.", true);
    return;
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setAuthStatus(body.detail ?? "Login failed.", true);
      return;
    }

    currentUser = await response.json();
    authPasswordInput.value = "";
    setAuthStatus(`Signed in as ${currentUser.email}.`);
    updateAuthUI();
    loadPuzzle();
  } catch (error) {
    setAuthStatus("Login failed.", true);
  }
}

async function handleLogout() {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  } catch (error) {
    // Ignore logout errors.
  }

  currentUser = null;
  if (authPasswordInput) {
    authPasswordInput.value = "";
  }
  setAuthStatus("Not signed in.");
  updateAuthUI();
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

function setCellMark(cell, mark) {
  cell.mark = mark;
  if (!mark) {
    cell.container.removeAttribute("data-mark");
    return;
  }

  cell.container.dataset.mark = mark;
}

function applyCellMark(mark) {
  if (selectedCells.size === 0) {
    updateStatus("Select one or more cells first.");
    return;
  }

  const normalized = mark ?? null;
  const targets = Array.from(selectedCells);
  const changed = targets.filter((cell) => (cell.mark ?? null) !== normalized);

  if (!changed.length) {
    updateStatus(normalized ? "Selected cells already have that highlight." : "Selected cells have no highlight to clear.");
    return;
  }

  pushHistory({
    label: normalized ? "highlight" : "remove highlight",
    highlightedValue,
    cells: changed.map(snapshotCell),
  });

  changed.forEach((cell) => setCellMark(cell, normalized));

  if (!normalized) {
    updateStatus("Removed highlight from " + changed.length + " cell" + (changed.length === 1 ? "" : "s") + ".");
    return;
  }

  updateStatus("Highlighted " + changed.length + " cell" + (changed.length === 1 ? "" : "s") + ".");
}

function clearAllCellMarks() {
  const marked = cells.filter((cell) => Boolean(cell.mark));
  if (!marked.length) {
    updateStatus("No highlights to clear.");
    return;
  }

  pushHistory({
    label: "clear highlights",
    highlightedValue,
    cells: marked.map(snapshotCell),
  });

  marked.forEach((cell) => setCellMark(cell, null));
  updateStatus("Cleared highlights from " + marked.length + " cell" + (marked.length === 1 ? "" : "s") + ".");
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

  if (usePencilMode) {
    const action = {
      label: "pencil marks",
      highlightedValue,
      cells: changedCells.map(snapshotCell),
    };

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

  const actionCells = new Map();
  changedCells.forEach((cell) => {
    actionCells.set(`${cell.row}-${cell.column}`, snapshotCell(cell));
  });

  changedCells.forEach((cell) => {
    peerCells(cell).forEach((peer) => {
      if (!peer.fixed && peer.value === 0 && peer.notes.has(digit)) {
        actionCells.set(`${peer.row}-${peer.column}`, snapshotCell(peer));
      }
    });
  });

  changedCells.forEach((cell) => {
    setCellValue(cell, digit);
  });

  let clearedPeerNotes = 0;
  changedCells.forEach((cell) => {
    peerCells(cell).forEach((peer) => {
      if (!peer.fixed && peer.value === 0 && peer.notes.delete(digit)) {
        clearedPeerNotes += 1;
        syncCellDisplay(peer);
      }
    });
  });

  pushHistory({
    label: `number ${digit}`,
    highlightedValue,
    cells: Array.from(actionCells.values()),
  });
  highlightMatchingCells(digit);
  finalizeBatchSelection();
  updateBoardStatus();

  if (clearedPeerNotes > 0) {
    updateStatus(`Placed ${digit} and removed matching pencil marks from ${clearedPeerNotes} peer cell${clearedPeerNotes === 1 ? "" : "s"}.`);
  }
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

  const changedCells = editableCells.filter((cell) => cell.value !== 0 || cell.notes.size > 0);
  if (!changedCells.length) {
    updateStatus("There is nothing to clear in the selected cells.");
    return;
  }

  const clearedValues = changedCells.filter((cell) => cell.value !== 0).length;
  const clearedNotes = changedCells.length - clearedValues;

  pushHistory({
    label: "cell contents",
    highlightedValue,
    cells: changedCells.map(snapshotCell),
  });

  changedCells.forEach((cell) => {
    if (cell.value !== 0) {
      clearCellValue(cell);
      return;
    }

    cell.notes.clear();
    syncCellDisplay(cell);
  });
  refreshMatchHighlights();
  finalizeBatchSelection();
  updateBoardStatus();

  if (clearedValues > 0 && clearedNotes > 0) {
    updateStatus(`Cleared ${clearedValues} value${clearedValues === 1 ? "" : "s"} and ${clearedNotes} set${clearedNotes === 1 ? "" : "s"} of pencil marks.`);
    return;
  }
  if (clearedValues > 0) {
    updateStatus(`Cleared ${clearedValues} value${clearedValues === 1 ? "" : "s"}.`);
    return;
  }
  updateStatus(`Cleared pencil marks for ${clearedNotes} cell${clearedNotes === 1 ? "" : "s"}.`);
}
function buildEditableCell(rowIndex, columnIndex, value) {
  const container = document.createElement("div");
  container.className = "cell";
  container.setAttribute("role", "gridcell");
  container.setAttribute("aria-selected", "false");

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
  input.setAttribute("role", "textbox");
  input.tabIndex = 0;
  input.dataset.row = String(rowIndex);
  input.dataset.column = String(columnIndex);
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Row " + (rowIndex + 1) + ", Column " + (columnIndex + 1));

  const notesElement = document.createElement("div");
  notesElement.className = "notes";
  notesElement.setAttribute("aria-hidden", "true");
  notesElement.setAttribute("aria-label", "Pencil marks");

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
    mark: null,
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
  boardElement.setAttribute("role", "grid");
  boardElement.setAttribute("aria-label", "Sudoku board");
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
  if (isLoadingPuzzle) {
    return;
  }

  isLoadingPuzzle = true;
  const previousNewGameLabel = newGameButton ? newGameButton.textContent : null;

  if (newGameButton) {
    newGameButton.disabled = true;
    newGameButton.classList.add("loading");
    newGameButton.textContent = "Generating...";
  }
  if (difficultyElement) {
    difficultyElement.disabled = true;
  }
  if (boardElement) {
    boardElement.setAttribute("aria-busy", "true");
  }

  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  updateStatus("Generating puzzle...");
  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();
  historyStack = [];

  try {
    const response = await fetch(`/api/puzzle?difficulty=${difficultyElement.value}`, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.detail ? ` (${body.detail})` : "";
      } catch (error) {
        const text = await response.text().catch(() => "");
        detail = text ? ` (${text.slice(0, 120)})` : "";
      }

      updateStatus(`Could not load the puzzle (HTTP ${response.status}).${detail}`);
      return;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.puzzle) || data.puzzle.length !== 9) {
      updateStatus("Could not load the puzzle (unexpected response).");
      return;
    }

    puzzle = cloneGrid(data.puzzle);
    solution = cloneGrid(data.solution);
    renderBoard(puzzle);
    updateStatus(`New ${data.difficulty} puzzle ready. Select a cell to begin. Hold Ctrl to select multiple cells.`);
  } catch (error) {
    updateStatus(`Could not load the puzzle (${error?.message ?? "network error"}).`);
  } finally {
    isLoadingPuzzle = false;

    if (newGameButton) {
      newGameButton.disabled = false;
      newGameButton.classList.remove("loading");
      if (previousNewGameLabel != null) {
        newGameButton.textContent = previousNewGameLabel;
      }
    }
    if (difficultyElement) {
      difficultyElement.disabled = false;
    }
    if (boardElement) {
      boardElement.removeAttribute("aria-busy");
    }
  }
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

if (togglePencilButton) {
  togglePencilButton.addEventListener("click", () => {
    clearTransientHighlights();
    pencilMode = !pencilMode;
    updatePencilButton();
    if (pencilMode) {
      updateStatus("Pencil mode is on.");
    }
  });
}
if (autoNotesButton) {
  autoNotesButton.addEventListener("click", fillAutoNotes);
}
if (autoNotesAllButton) {
  autoNotesAllButton.addEventListener("click", fillAllAutoNotes);
}
if (undoActionButton) {
  undoActionButton.addEventListener("click", undoLastAction);
}
if (clearCellButton) {
  clearCellButton.addEventListener("click", clearSelectedCells);
}
if (highlightPaletteElement) {
  highlightPaletteElement.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (!target.classList.contains("highlight-swatch")) {
      return;
    }

    const mark = target.dataset.mark;
    if (mark === "clear-all") {
      clearAllCellMarks();
      return;
    }

    applyCellMark(mark === "none" ? null : mark);
  });
}

if (newGameButton) {
  newGameButton.addEventListener("click", loadPuzzle);
}
if (resetBoardButton) {
  resetBoardButton.addEventListener("click", resetBoard);
}
if (showIncorrectButton) {
  showIncorrectButton.addEventListener("click", showIncorrectNumbers);
}
if (solveBoardButton) {
  solveBoardButton.addEventListener("click", solveBoard);
}
if (authRegisterButton) {
  authRegisterButton.addEventListener("click", handleRegister);
}
if (authLoginButton) {
  authLoginButton.addEventListener("click", handleLogin);
}
if (userLogoutButton) {
  userLogoutButton.addEventListener("click", handleLogout);
}
if (authLogoutButton) {
  authLogoutButton.addEventListener("click", handleLogout);
}
if (authEmailInput) {
  authEmailInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleLogin();
    }
  });
}
if (authPasswordInput) {
  authPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleLogin();
    }
  });
}
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
renderBoard(blankGrid());
refreshCurrentUser().finally(() => {
  if (currentUser) {
    loadPuzzle();
  }
});













