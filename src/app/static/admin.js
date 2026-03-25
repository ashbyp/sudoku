const puzzleGridElement = document.querySelector("#admin-puzzle-grid");
const solutionGridElement = document.querySelector("#admin-solution-grid");
const solutionWrapElement = document.querySelector("#admin-solution-wrap");
const nameInput = document.querySelector("#admin-name");
const hasSolutionToggle = document.querySelector("#admin-has-solution");
const statusElement = document.querySelector("#admin-status");
const saveButton = document.querySelector("#admin-save");
const clearPuzzleButton = document.querySelector("#admin-clear-puzzle");
const clearSolutionButton = document.querySelector("#admin-clear-solution");
const adminList = document.querySelector("#admin-list");
const adminArchivedList = document.querySelector("#admin-archived-list");
const adminUser = document.querySelector("#admin-user");
const cancelEditButton = document.querySelector("#admin-cancel-edit");

let editingPuzzleId = null;

function setStatus(message, isError = false) {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function buildGrid(container) {
  if (!container) {
    return [];
  }
  container.innerHTML = "";
  const inputs = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 1;
      input.className = "admin-cell-input";
      input.dataset.row = String(row);
      input.dataset.column = String(col);
      input.addEventListener("input", () => {
        const cleaned = input.value.replace(/[^1-9]/g, "");
        input.value = cleaned;
      });
      inputs.push(input);
      container.appendChild(input);
    }
  }
  return inputs;
}

function gridFromInputs(inputs) {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
  inputs.forEach((input) => {
    const row = Number(input.dataset.row);
    const column = Number(input.dataset.column);
    const digit = Number(input.value);
    if (Number.isFinite(row) && Number.isFinite(column) && digit >= 1 && digit <= 9) {
      grid[row][column] = digit;
    }
  });
  return grid;
}

function clearInputs(inputs) {
  inputs.forEach((input) => {
    input.value = "";
  });
}

async function deletePuzzle(puzzleId) {
  if (!Number.isFinite(puzzleId)) {
    return;
  }
  if (!confirm("Delete this puzzle? This cannot be undone.")) {
    return;
  }
  setStatus("Deleting puzzle...");
  try {
    const response = await fetch(`/api/admin/custom-puzzles/${puzzleId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus(body.detail ?? "Delete failed.", true);
      return;
    }
    setStatus("Puzzle deleted.");
    if (editingPuzzleId === puzzleId) {
      if (cancelEditButton) {
        cancelEditButton.click();
      }
    }
    await loadAdminList();
  } catch (error) {
    setStatus("Delete failed.", true);
  }
}

async function archivePuzzle(puzzleId) {
  if (!Number.isFinite(puzzleId)) {
    return;
  }
  setStatus("Archiving puzzle...");
  try {
    const response = await fetch(`/api/admin/custom-puzzles/${puzzleId}/archive`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus(body.detail ?? "Archive failed.", true);
      return;
    }
    setStatus("Puzzle archived.");
    if (editingPuzzleId === puzzleId && cancelEditButton) {
      cancelEditButton.click();
    }
    await loadAdminList();
  } catch (error) {
    setStatus("Archive failed.", true);
  }
}

async function unarchivePuzzle(puzzleId) {
  if (!Number.isFinite(puzzleId)) {
    return;
  }
  setStatus("Unarchiving puzzle...");
  try {
    const response = await fetch(`/api/admin/custom-puzzles/${puzzleId}/unarchive`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus(body.detail ?? "Unarchive failed.", true);
      return;
    }
    setStatus("Puzzle unarchived.");
    await loadAdminList();
  } catch (error) {
    setStatus("Unarchive failed.", true);
  }
}

function setEditingState(puzzleId) {
  editingPuzzleId = puzzleId;
  if (saveButton) {
    saveButton.textContent = editingPuzzleId ? "Update puzzle" : "Save puzzle";
  }
  if (cancelEditButton) {
    cancelEditButton.classList.toggle("hidden", !editingPuzzleId);
  }
}

async function loadAdminList() {
  if (!adminList || !adminArchivedList) {
    return;
  }
  adminList.innerHTML = "";
  adminArchivedList.innerHTML = "";
  try {
    const response = await fetch("/api/admin/custom-puzzles", { credentials: "include" });
    if (!response.ok) {
      adminList.innerHTML = "<li>Unable to load custom puzzles.</li>";
      adminArchivedList.innerHTML = "<li>Unable to load custom puzzles.</li>";
      return;
    }
    const data = await response.json();
    if (!data?.puzzles?.length) {
      adminList.innerHTML = "<li>No custom puzzles yet.</li>";
      adminArchivedList.innerHTML = "<li>No archived puzzles.</li>";
      return;
    }
    const active = data.puzzles.filter((puzzle) => !puzzle.archived);
    const archived = data.puzzles.filter((puzzle) => puzzle.archived);

    if (!active.length) {
      adminList.innerHTML = "<li>No active puzzles.</li>";
    }
    if (!archived.length) {
      adminArchivedList.innerHTML = "<li>No archived puzzles.</li>";
    }

    active.forEach((puzzle) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${puzzle.name} ${puzzle.has_solution ? "(with solution)" : "(no solution)"}`;
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "control-muted";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        loadPuzzleForEdit(puzzle.id);
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "control-muted danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
        deletePuzzle(puzzle.id);
      });
      const archiveButton = document.createElement("button");
      archiveButton.type = "button";
      archiveButton.className = "control-muted";
      archiveButton.textContent = "Archive";
      archiveButton.addEventListener("click", () => {
        archivePuzzle(puzzle.id);
      });
      li.appendChild(label);
      li.appendChild(editButton);
      li.appendChild(archiveButton);
      li.appendChild(deleteButton);
      adminList.appendChild(li);
    });

    archived.forEach((puzzle) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${puzzle.name} ${puzzle.has_solution ? "(with solution)" : "(no solution)"}`;
      const unarchiveButton = document.createElement("button");
      unarchiveButton.type = "button";
      unarchiveButton.className = "control-muted";
      unarchiveButton.textContent = "Unarchive";
      unarchiveButton.addEventListener("click", () => {
        unarchivePuzzle(puzzle.id);
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "control-muted danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
        deletePuzzle(puzzle.id);
      });
      li.appendChild(label);
      li.appendChild(unarchiveButton);
      li.appendChild(deleteButton);
      adminArchivedList.appendChild(li);
    });
  } catch (error) {
    adminList.innerHTML = "<li>Unable to load custom puzzles.</li>";
    adminArchivedList.innerHTML = "<li>Unable to load custom puzzles.</li>";
  }
}

async function refreshAdminUser() {
  try {
    const response = await fetch("/api/me", { credentials: "include" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (adminUser) {
      adminUser.textContent = `Signed in as ${data.email}`;
    }
  } catch (error) {
    // ignore
  }
}

const puzzleInputs = buildGrid(puzzleGridElement);
const solutionInputs = buildGrid(solutionGridElement);

if (hasSolutionToggle && solutionWrapElement && clearSolutionButton) {
  hasSolutionToggle.addEventListener("change", () => {
    solutionWrapElement.classList.toggle("hidden", !hasSolutionToggle.checked);
    clearSolutionButton.classList.toggle("hidden", !hasSolutionToggle.checked);
  });
}

if (clearPuzzleButton) {
  clearPuzzleButton.addEventListener("click", () => {
    clearInputs(puzzleInputs);
    setStatus("Puzzle grid cleared.");
  });
}

if (clearSolutionButton) {
  clearSolutionButton.addEventListener("click", () => {
    clearInputs(solutionInputs);
    setStatus("Solution grid cleared.");
  });
}

if (saveButton) {
  saveButton.addEventListener("click", async () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name) {
      setStatus("Puzzle name is required.", true);
      return;
    }
    const puzzle = gridFromInputs(puzzleInputs);
    const payload = { name, puzzle };
    if (hasSolutionToggle?.checked) {
      payload.solution = gridFromInputs(solutionInputs);
    }
    saveButton.disabled = true;
    setStatus(editingPuzzleId ? "Updating puzzle..." : "Saving puzzle...");
    try {
      const url = editingPuzzleId
        ? `/api/admin/custom-puzzles/${editingPuzzleId}`
        : "/api/admin/custom-puzzles";
      const response = await fetch(url, {
        method: editingPuzzleId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setStatus(body.detail ?? "Save failed.", true);
        saveButton.disabled = false;
        return;
      }
      const data = await response.json();
      setStatus(editingPuzzleId ? `Updated "${data.name}".` : `Saved "${data.name}".`);
      setEditingState(null);
      await loadAdminList();
    } catch (error) {
      setStatus("Save failed.", true);
    } finally {
      saveButton.disabled = false;
    }
  });
}

if (cancelEditButton) {
  cancelEditButton.addEventListener("click", () => {
    clearInputs(puzzleInputs);
    clearInputs(solutionInputs);
    if (hasSolutionToggle) {
      hasSolutionToggle.checked = false;
      solutionWrapElement?.classList.add("hidden");
      clearSolutionButton?.classList.add("hidden");
    }
    if (nameInput) {
      nameInput.value = "";
    }
    setEditingState(null);
    setStatus("Edit cancelled.");
  });
}

async function loadPuzzleForEdit(puzzleId) {
  if (!Number.isFinite(puzzleId)) {
    return;
  }
  setStatus("Loading puzzle...");
  try {
    const response = await fetch(`/api/admin/custom-puzzles/${puzzleId}`, { credentials: "include" });
    if (!response.ok) {
      setStatus("Unable to load puzzle.", true);
      return;
    }
    const data = await response.json();
    if (nameInput) {
      nameInput.value = data.name ?? "";
    }
    puzzleInputs.forEach((input) => {
      const row = Number(input.dataset.row);
      const col = Number(input.dataset.column);
      const digit = data?.puzzle?.[row]?.[col] ?? 0;
      input.value = digit ? String(digit) : "";
    });
    const hasSolution = Array.isArray(data?.solution);
    if (hasSolutionToggle) {
      hasSolutionToggle.checked = hasSolution;
      solutionWrapElement?.classList.toggle("hidden", !hasSolution);
      clearSolutionButton?.classList.toggle("hidden", !hasSolution);
    }
    solutionInputs.forEach((input) => {
      const row = Number(input.dataset.row);
      const col = Number(input.dataset.column);
      const digit = hasSolution ? (data?.solution?.[row]?.[col] ?? 0) : 0;
      input.value = digit ? String(digit) : "";
    });
    setEditingState(puzzleId);
    setStatus(`Editing "${data.name}".`);
  } catch (error) {
    setStatus("Unable to load puzzle.", true);
  }
}

refreshAdminUser();
loadAdminList();
setEditingState(null);
