import {
  cloneGrid,
  formatDuration,
  setStoredEmail,
  setStoredTheme,
  storedEmail,
  storedTheme,
  systemTheme,
} from "/static/js/app-utils.js";
import { detailMessage, fetchJson } from "/static/js/api-client.js";

const boardElement = document.querySelector("#board");
const numberPadElement = document.querySelector("#number-pad");
const highlightPaletteElement = document.querySelector("#highlight-palette");
const difficultyElement = document.querySelector("#difficulty");
const statusMessageElement = document.querySelector("#status-message");
const newGameButton = document.querySelector("#new-game");
const resetBoardButton = document.querySelector("#reset-board");
const showIncorrectButton = document.querySelector("#show-incorrect");
const togglePencilButton = document.querySelector("#toggle-pencil");
const toggleCenterButton = document.querySelector("#toggle-center");
const solveBoardButton = document.querySelector("#solve-board");
const autoNotesButton = document.querySelector("#auto-notes");
const autoNotesAllButton = document.querySelector("#auto-notes-all");
const clearNotesAllButton = document.querySelector("#clear-notes-all");
const hintButton = document.querySelector("#hint");
const hintAcceptButton = document.querySelector("#hint-accept");
const undoActionButton = document.querySelector("#undo-action");
const clearCellButton = document.querySelector("#clear-cell");
const convertNotesButton = document.querySelector("#convert-notes");
const completionBurstElement = document.querySelector("#completion-burst");
const confettiFieldElement = document.querySelector("#confetti-field");
const dismissCompletionButton = document.querySelector("#dismiss-completion");
const completionTitleElement = document.querySelector("#completion-title");
const completionMessageElement = document.querySelector("#completion-message");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const authRegisterButton = document.querySelector("#auth-register");
const authLoginButton = document.querySelector("#auth-login");
const authLogoutButton = document.querySelector("#auth-logout");
const authSection = document.querySelector("#auth-section");
const gameShell = document.querySelector("#game-shell");
const userBadgeElement = document.querySelector("#user-badge");
const userAvatarWrap = document.querySelector(".user-avatar");
const userAvatarElement = document.querySelector("#user-avatar");
const userAvatarLetter = document.querySelector("#user-avatar-letter");
const userAvatarInput = document.querySelector("#user-avatar-input");
const userBadgeText = document.querySelector("#user-badge-text");
const userLogoutButton = document.querySelector("#user-logout");
const authStatusElement = document.querySelector("#auth-status");
const themeToggleButton = document.querySelector("#theme-toggle");
const pageChromeElement = document.querySelector(".page-chrome");
const timerElement = document.querySelector("#timer");
const bestTimeElement = document.querySelector("#best-time");
const adminLink = document.querySelector("#admin-link");
const customPuzzleSelect = document.querySelector("#custom-puzzle");
const loadCustomButton = document.querySelector("#load-custom");

const THEME_STORAGE_KEY = "sudoku-theme";
const EMAIL_STORAGE_KEY = "sudoku-last-email";
const MAX_HISTORY_ENTRIES = 500;

let puzzle = [];
let solution = [];
let cells = [];
let pencilMode = false;
let centerMode = false;
let selectedCells = new Set();
let activeCell = null;
let highlightedValue = null;
let historyStack = [];
let padButtons = new Map();
let isDragSelecting = false;
let dragAdditive = false;
let dragMoved = false;
let dragSuppressClick = false;
let dragStartCell = null;

let hasCelebratedCompletion = false;
let isLoadingPuzzle = false;
let hintPencilDirective = null;
let timerStartMs = null;
let timerIntervalId = null;
let elapsedSeconds = 0;
let hasRecordedCompletion = false;
let currentDifficulty = null;
let hasSolution = false;
let currentCustomPuzzleId = null;
let isSavingCustomSolution = false;
let lastHintAction = null;
let saveTimerId = null;
let isRestoringSave = false;

function applyTheme(theme) {
  const valid = ["light", "dark", "shock"];
  const resolved = valid.includes(theme) ? theme : "light";
  document.documentElement.dataset.theme = resolved;
  if (themeToggleButton) {
    themeToggleButton.textContent = `Theme: ${resolved[0].toUpperCase()}${resolved.slice(1)}`;
  }
}

function updateTimerDisplay(seconds) {
  if (timerElement) {
    timerElement.textContent = formatDuration(seconds);
  }
}

function updateBestTimeDisplay(seconds) {
  if (!bestTimeElement) {
    return;
  }
  if (seconds == null) {
    bestTimeElement.textContent = "--";
    return;
  }
  bestTimeElement.textContent = formatDuration(seconds);
}

function resetTimerUI() {
  stopPuzzleTimer();
  timerStartMs = null;
  elapsedSeconds = 0;
  hasRecordedCompletion = false;
  updateTimerDisplay(0);
  updateBestTimeDisplay(null);
}

function stopPuzzleTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  if (timerStartMs != null) {
    elapsedSeconds = Math.max(elapsedSeconds, Math.floor((Date.now() - timerStartMs) / 1000));
  }
  updateTimerDisplay(elapsedSeconds);
}

function startPuzzleTimer() {
  stopPuzzleTimer();
  timerStartMs = Date.now();
  elapsedSeconds = 0;
  hasRecordedCompletion = false;
  updateTimerDisplay(0);
  timerIntervalId = setInterval(() => {
    if (timerStartMs == null) {
      return;
    }
    elapsedSeconds = Math.floor((Date.now() - timerStartMs) / 1000);
    updateTimerDisplay(elapsedSeconds);
  }, 1000);
}

async function fetchBestTime(difficulty) {
  if (!difficulty || !currentUser) {
    updateBestTimeDisplay(null);
    return;
  }

  try {
    const response = await fetch(`/api/best-time?difficulty=${encodeURIComponent(difficulty)}`, {
      headers: { "Accept": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      updateBestTimeDisplay(null);
      return;
    }
    const data = await response.json();
    updateBestTimeDisplay(data?.best_seconds ?? null);
  } catch (error) {
    updateBestTimeDisplay(null);
  }
}

function schedulePuzzleSave(reason = "") {
  if (!currentUser || isRestoringSave) {
    return;
  }
  if (saveTimerId) {
    clearTimeout(saveTimerId);
  }
  saveTimerId = setTimeout(() => {
    saveTimerId = null;
    savePuzzleState(reason);
  }, 500);
}

function collectPuzzleState() {
  return {
    puzzle: cloneGrid(puzzle),
    current: currentBoard(),
    notes: currentNotes(),
    center_notes: currentCenterNotes(),
    solution: hasSolution ? cloneGrid(solution) : null,
    difficulty: currentDifficulty,
    custom_puzzle_id: currentCustomPuzzleId,
    has_solution: hasSolution,
    elapsed_seconds: elapsedSeconds,
  };
}

async function savePuzzleState(reason = "") {
  if (!currentUser || !cells.length) {
    return;
  }
  try {
    await fetch("/api/puzzle-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(collectPuzzleState()),
    });
  } catch (error) {
    // Ignore save errors for now.
  }
}

function restoreFromSave(data) {
  if (!data) {
    return false;
  }
  if (!Array.isArray(data.puzzle) || !Array.isArray(data.current)) {
    return false;
  }
  if (data.puzzle.length !== 9 || data.current.length !== 9) {
    return false;
  }
  puzzle = cloneGrid(data.puzzle);
  solution = Array.isArray(data.solution) ? cloneGrid(data.solution) : blankGrid();
  hasSolution = Boolean(data.has_solution);
  currentDifficulty = data.difficulty ?? null;
  currentCustomPuzzleId = data.custom_puzzle_id ?? null;
  renderBoard(puzzle);

  const current = data.current;
  const notes = Array.isArray(data.notes) ? data.notes : [];
  const centerNotes = Array.isArray(data.center_notes) ? data.center_notes : [];

  current.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const cell = cells[rowIndex * 9 + columnIndex];
      if (!cell || cell.fixed) {
        return;
      }
      cell.value = Number(value) || 0;
      cell.notes.clear();
      cell.centerCandidates.clear();
      const noteRow = notes[rowIndex] ?? [];
      const noteEntry = noteRow[columnIndex] ?? [];
      if (Array.isArray(noteEntry)) {
        noteEntry.forEach((digit) => {
          if (Number.isFinite(digit) && digit >= 1 && digit <= 9) {
            cell.notes.add(Number(digit));
          }
        });
      }
      const centerRow = centerNotes[rowIndex] ?? [];
      const centerEntry = centerRow[columnIndex] ?? [];
      if (Array.isArray(centerEntry)) {
        centerEntry.forEach((digit) => {
          if (
            Number.isFinite(digit)
            && digit >= 1
            && digit <= 9
            && !cell.centerCandidates.has(Number(digit))
            && cell.centerCandidates.size < 4
          ) {
            cell.centerCandidates.add(Number(digit));
          }
        });
      }
      syncCellDisplay(cell);
    });
  });
  updateNumberPadAvailability();

  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();
  historyStack = [];
  hasCelebratedCompletion = false;
  const savedSeconds = Math.max(0, Number(data.elapsed_seconds ?? 0));
  elapsedSeconds = Number.isFinite(savedSeconds) ? savedSeconds : 0;
  updateTimerDisplay(elapsedSeconds);
  timerStartMs = Date.now() - elapsedSeconds * 1000;
  stopPuzzleTimer();
  startPuzzleTimer();
  if (currentDifficulty) {
    fetchBestTime(currentDifficulty);
  } else {
    updateBestTimeDisplay(null);
  }
  updateStatus("Welcome back! Your last puzzle has been restored.");
  return true;
}

async function loadSavedPuzzle() {
  if (!currentUser) {
    return;
  }
  isRestoringSave = true;
  try {
    const response = await fetch("/api/puzzle-save", { credentials: "include" });
    if (!response.ok) {
      isRestoringSave = false;
      return;
    }
    const data = await response.json();
    const restored = restoreFromSave(data?.save);
    if (!restored) {
      resetIdleBoard();
    }
  } catch (error) {
    resetIdleBoard();
  } finally {
    isRestoringSave = false;
  }
}

async function fetchCustomPuzzleList() {
  if (!customPuzzleSelect) {
    return;
  }
  customPuzzleSelect.innerHTML = "<option value=\"\">Select a custom puzzle</option>";
  customPuzzleSelect.disabled = true;
  if (!currentUser) {
    return;
  }
  try {
    const response = await fetch("/api/custom-puzzles", { credentials: "include" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    const puzzles = Array.isArray(data?.puzzles) ? data.puzzles : [];
    puzzles.forEach((puzzle) => {
      const option = document.createElement("option");
      option.value = String(puzzle.id);
      option.textContent = puzzle.completed ? `${puzzle.name} ✓` : puzzle.name;
      customPuzzleSelect.appendChild(option);
    });
    customPuzzleSelect.disabled = puzzles.length === 0;
  } catch (error) {
    // Ignore
  }
}

async function saveCustomPuzzleSolution() {
  if (!currentCustomPuzzleId || isSavingCustomSolution) {
    return;
  }
  isSavingCustomSolution = true;
  try {
    const response = await fetch(`/api/custom-puzzles/${currentCustomPuzzleId}/solution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ board: currentBoard() }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      updateStatus(body.detail ?? "Could not save solution.");
      isSavingCustomSolution = false;
      return;
    }
    solution = cloneGrid(currentBoard());
    hasSolution = true;
    isSavingCustomSolution = false;
    updateStatus("Solution saved for this puzzle.");
    fetchCustomPuzzleList();
    schedulePuzzleSave("custom-solution");
  } catch (error) {
    isSavingCustomSolution = false;
  }
}

async function loadCustomPuzzle() {
  if (!customPuzzleSelect) {
    return;
  }
  const puzzleId = Number(customPuzzleSelect.value);
  if (!Number.isFinite(puzzleId) || puzzleId <= 0) {
    updateStatus("Select a custom puzzle first.");
    return;
  }
  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  stopPuzzleTimer();
  updateTimerDisplay(0);
  hasRecordedCompletion = false;
  lastHintAction = null;
  setHintAcceptState(false);
  isSavingCustomSolution = false;

  try {
    const response = await fetch(`/api/custom-puzzles/${puzzleId}`, { credentials: "include" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      updateStatus(body.detail ?? "Could not load custom puzzle.");
      return;
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.puzzle) || data.puzzle.length !== 9) {
      updateStatus("Custom puzzle response was invalid.");
      return;
    }
    puzzle = cloneGrid(data.puzzle);
    solution = data.solution ? cloneGrid(data.solution) : blankGrid();
    hasSolution = Array.isArray(data.solution);
    currentDifficulty = null;
    currentCustomPuzzleId = data.id ?? puzzleId;
    renderBoard(puzzle);
    clearInvalidStates();
    clearIncorrectStates();
    clearMatchHighlights();
    clearAxisHighlights();
    clearSelection();
    historyStack = [];
    hasCelebratedCompletion = false;
    startPuzzleTimer();
    updateBestTimeDisplay(null);
    updateStatus(
      hasSolution
        ? `Custom puzzle "${data.name}" loaded.`
        : `Custom puzzle "${data.name}" loaded. No solution available.`,
    );
    schedulePuzzleSave("load-custom");
  } catch (error) {
    updateStatus(`Could not load custom puzzle (${error?.message ?? "network error"}).`);
  }
}

async function recordBestTime() {
  if (!currentUser || !currentDifficulty || elapsedSeconds < 1 || !hasSolution) {
    return;
  }

  try {
    const response = await fetch("/api/record-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ difficulty: currentDifficulty, seconds: elapsedSeconds }),
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    updateBestTimeDisplay(data?.best_seconds ?? null);
    if (data?.new_record) {
      updateStatus(`New record! ${formatDuration(data.best_seconds)} for ${currentDifficulty} puzzles.`);
    } else if (data?.best_seconds != null) {
      updateStatus(`Puzzle solved in ${formatDuration(elapsedSeconds)}. Best is ${formatDuration(data.best_seconds)}.`);
    }
  } catch (error) {
    // Ignore record errors.
  }
}

function handlePuzzleSolved() {
  if (hasRecordedCompletion) {
    return;
  }
  hasRecordedCompletion = true;
  stopPuzzleTimer();
  recordBestTime();
  lastHintAction = null;
  setHintAcceptState(false);
  schedulePuzzleSave("solved");
  if (currentCustomPuzzleId) {
    markCustomPuzzleComplete(currentCustomPuzzleId);
  }
}

function blankGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
}

function resetIdleBoard(message = "Select New game to begin.") {
  puzzle = blankGrid();
  solution = blankGrid();
  hasSolution = false;
  currentDifficulty = difficultyElement ? difficultyElement.value : null;
  currentCustomPuzzleId = null;
  isSavingCustomSolution = false;
  renderBoard(puzzle);
  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();
  historyStack = [];
  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  resetTimerUI();
  updateStatus(message);
  schedulePuzzleSave("reset-idle");
}

function clearCompletionCelebration() {
  if (!completionBurstElement) {
    return;
  }

  completionBurstElement.classList.remove("active");
  completionBurstElement.setAttribute("aria-hidden", "true");
  document.body.classList.remove("celebration-bg");
  if (completionTitleElement) {
    completionTitleElement.textContent = "You cracked it.";
  }
  if (completionMessageElement) {
    completionMessageElement.textContent = "The whole board is clean. Enjoy the victory lap.";
  }
}

function buildConfettiBurst(count = 80) {
  if (!confettiFieldElement) {
    return;
  }
  confettiFieldElement.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const x = -240 + Math.random() * 480;
    const rotate = Math.floor(Math.random() * 360);
    const delay = Math.random() * 0.6;
    piece.style.setProperty("--piece-rotate", `${rotate}deg`);
    piece.style.setProperty("--piece-x", `${x}px`);
    piece.style.setProperty("--piece-delay", `${delay}s`);
    confettiFieldElement.appendChild(piece);
  }
  for (let i = 0; i < 12; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--spark-x", `${-120 + Math.random() * 240}px`);
    spark.style.setProperty("--spark-delay", `${Math.random() * 0.4}s`);
    confettiFieldElement.appendChild(spark);
  }

  // Flash/explosion
  const boom = document.createElement("div");
  boom.className = "celebration-boom";
  confettiFieldElement.appendChild(boom);
}

function triggerCompletionCelebration() {
  if (!completionBurstElement) {
    return;
  }

  clearCompletionCelebration();
  buildConfettiBurst();
  completionBurstElement.classList.add("active");
  completionBurstElement.setAttribute("aria-hidden", "false");
  document.body.classList.add("celebration-bg");
  setTimeout(() => document.body.classList.remove("celebration-bg"), 2800);
}

function boardMatchesSolution() {
  if (!hasSolution || !solution || solution.length !== 9) {
    return false;
  }
  return cells.length === 81 && cells.every((cell) => cell.value === solution[cell.row][cell.column]);
}

function currentBoard() {
  return Array.from({ length: 9 }, (_, row) => (
    Array.from({ length: 9 }, (_, column) => cells[row * 9 + column].value)
  ));
}

function currentNotes() {
  return Array.from({ length: 9 }, (_, row) => (
    Array.from({ length: 9 }, (_, column) => {
      const cell = cells[row * 9 + column];
      if (!cell || cell.value !== 0) {
        return [];
      }
      return [...cell.notes].sort((a, b) => a - b);
    })
  ));
}

function currentCenterNotes() {
  return Array.from({ length: 9 }, (_, row) => (
    Array.from({ length: 9 }, (_, column) => {
      const cell = cells[row * 9 + column];
      if (!cell || cell.value !== 0) {
        return [];
      }
      return [...cell.centerCandidates].sort((a, b) => a - b);
    })
  ));
}

function snapshotCell(cell) {
  return {
    row: cell.row,
    column: cell.column,
    value: cell.value,
    notes: [...cell.notes],
    centerCandidates: [...cell.centerCandidates],
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
    cell.centerCandidates = new Set((snapshot.centerCandidates ?? []).slice(0, 4));
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
  if (historyStack.length > MAX_HISTORY_ENTRIES) {
    historyStack.shift();
  }
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

function clearHintHighlights() {
  cells.forEach((cell) => {
    cell.container.classList.remove("hint-focus");
    cell.container.classList.remove("hint-elim");
  });
  lastHintAction = null;
  setHintAcceptState(false);
}

function clearSelection(clearHint = true) {
  cells.forEach((cell) => {
    cell.container.classList.remove("selected");
    cell.container.setAttribute("aria-selected", "false");
  });
  selectedCells = new Set();
  activeCell = null;
  hintPencilDirective = null;
  if (clearHint) {
    lastHintAction = null;
    setHintAcceptState(false);
  }
}
function clearTransientHighlights() {
  clearAxisHighlights();
  clearHintHighlights();
}

function applyHintHighlights(highlights) {
  clearHintHighlights();
  if (!Array.isArray(highlights)) {
    return;
  }

  highlights.forEach((hint) => {
    const row = Number(hint?.row);
    const column = Number(hint?.column);
    if (!Number.isFinite(row) || !Number.isFinite(column)) {
      return;
    }
    const cell = cells[row * 9 + column];
    if (!cell) {
      return;
    }
    const kind = hint?.kind === "elim" ? "hint-elim" : "hint-focus";
    cell.container.classList.add(kind);
  });
}

function programmaticSelectCells(nextCells) {
  const list = Array.isArray(nextCells) ? nextCells.filter(Boolean) : [];
  if (!list.length) {
    return;
  }

  clearSelection(false);
  selectedCells = new Set(list);
  activeCell = list[0];
  refreshSelectionStyles();
  if (activeCell?.input) {
    activeCell.input.focus();
  }
  syncHighlightFromCell(activeCell);
}

function applyHintAction(action) {
  if (!action || typeof action !== "object") {
    return;
  }

  const type = action.type;
  if (type === "place") {
    const row = Number(action.row);
    const column = Number(action.column);
    if (!Number.isFinite(row) || !Number.isFinite(column)) {
      return;
    }

    const cell = cells[row * 9 + column];
    if (!cell) {
      return;
    }
    programmaticSelectCells([cell]);
    return;
  }

  if (type === "note-remove") {
    const digit = Number(action.digit);
    if (!Number.isFinite(digit) || digit < 1 || digit > 9) {
      return;
    }

    hintPencilDirective = { mode: "remove", digit };

    const targets = Array.isArray(action.cells) ? action.cells : [];
    const targetCells = targets.map((target) => {
      const row = Number(target?.row);
      const column = Number(target?.column);
      if (!Number.isFinite(row) || !Number.isFinite(column)) {
        return null;
      }
      return cells[row * 9 + column] ?? null;
    }).filter(Boolean);

    programmaticSelectCells(targetCells);
    return;
  }

  if (type === "note-add") {
    const digit = Number(action.digit);
    if (!Number.isFinite(digit) || digit < 1 || digit > 9) {
      return;
    }

    hintPencilDirective = { mode: "add", digit };

    const targets = Array.isArray(action.cells) ? action.cells : [];
    const targetCells = targets.map((target) => {
      const row = Number(target?.row);
      const column = Number(target?.column);
      if (!Number.isFinite(row) || !Number.isFinite(column)) {
        return null;
      }
      return cells[row * 9 + column] ?? null;
    }).filter(Boolean);

    programmaticSelectCells(targetCells);
    return;
  }

  if (type === "focus") {
    const row = Number(action.row);
    const column = Number(action.column);
    if (!Number.isFinite(row) || !Number.isFinite(column)) {
      return;
    }
    const cell = cells[row * 9 + column];
    if (cell) {
      programmaticSelectCells([cell]);
    }
  }
}

function refreshSelectionStyles() {
  cells.forEach((cell) => {
    setSelectionVisualState(cell, selectedCells.has(cell));
  });
}

function setSelectionVisualState(cell, selected) {
  cell.container.classList.toggle("selected", selected);
  cell.container.setAttribute("aria-selected", selected ? "true" : "false");
}

function addCellToSelection(cell) {
  if (!cell || selectedCells.has(cell)) {
    return;
  }
  selectedCells.add(cell);
  activeCell = cell;
  setSelectionVisualState(cell, true);
  syncHighlightFromCell(activeCell);
}
function updatePencilButton() {
  togglePencilButton.textContent = `Pencil mode: ${pencilMode ? "On" : "Off"}`;
  togglePencilButton.classList.toggle("control-active", pencilMode);
  togglePencilButton.classList.toggle("control-muted", !pencilMode);
}

function updateCenterButton() {
  if (!toggleCenterButton) {
    return;
  }
  toggleCenterButton.textContent = `Cell mode: ${centerMode ? "On" : "Off"}`;
  toggleCenterButton.classList.toggle("control-active", centerMode);
  toggleCenterButton.classList.toggle("control-muted", !centerMode);
}

function updateNotesVisibility(cell) {
  cell.noteElements.forEach((noteElement, index) => {
    noteElement.classList.toggle("visible", cell.notes.has(index + 1));
  });
}

function updateCenterCandidatesVisibility(cell) {
  const values = [...cell.centerCandidates].sort((a, b) => a - b);
  const key = values.join(",");
  if (cell.centerCandidatesKey !== key) {
    cell.centerCandidatesElement.textContent = "";
    values.forEach((digit, index) => {
      if (index > 0) {
        cell.centerCandidatesElement.appendChild(document.createTextNode(" "));
      }
      const candidateElement = document.createElement("span");
      candidateElement.className = "center-candidate";
      candidateElement.dataset.digit = String(digit);
      candidateElement.textContent = String(digit);
      cell.centerCandidatesElement.appendChild(candidateElement);
    });
    cell.centerCandidatesKey = key;
  }
  cell.centerCandidatesElement.hidden = cell.value !== 0 || values.length === 0;
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

function syncCellDisplay(cell, updatePadAvailability = false) {
  cell.input.value = cell.value === 0 ? "" : String(cell.value);
  cell.input.readOnly = true;
  cell.input.classList.toggle("fixed", cell.fixed);
  cell.container.classList.toggle("fixed", cell.fixed);
  cell.notesElement.hidden = cell.value !== 0;
  updateNotesVisibility(cell);
  updateCenterCandidatesVisibility(cell);
  if (updatePadAvailability) {
    updateNumberPadAvailability();
  }
}

function setCellValue(cell, value) {
  cell.value = value;
  if (value !== 0) {
    cell.notes.clear();
    cell.centerCandidates.clear();
  }
  syncCellDisplay(cell, true);
}

function clearCellValue(cell) {
  cell.value = 0;
  syncCellDisplay(cell, true);
}

function applyMatchHighlights(value) {
  cells.forEach((cell) => cell.container.classList.remove("match"));
  document.querySelectorAll(".note.match-note").forEach((noteElement) => {
    noteElement.classList.remove("match-note");
  });
  document.querySelectorAll(".center-candidate.match-note").forEach((candidateElement) => {
    candidateElement.classList.remove("match-note");
  });

  if (!value) {
    return;
  }

  cells.forEach((cell) => {
    if (cell.value === Number(value)) {
      cell.container.classList.add("match");
    }
    const matchingCenterCandidate = cell.centerCandidatesElement.querySelector(
      `.center-candidate[data-digit="${Number(value)}"]`,
    );
    if (matchingCenterCandidate) {
      matchingCenterCandidate.classList.add("match-note");
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
  lastHintAction = null;
  setHintAcceptState(false);
  updateStatus("Board reset to the original puzzle.");
  schedulePuzzleSave("reset-board");
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
  schedulePuzzleSave("auto-notes");
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
    updateStatus("Pencil marks only work on empty cells or cells that only contain pencil marks.");
    return;
  }

  applyAutoNotes(editableCells, {
    historyLabel: "pencil marks",
    clearSelection: true,
    noChangeMessage: "Selected cells already show the current possible pencil marks.",
    successMessage: (count) => `Pencil marks added for ${count} cell${count === 1 ? "" : "s"}.`,
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
      label: "all pencil marks",
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
  updateStatus(`All pencil marks rebuilt for ${emptyCells} empty cell${emptyCells === 1 ? "" : "s"}.`);
  schedulePuzzleSave("all-notes");
}

function clearAllNotes() {
  clearTransientHighlights();

  const editableCells = cells.filter((cell) => !cell.fixed);
  if (!editableCells.length) {
    updateStatus("There are no editable cells on the board.");
    return;
  }

  const changedCells = editableCells.filter((cell) => cell.notes.size > 0 || cell.centerCandidates.size > 0);
  if (!changedCells.length) {
    updateStatus("There are no pencil or cell notes to clear.");
    return;
  }

  pushHistory({
    label: "clear notes",
    highlightedValue,
    cells: changedCells.map(snapshotCell),
  });

  changedCells.forEach((cell) => {
    cell.notes.clear();
    cell.centerCandidates.clear();
    syncCellDisplay(cell);
  });

  refreshMatchHighlights();
  finalizeBatchSelection();
  updateStatus(`Cleared pencil and cell notes from ${changedCells.length} cell${changedCells.length === 1 ? "" : "s"}.`);
  schedulePuzzleSave("clear-notes");
}

function convertSelectedPencilToCellNotes() {
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

  const targetCells = editableCells.filter((cell) => cell.value === 0 && cell.notes.size > 0);
  if (!targetCells.length) {
    updateStatus("Selected cells have no pencil marks to convert.");
    return;
  }

  let truncatedCells = 0;
  pushHistory({
    label: "convert pencil marks",
    highlightedValue,
    cells: targetCells.map(snapshotCell),
  });

  targetCells.forEach((cell) => {
    const ordered = [...cell.notes].sort((a, b) => a - b);
    if (ordered.length > 4) {
      truncatedCells += 1;
    }
    cell.centerCandidates = new Set(ordered.slice(0, 4));
    cell.notes.clear();
    syncCellDisplay(cell);
  });

  refreshMatchHighlights();
  finalizeBatchSelection();
  if (truncatedCells > 0) {
    updateStatus(
      `Converted pencil marks to cell notes in ${targetCells.length} cell${targetCells.length === 1 ? "" : "s"} (${truncatedCells} trimmed to 4).`,
    );
  } else {
    updateStatus(`Converted pencil marks to cell notes in ${targetCells.length} cell${targetCells.length === 1 ? "" : "s"}.`);
  }
  schedulePuzzleSave("convert-notes");
}

async function requestHint() {
  clearTransientHighlights();

  if (isLoadingPuzzle) {
    updateStatus("Still loading the puzzle...");
    return;
  }
  if (!cells.length) {
    updateStatus("Start a game first.");
    return;
  }

  try {
    const { response, data } = await fetchJson("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: currentBoard(), notes: currentNotes() }),
    });

    if (!response.ok) {
      throw new Error(detailMessage(data, "Could not fetch a hint."));
    }

    const hint = data;
    const action = hint?.action ?? null;
    applyHintHighlights(hint?.highlights);
    applyHintAction(action);
    updateStatus(hint?.message ?? "No hint available.");
    lastHintAction = action;
    setHintAcceptState(Boolean(lastHintAction));
  } catch (error) {
    lastHintAction = null;
    setHintAcceptState(false);
    updateStatus(`Could not fetch a hint (${error?.message ?? "network error"}).`);
  }
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

function updateAvatarUI() {
  if (!userAvatarWrap || !userAvatarElement || !userAvatarLetter) {
    return;
  }
  const signedIn = Boolean(currentUser);
  if (!signedIn) {
    userAvatarWrap.classList.add("hidden");
    userAvatarElement.removeAttribute("src");
    userAvatarElement.classList.add("hidden");
    userAvatarLetter.classList.add("hidden");
    return;
  }

  const avatarUrl = currentUser?.avatar_url;
  if (avatarUrl) {
    userAvatarElement.src = avatarUrl;
    userAvatarWrap.classList.remove("hidden");
    userAvatarElement.classList.remove("hidden");
    userAvatarLetter.classList.add("hidden");
  } else {
    userAvatarElement.removeAttribute("src");
    userAvatarWrap.classList.add("hidden");
    const letter = currentUser?.email?.trim()?.[0] ?? "";
    userAvatarLetter.textContent = letter.toUpperCase();
    userAvatarLetter.classList.toggle("hidden", !letter);
    userAvatarElement.classList.add("hidden");
    userAvatarWrap.classList.remove("hidden");
  }
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
  if (pageChromeElement) {
    pageChromeElement.classList.toggle("hidden", !signedIn);
  }
  if (gameShell) {
    gameShell.classList.toggle("hidden", !signedIn);
  }
  if (userBadgeElement) {
    userBadgeElement.classList.toggle("hidden", !signedIn);
  }
  if (adminLink) {
    adminLink.classList.toggle("hidden", !(signedIn && currentUser?.is_admin));
  }
  if (userBadgeText) {
    userBadgeText.textContent = signedIn && currentUser ? `Signed in as ${currentUser.email}` : "";
  }
  updateAvatarUI();
}

function setHintAcceptState(enabled) {
  if (!hintAcceptButton) {
    return;
  }
  hintAcceptButton.disabled = !enabled;
  hintAcceptButton.classList.toggle("hidden", !enabled);
}

function applyHintAcceptance() {
  if (!lastHintAction) {
    updateStatus("Request a hint first.");
    return;
  }

  const type = lastHintAction.type;
  if (type === "place") {
    const row = Number(lastHintAction.row);
    const column = Number(lastHintAction.column);
    const digit = Number(lastHintAction.digit);
    const cell = cells[row * 9 + column];
    if (!cell || !Number.isFinite(digit)) {
      return;
    }
    selectCell(cell, false);
    applyDigitToSelection(digit, false);
    lastHintAction = null;
    setHintAcceptState(false);
    return;
  }

  if (type === "note-remove" || type === "note-add") {
    const digit = Number(lastHintAction.digit);
    const targets = Array.isArray(lastHintAction.cells) ? lastHintAction.cells : [];
    const targetCells = targets.map((target) => {
      const row = Number(target?.row);
      const column = Number(target?.column);
      if (!Number.isFinite(row) || !Number.isFinite(column)) {
        return null;
      }
      return cells[row * 9 + column] ?? null;
    }).filter(Boolean);

    if (!targetCells.length || !Number.isFinite(digit)) {
      return;
    }

    hintPencilDirective = { mode: type === "note-add" ? "add" : "remove", digit };
    programmaticSelectCells(targetCells);
    applyDigitToSelection(digit, true);
    lastHintAction = null;
    setHintAcceptState(false);
  }
}

async function uploadAvatar(file) {
  if (!file) {
    return;
  }
  if (!currentUser) {
    setAuthStatus("Sign in to set an avatar.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/avatar", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setAuthStatus(body.detail ?? "Avatar upload failed.", true);
      return;
    }
    const data = await response.json();
    currentUser.avatar_url = data?.avatar_url ?? null;
    updateAvatarUI();
    setAuthStatus("Avatar updated.");
  } catch (error) {
    setAuthStatus("Avatar upload failed.", true);
  }
}

async function markCustomPuzzleComplete(puzzleId) {
  if (!currentUser || !puzzleId) {
    return;
  }
  try {
    const response = await fetch(`/api/custom-puzzles/${puzzleId}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      fetchCustomPuzzleList();
    }
  } catch (error) {
    // Ignore completion errors.
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
      currentDifficulty = null;
      resetTimerUI();
      setAuthStatus("Not signed in.");
      updateAuthUI();
      fetchCustomPuzzleList();
      return;
    }

    currentUser = await response.json();
    setAuthStatus(`Signed in as ${currentUser.email}.`);
    updateAuthUI();
    fetchCustomPuzzleList();
    await loadSavedPuzzle();
  } catch (error) {
    currentUser = null;
    currentDifficulty = null;
    resetTimerUI();
    setAuthStatus("Auth service unavailable.", true);
    updateAuthUI();
    fetchCustomPuzzleList();
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
    const { response, data } = await fetchJson("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setAuthStatus(detailMessage(data, "Registration failed."), true);
      return;
    }

    currentUser = data;
    authPasswordInput.value = "";
    setStoredEmail(EMAIL_STORAGE_KEY, email);
    setAuthStatus(`Signed in as ${currentUser.email}.`);
    updateAuthUI();
    resetIdleBoard();
    schedulePuzzleSave("register");
    fetchCustomPuzzleList();
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
    const { response, data } = await fetchJson("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setAuthStatus(detailMessage(data, "Login failed."), true);
      return;
    }

    currentUser = data;
    authPasswordInput.value = "";
    setStoredEmail(EMAIL_STORAGE_KEY, email);
    setAuthStatus(`Signed in as ${currentUser.email}.`);
    updateAuthUI();
    await loadSavedPuzzle();
    fetchCustomPuzzleList();
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
  currentDifficulty = null;
  resetTimerUI();
  if (saveTimerId) {
    clearTimeout(saveTimerId);
    saveTimerId = null;
  }
  if (authPasswordInput) {
    authPasswordInput.value = "";
  }
  setAuthStatus("Not signed in.");
  updateAuthUI();
  fetchCustomPuzzleList();
}
function updateStatus(message) {
  statusMessageElement.textContent = message;
}

function showIncorrectNumbers() {
  clearTransientHighlights();
  clearIncorrectStates();

  if (!hasSolution) {
    updateStatus("Incorrect checking needs a solution, which isn't available for this puzzle.");
    return;
  }

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
      setSelectionVisualState(cell, false);
      syncHighlightFromCell(activeCell);
      return;
    }

    selectedCells.add(cell);
    activeCell = cell;
    setSelectionVisualState(cell, true);
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

function beginDragSelection(cell, event) {
  if (!event || event.button !== 0) {
    return;
  }

  isDragSelecting = true;
  dragAdditive = event.ctrlKey || event.metaKey;
  dragMoved = false;
  dragSuppressClick = false;
  dragStartCell = cell;

  if (!dragAdditive) {
    clearSelection();
    addCellToSelection(cell);
    return;
  }
}

function endDragSelection() {
  if (!isDragSelecting) {
    return;
  }

  isDragSelecting = false;
  dragSuppressClick = dragMoved;
  dragStartCell = null;
}

function moveSelectionBy(deltaRow, deltaColumn, appendSelection = false) {
  if (!activeCell) {
    return;
  }

  const nextRow = Math.min(8, Math.max(0, activeCell.row + deltaRow));
  const nextColumn = Math.min(8, Math.max(0, activeCell.column + deltaColumn));
  const nextCell = cells[nextRow * 9 + nextColumn];
  if (!nextCell) {
    return;
  }
  selectCell(nextCell, appendSelection);
}

function updateBoardStatus() {
  const boardIsValid = updateLiveValidation();
  const boardIsComplete = cells.length === 81 && cells.every((cell) => cell.value !== 0);
  const boardIsSolved = boardIsValid && boardIsComplete && boardMatchesSolution();
  const boardIsValidComplete = boardIsValid && boardIsComplete;

  if (boardIsSolved) {
    updateStatus("Puzzle solved! Every number is exactly where it should be.");
    if (completionTitleElement) {
      completionTitleElement.textContent = "You cracked it.";
    }
    if (completionMessageElement) {
      completionMessageElement.textContent = "The whole board is clean. Enjoy the victory lap.";
    }
    if (!hasCelebratedCompletion) {
      triggerCompletionCelebration();
      hasCelebratedCompletion = true;
    }
    handlePuzzleSolved();
    return;
  }

  if (!hasSolution && boardIsValidComplete) {
    updateStatus("Puzzle complete! The grid is valid.");
    if (completionTitleElement) {
      completionTitleElement.textContent = "Grid verified!";
    }
    if (completionMessageElement) {
      completionMessageElement.textContent = "No solution was provided, but your grid is fully valid.";
    }
    stopPuzzleTimer();
    if (!hasCelebratedCompletion) {
      triggerCompletionCelebration();
      hasCelebratedCompletion = true;
    }
    if (currentCustomPuzzleId) {
      saveCustomPuzzleSolution();
      markCustomPuzzleComplete(currentCustomPuzzleId);
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
  lastHintAction = null;
  setHintAcceptState(false);

  const action = historyStack.pop();
  if (!action) {
    updateStatus("Nothing to undo.");
    return;
  }

  action.cells.forEach(restoreCell);
  updateNumberPadAvailability();
  if (action.highlightedValue == null) {
    clearMatchHighlights();
  } else {
    highlightMatchingCells(action.highlightedValue);
  }
  clearSelection();
  updateBoardStatus();
  updateStatus(`Undid ${action.label}.`);
}

function applyDigitToSelection(digit, forcePencil = false, forceCenter = false) {
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

  const usePencilMode = forceCenter ? false : (pencilMode || forcePencil);
  const useCenterMode = forceCenter || (centerMode && !usePencilMode);
  const changedCells = editableCells.filter((cell) => (usePencilMode ? cell.value === 0 : true));
  if (!changedCells.length) {
    updateStatus(usePencilMode ? "Selected cells cannot take pencil marks right now." : "Selected clue cells are locked.");
    return;
  }

  if (useCenterMode) {
    const centerCells = changedCells.filter((cell) => cell.value === 0);
    if (!centerCells.length) {
      updateStatus("Selected cells cannot take cell candidates right now.");
      return;
    }
    let changedCount = 0;
    pushHistory({
      label: "cell candidates",
      highlightedValue,
      cells: centerCells.map(snapshotCell),
    });
    centerCells.forEach((cell) => {
      if (cell.centerCandidates.has(digit)) {
        cell.centerCandidates.delete(digit);
        changedCount += 1;
      } else if (cell.centerCandidates.size < 4) {
        cell.centerCandidates.add(digit);
        changedCount += 1;
      }
      syncCellDisplay(cell);
    });
    if (!changedCount) {
      historyStack.pop();
      updateStatus("Cell candidates are full (max 4) in selected cells.");
      return;
    }
    refreshMatchHighlights();
    refreshSelectionStyles();
    updateStatus(`Cell candidate ${digit} updated in ${changedCount} cell${changedCount === 1 ? "" : "s"}.`);
    schedulePuzzleSave("center-candidates");
    return;
  }

  if (usePencilMode) {
    // If the most recent hint asked to remove a candidate, don't "toggle" it on.
    const removeOnly = hintPencilDirective?.mode === "remove" && hintPencilDirective?.digit === digit;
    const addOnly = hintPencilDirective?.mode === "add" && hintPencilDirective?.digit === digit;
    const action = {
      label: removeOnly ? "hint candidate removal" : (addOnly ? "hint candidate add" : "pencil marks"),
      highlightedValue,
      cells: changedCells.map(snapshotCell),
    };

    let removedCount = 0;
    let addedCount = 0;
    changedCells.forEach((cell) => {
      if (removeOnly) {
        if (cell.notes.delete(digit)) {
          removedCount += 1;
        }
        return;
      }

      if (addOnly) {
        if (!cell.notes.has(digit)) {
          cell.notes.add(digit);
          addedCount += 1;
        }
        syncCellDisplay(cell);
        return;
      }

      if (cell.notes.has(digit)) {
        cell.notes.delete(digit);
      } else {
        cell.notes.add(digit);
      }
      syncCellDisplay(cell);
    });
    pushHistory(action);
    if (removeOnly || addOnly) {
      hintPencilDirective = null;
    }
    refreshMatchHighlights();
    refreshSelectionStyles();
    updateStatus(
      removeOnly
        ? `Removed ${digit} from ${removedCount} cell${removedCount === 1 ? "" : "s"}.`
        : addOnly
          ? `Added ${digit} to ${addedCount} cell${addedCount === 1 ? "" : "s"}.`
        : `Pencil mark ${digit} toggled for ${changedCells.length} cell${changedCells.length === 1 ? "" : "s"}.`,
    );
    schedulePuzzleSave("pencil");
    return;
  }

  const actionCells = new Map();
  changedCells.forEach((cell) => {
    actionCells.set(`${cell.row}-${cell.column}`, snapshotCell(cell));
  });

  changedCells.forEach((cell) => {
    peerCells(cell).forEach((peer) => {
      if (
        !peer.fixed
        && peer.value === 0
        && (peer.notes.has(digit) || peer.centerCandidates.has(digit))
      ) {
        actionCells.set(`${peer.row}-${peer.column}`, snapshotCell(peer));
      }
    });
  });

  changedCells.forEach((cell) => {
    setCellValue(cell, digit);
  });

  let clearedPeerNotes = 0;
  let clearedPeerCenters = 0;
  changedCells.forEach((cell) => {
    peerCells(cell).forEach((peer) => {
      let peerChanged = false;
      if (!peer.fixed && peer.value === 0 && peer.notes.delete(digit)) {
        clearedPeerNotes += 1;
        peerChanged = true;
      }
      if (!peer.fixed && peer.value === 0 && peer.centerCandidates.delete(digit)) {
        clearedPeerCenters += 1;
        peerChanged = true;
      }
      if (peerChanged) {
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

  if (clearedPeerNotes > 0 && clearedPeerCenters > 0) {
    updateStatus(
      `Placed ${digit} and removed matching pencil marks (${clearedPeerNotes}) and cell candidates (${clearedPeerCenters}) from peer cells.`,
    );
  } else if (clearedPeerNotes > 0) {
    updateStatus(`Placed ${digit} and removed matching pencil marks from ${clearedPeerNotes} peer cell${clearedPeerNotes === 1 ? "" : "s"}.`);
  } else if (clearedPeerCenters > 0) {
    updateStatus(`Placed ${digit} and removed matching cell candidates from ${clearedPeerCenters} peer cell${clearedPeerCenters === 1 ? "" : "s"}.`);
  }
  schedulePuzzleSave("place");
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

  const changedCells = editableCells.filter((cell) => (
    cell.value !== 0 || cell.notes.size > 0 || cell.centerCandidates.size > 0
  ));
  if (!changedCells.length) {
    updateStatus("There is nothing to clear in the selected cells.");
    return;
  }

  const clearedValues = changedCells.filter((cell) => cell.value !== 0).length;
  const clearedNotes = changedCells.filter((cell) => cell.value === 0 && cell.notes.size > 0).length;
  const clearedCenters = changedCells.filter((cell) => cell.value === 0 && cell.centerCandidates.size > 0).length;

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
    cell.centerCandidates.clear();
    syncCellDisplay(cell);
  });
  refreshMatchHighlights();
  finalizeBatchSelection();
  updateBoardStatus();

  if (clearedValues > 0 && (clearedNotes > 0 || clearedCenters > 0)) {
    const noteParts = [];
    if (clearedNotes > 0) {
      noteParts.push(`${clearedNotes} set${clearedNotes === 1 ? "" : "s"} of pencil marks`);
    }
    if (clearedCenters > 0) {
      noteParts.push(`${clearedCenters} set${clearedCenters === 1 ? "" : "s"} of cell candidates`);
    }
    updateStatus(`Cleared ${clearedValues} value${clearedValues === 1 ? "" : "s"} and ${noteParts.join(" plus ")}.`);
    schedulePuzzleSave("clear");
    return;
  }
  if (clearedValues > 0) {
    updateStatus(`Cleared ${clearedValues} value${clearedValues === 1 ? "" : "s"}.`);
    schedulePuzzleSave("clear");
    return;
  }
  if (clearedNotes > 0 && clearedCenters > 0) {
    updateStatus(`Cleared pencil marks and cell candidates in ${Math.max(clearedNotes, clearedCenters)} cell${Math.max(clearedNotes, clearedCenters) === 1 ? "" : "s"}.`);
  } else if (clearedNotes > 0) {
    updateStatus(`Cleared pencil marks for ${clearedNotes} cell${clearedNotes === 1 ? "" : "s"}.`);
  } else {
    updateStatus(`Cleared cell candidates for ${clearedCenters} cell${clearedCenters === 1 ? "" : "s"}.`);
  }
  schedulePuzzleSave("clear");
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

  const centerCandidatesElement = document.createElement("div");
  centerCandidatesElement.className = "center-candidates";
  centerCandidatesElement.setAttribute("aria-hidden", "true");
  centerCandidatesElement.hidden = true;

  const cell = {
    row: rowIndex,
    column: columnIndex,
    value,
    fixed: value !== 0,
    notes: new Set(),
    centerCandidates: new Set(),
    centerCandidatesKey: "",
    mark: null,
    container,
    input,
    notesElement,
    noteElements,
    centerCandidatesElement,
  };

  container.addEventListener("click", (event) => {
    if (dragSuppressClick) {
      event.preventDefault();
      dragSuppressClick = false;
      return;
    }
    selectCell(cell, event.ctrlKey || event.metaKey);
  });

  container.addEventListener("mousedown", (event) => {
    beginDragSelection(cell, event);
  });

  container.addEventListener("mouseenter", () => {
    if (!isDragSelecting) {
      return;
    }
    if (!dragMoved && dragAdditive && dragStartCell) {
      addCellToSelection(dragStartCell);
    }
    dragMoved = true;
    addCellToSelection(cell);
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

    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const moveMap = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const [deltaRow, deltaColumn] = moveMap[event.key] ?? [0, 0];
      const appendSelection = event.ctrlKey || event.metaKey;
      moveSelectionBy(deltaRow, deltaColumn, appendSelection);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastAction();
      return;
    }

    if (event.key >= "1" && event.key <= "9") {
      event.preventDefault();
      const digit = Number(event.key);
      const forcedByHint = hintPencilDirective?.mode === "remove" && hintPencilDirective?.digit === digit;
      const ctrlPencil = event.ctrlKey || event.metaKey;
      const shiftCenter = event.shiftKey;
      applyDigitToSelection(digit, forcedByHint || ctrlPencil, shiftCenter);
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
  container.appendChild(centerCandidatesElement);
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
      const forcedByHint = hintPencilDirective?.mode === "remove" && hintPencilDirective?.digit === digit;
      applyDigitToSelection(
        digit,
        forcedByHint || event.ctrlKey || event.metaKey,
        event.shiftKey,
      );
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
  updateNumberPadAvailability();
}

function solveBoard() {
  if (!hasSolution) {
    updateStatus("This puzzle does not have a solution available.");
    return;
  }
  clearCompletionCelebration();
  hasCelebratedCompletion = false;
  stopPuzzleTimer();
  hasRecordedCompletion = true;
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
  stopPuzzleTimer();
  updateTimerDisplay(0);
  hasRecordedCompletion = false;
  updateStatus("Generating puzzle...");
  clearInvalidStates();
  clearIncorrectStates();
  clearMatchHighlights();
  clearAxisHighlights();
  clearSelection();
  historyStack = [];
  lastHintAction = null;
  setHintAcceptState(false);

  try {
    const { response, data } = await fetchJson(`/api/puzzle?difficulty=${difficultyElement.value}`, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      const detail = data?.detail ? ` (${data.detail})` : "";

      updateStatus(`Could not load the puzzle (HTTP ${response.status}).${detail}`);
      return;
    }

    if (!data || !Array.isArray(data.puzzle) || data.puzzle.length !== 9) {
      updateStatus("Could not load the puzzle (unexpected response).");
      return;
    }

    puzzle = cloneGrid(data.puzzle);
    solution = cloneGrid(data.solution);
    hasSolution = true;
    currentDifficulty = data.difficulty;
    currentCustomPuzzleId = null;
    renderBoard(puzzle);
    startPuzzleTimer();
    lastHintAction = null;
    setHintAcceptState(false);
    fetchBestTime(currentDifficulty);
    updateStatus(`New ${data.difficulty} puzzle ready. Select a cell to begin. Hold Ctrl to select multiple cells.`);
    schedulePuzzleSave("new-game");
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
  if (target.closest(".status-panel")) {
    return;
  }

  clearSelection();
  clearMatchHighlights();
  clearAxisHighlights();
  clearHintHighlights();
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastAction();
    return;
  }

  if (
    !event.shiftKey
    && (event.ctrlKey || event.metaKey)
    && !event.altKey
    && event.key.toLowerCase() === "q"
  ) {
    const target = event.target;
    if (target instanceof Element) {
      const typingInNonBoardInput = (
        (target.closest("input, textarea, select, [contenteditable=\"true\"]") !== null)
        && !target.closest(".board")
      );
      if (typingInNonBoardInput) {
        return;
      }
    }
    event.preventDefault();
    convertSelectedPencilToCellNotes();
  }
});

document.addEventListener("mouseup", () => {
  endDragSelection();
});

if (togglePencilButton) {
  togglePencilButton.addEventListener("click", () => {
    clearTransientHighlights();
    pencilMode = !pencilMode;
    if (pencilMode) {
      centerMode = false;
      updateCenterButton();
    }
    updatePencilButton();
    if (pencilMode) {
      updateStatus("Pencil mode is on.");
    }
  });
}
if (toggleCenterButton) {
  toggleCenterButton.addEventListener("click", () => {
    clearTransientHighlights();
    centerMode = !centerMode;
    if (centerMode) {
      pencilMode = false;
      updatePencilButton();
      updateStatus("Cell mode is on.");
    }
    updateCenterButton();
  });
}
if (autoNotesButton) {
  autoNotesButton.addEventListener("click", fillAutoNotes);
}
if (autoNotesAllButton) {
  autoNotesAllButton.addEventListener("click", fillAllAutoNotes);
}
if (clearNotesAllButton) {
  clearNotesAllButton.addEventListener("click", clearAllNotes);
}
if (hintButton) {
  hintButton.addEventListener("click", requestHint);
}
if (hintAcceptButton) {
  hintAcceptButton.addEventListener("click", applyHintAcceptance);
}
if (undoActionButton) {
  undoActionButton.addEventListener("click", undoLastAction);
}
if (clearCellButton) {
  clearCellButton.addEventListener("click", clearSelectedCells);
}
if (convertNotesButton) {
  convertNotesButton.addEventListener("click", convertSelectedPencilToCellNotes);
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
if (loadCustomButton) {
  loadCustomButton.addEventListener("click", loadCustomPuzzle);
}
if (difficultyElement) {
  difficultyElement.addEventListener("change", () => {
    currentDifficulty = difficultyElement.value;
    fetchBestTime(currentDifficulty);
  });
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
if (userAvatarWrap && userAvatarInput) {
  const openAvatarPicker = () => {
    userAvatarInput.click();
  };
  userAvatarWrap.addEventListener("click", openAvatarPicker);
  userAvatarWrap.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAvatarPicker();
    }
  });
  userAvatarInput.addEventListener("change", () => {
    const file = userAvatarInput.files?.[0] ?? null;
    if (file) {
      uploadAvatar(file);
    }
    userAvatarInput.value = "";
  });
}

// Theme: prefer stored override, otherwise follow the system setting.
applyTheme(storedTheme(THEME_STORAGE_KEY) ?? systemTheme());

if (typeof window.matchMedia === "function") {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener?.("change", () => {
    if (storedTheme(THEME_STORAGE_KEY) == null) {
      applyTheme(systemTheme());
    }
  });
}

if (themeToggleButton) {
  themeToggleButton.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "light";
    const order = ["light", "dark", "shock"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    setStoredTheme(THEME_STORAGE_KEY, next);
    applyTheme(next);
  });
}
if (authEmailInput) {
  authEmailInput.value = storedEmail(EMAIL_STORAGE_KEY);
  authEmailInput.addEventListener("input", () => {
    setStoredEmail(EMAIL_STORAGE_KEY, authEmailInput.value.trim());
  });
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
updateCenterButton();
resetIdleBoard();
setHintAcceptState(false);
refreshCurrentUser().finally(() => {
});













