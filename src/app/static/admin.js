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
const pasteImageButton = document.querySelector("#admin-paste-image");
const uploadImageButton = document.querySelector("#admin-upload-image");
const clearImageButton = document.querySelector("#admin-clear-image");
const imageInput = document.querySelector("#admin-image-input");
const imagePreviewWrap = document.querySelector("#admin-image-preview-wrap");
const imagePreview = document.querySelector("#admin-image-preview");
const imageOverlay = document.querySelector("#admin-image-overlay");
const autoTranscribeButton = document.querySelector("#admin-auto-transcribe");
const imageEntryButton = document.querySelector("#admin-image-entry");

let editingPuzzleId = null;
let importedImageUrl = null;
let transcribeBusy = false;
let imageEntryMode = false;
let imageEntryCell = null;
let autoGridModel = null;

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
        if (cleaned) {
          moveAdminFocus(input, 0, 1);
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveAdminFocus(input, 0, 1);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveAdminFocus(input, 0, -1);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveAdminFocus(input, 1, 0);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveAdminFocus(input, -1, 0);
          return;
        }
        if (event.key === "Backspace" && !input.value) {
          event.preventDefault();
          moveAdminFocus(input, 0, -1, true);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          moveAdminFocus(input, 1, 0);
        }
      });
      inputs.push(input);
      container.appendChild(input);
    }
  }
  return inputs;
}

function moveAdminFocus(input, deltaRow, deltaCol, clearTarget = false) {
  const row = Number(input.dataset.row);
  const col = Number(input.dataset.column);
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    return;
  }
  const nextRow = Math.min(8, Math.max(0, row + deltaRow));
  const nextCol = Math.min(8, Math.max(0, col + deltaCol));
  const selector = `.admin-cell-input[data-row="${nextRow}"][data-column="${nextCol}"]`;
  const next = input.closest(".admin-grid")?.querySelector(selector);
  if (!(next instanceof HTMLInputElement)) {
    return;
  }
  if (clearTarget) {
    next.value = "";
  }
  next.focus();
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

function clearImportedImage() {
  if (importedImageUrl) {
    URL.revokeObjectURL(importedImageUrl);
    importedImageUrl = null;
  }
  if (imagePreview) {
    imagePreview.removeAttribute("src");
  }
  if (imageOverlay) {
    const ctx = imageOverlay.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, imageOverlay.width, imageOverlay.height);
    }
  }
  imageEntryCell = null;
  autoGridModel = null;
  imagePreviewWrap?.classList.add("hidden");
}

function setImportedImage(blob) {
  if (!blob || !blob.type.startsWith("image/")) {
    setStatus("Clipboard item is not an image.", true);
    return;
  }
  clearImportedImage();
  importedImageUrl = URL.createObjectURL(blob);
  if (imagePreview) {
    imagePreview.src = importedImageUrl;
  }
  imagePreviewWrap?.classList.remove("hidden");
  queueMicrotask(() => {
    syncOverlaySize();
    autoGridModel = detectAutoGridModel();
    drawGridOverlay();
  });
  setStatus("Image imported. Run auto-transcribe or use Image entry mode.");
}

function syncOverlaySize() {
  if (!(imageOverlay instanceof HTMLCanvasElement) || !(imagePreview instanceof HTMLImageElement)) {
    return;
  }
  const width = Math.max(1, Math.floor(imagePreview.clientWidth));
  const height = Math.max(1, Math.floor(imagePreview.clientHeight));
  imageOverlay.width = width;
  imageOverlay.height = height;
}

function drawGridOverlay() {
  if (!(imageOverlay instanceof HTMLCanvasElement)) {
    return;
  }
  const ctx = imageOverlay.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, imageOverlay.width, imageOverlay.height);
  if (!imageEntryMode) {
    return;
  }

  const bounds = normalizedGridBounds();
  if (!bounds) {
    return;
  }
  const { x1, y1, x2, y2 } = bounds;
  const w = x2 - x1;
  const h = y2 - y1;

  if (imageEntryCell) {
    const cellW = w / 9;
    const cellH = h / 9;
    const cx = x1 + imageEntryCell.column * cellW;
    const cy = y1 + imageEntryCell.row * cellH;
    const cw = cellW;
    const ch = cellH;
    ctx.fillStyle = "rgba(35, 120, 198, 0.16)";
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = "rgba(35, 120, 198, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, Math.max(1, cw - 2), Math.max(1, ch - 2));
  }
}

function pickBestTenCenters(centers) {
  if (centers.length <= 10) {
    return centers;
  }
  let best = centers.slice(0, 10);
  let bestScore = Number.POSITIVE_INFINITY;
  for (let start = 0; start <= centers.length - 10; start += 1) {
    const candidate = centers.slice(start, start + 10);
    const diffs = [];
    for (let i = 1; i < candidate.length; i += 1) {
      diffs.push(candidate[i] - candidate[i - 1]);
    }
    const mean = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    const variance = diffs.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / diffs.length;
    if (variance < bestScore) {
      bestScore = variance;
      best = candidate;
    }
  }
  return best;
}

function detectLineCenters(counts, threshold) {
  const centers = [];
  let start = -1;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= threshold && start < 0) {
      start = i;
      continue;
    }
    if (counts[i] < threshold && start >= 0) {
      const end = i - 1;
      centers.push(Math.round((start + end) / 2));
      start = -1;
    }
  }
  if (start >= 0) {
    centers.push(Math.round((start + counts.length - 1) / 2));
  }
  return pickBestTenCenters(centers);
}

function detectAutoGridModel() {
  if (!(imageOverlay instanceof HTMLCanvasElement) || !(imagePreview instanceof HTMLImageElement)) {
    return null;
  }
  const width = imageOverlay.width;
  const height = imageOverlay.height;
  if (width < 20 || height < 20) {
    return null;
  }

  const temp = document.createElement("canvas");
  temp.width = width;
  temp.height = height;
  const tctx = temp.getContext("2d");
  if (!tctx) {
    return null;
  }
  tctx.drawImage(imagePreview, 0, 0, width, height);
  const { data } = tctx.getImageData(0, 0, width, height);
  const colDark = new Array(width).fill(0);
  const rowDark = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (gray < 145) {
        colDark[x] += 1;
        rowDark[y] += 1;
      }
    }
  }
  const colMax = Math.max(...colDark);
  const rowMax = Math.max(...rowDark);
  const colThreshold = Math.max(8, Math.floor(colMax * 0.62));
  const rowThreshold = Math.max(8, Math.floor(rowMax * 0.62));
  let cols = detectLineCenters(colDark, colThreshold);
  let rows = detectLineCenters(rowDark, rowThreshold);

  if (cols.length !== 10 || rows.length !== 10) {
    const fallbackColThreshold = Math.max(8, Math.floor(colMax * 0.48));
    const fallbackRowThreshold = Math.max(8, Math.floor(rowMax * 0.48));
    cols = detectLineCenters(colDark, fallbackColThreshold);
    rows = detectLineCenters(rowDark, fallbackRowThreshold);
  }

  if (cols.length === 10 && rows.length === 10) {
    const rawX1 = Math.max(0, cols[0] - 1);
    const rawY1 = Math.max(0, rows[0] - 1);
    const rawX2 = Math.min(width, cols[9] + 1);
    const rawY2 = Math.min(height, rows[9] + 1);
    const rawW = rawX2 - rawX1;
    const rawH = rawY2 - rawY1;
    const side = Math.max(40, Math.min(rawW, rawH));
    const cx = (rawX1 + rawX2) / 2;
    const cy = (rawY1 + rawY2) / 2;
    const x1 = Math.max(0, Math.round(cx - side / 2));
    const y1 = Math.max(0, Math.round(cy - side / 2));
    const x2 = Math.min(width, x1 + side);
    const y2 = Math.min(height, y1 + side);
    return {
      entry_bounds: { x1, y1, x2, y2 },
      ocr_bounds: { x1: rawX1, y1: rawY1, x2: rawX2, y2: rawY2 },
      lines: null,
    };
  }
  let x1 = -1;
  let x2 = -1;
  let y1 = -1;
  let y2 = -1;
  for (let x = 0; x < width; x += 1) {
    if (colDark[x] >= Math.max(8, Math.floor(height * 0.14))) {
      x1 = x;
      break;
    }
  }
  for (let x = width - 1; x >= 0; x -= 1) {
    if (colDark[x] >= Math.max(8, Math.floor(height * 0.14))) {
      x2 = x;
      break;
    }
  }
  for (let y = 0; y < height; y += 1) {
    if (rowDark[y] >= Math.max(8, Math.floor(width * 0.14))) {
      y1 = y;
      break;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    if (rowDark[y] >= Math.max(8, Math.floor(width * 0.14))) {
      y2 = y;
      break;
    }
  }
  if (x1 < 0 || x2 < 0 || y1 < 0 || y2 < 0 || x2 - x1 < 40 || y2 - y1 < 40) {
    return null;
  }
  const rawX1 = Math.max(0, x1 - 2);
  const rawY1 = Math.max(0, y1 - 2);
  const rawX2 = Math.min(width, x2 + 2);
  const rawY2 = Math.min(height, y2 + 2);
  const rawW = rawX2 - rawX1;
  const rawH = rawY2 - rawY1;
  const side = Math.max(40, Math.min(rawW, rawH));
  const cx = (rawX1 + rawX2) / 2;
  const cy = (rawY1 + rawY2) / 2;
  const sx1 = Math.max(0, Math.round(cx - side / 2));
  const sy1 = Math.max(0, Math.round(cy - side / 2));
  const sx2 = Math.min(width, sx1 + side);
  const sy2 = Math.min(height, sy1 + side);
  return {
    entry_bounds: { x1: sx1, y1: sy1, x2: sx2, y2: sy2 },
    ocr_bounds: { x1: rawX1, y1: rawY1, x2: rawX2, y2: rawY2 },
    lines: null,
  };
}

function updateImageEntryButton() {
  if (!imageEntryButton) {
    return;
  }
  imageEntryButton.textContent = `Image entry: ${imageEntryMode ? "On" : "Off"}`;
  imageEntryButton.classList.toggle("control-active", imageEntryMode);
}

function getPuzzleInput(row, column) {
  return puzzleInputs.find((input) => (
    Number(input.dataset.row) === row && Number(input.dataset.column) === column
  )) || null;
}

function selectImageEntryCell(row, column) {
  if (!Number.isFinite(row) || !Number.isFinite(column) || row < 0 || row > 8 || column < 0 || column > 8) {
    return;
  }
  imageEntryCell = { row, column };
  drawGridOverlay();
  const input = getPuzzleInput(row, column);
  if (input) {
    input.focus();
  }
}

function imagePointToCell(point) {
  const bounds = normalizedGridBounds();
  if (!point || !bounds) {
    return null;
  }
  const { x1, y1, x2, y2 } = bounds;
  if (point.x < x1 || point.x > x2 || point.y < y1 || point.y > y2) {
    return null;
  }
  const col = Math.min(8, Math.max(0, Math.floor(((point.x - x1) / Math.max(1, x2 - x1)) * 9)));
  const row = Math.min(8, Math.max(0, Math.floor(((point.y - y1) / Math.max(1, y2 - y1)) * 9)));
  return { row, column: col };
}

function moveImageEntryCell(deltaRow, deltaCol) {
  if (!imageEntryCell) {
    return;
  }
  const row = Math.min(8, Math.max(0, imageEntryCell.row + deltaRow));
  const column = Math.min(8, Math.max(0, imageEntryCell.column + deltaCol));
  selectImageEntryCell(row, column);
}

function applyImageEntryDigit(digit) {
  if (!imageEntryCell) {
    return;
  }
  const input = getPuzzleInput(imageEntryCell.row, imageEntryCell.column);
  if (!input) {
    return;
  }
  input.value = digit >= 1 && digit <= 9 ? String(digit) : "";
}

function clickToOverlayPoint(event) {
  if (!(imageOverlay instanceof HTMLCanvasElement)) {
    return null;
  }
  const rect = imageOverlay.getBoundingClientRect();
  const x = Math.max(0, Math.min(imageOverlay.width, event.clientX - rect.left));
  const y = Math.max(0, Math.min(imageOverlay.height, event.clientY - rect.top));
  return { x, y };
}

function normalizedGridBounds() {
  if (autoGridModel?.entry_bounds) {
    return autoGridModel.entry_bounds;
  }
  if (!(imageOverlay instanceof HTMLCanvasElement)) {
    return null;
  }
  return { x1: 0, y1: 0, x2: imageOverlay.width, y2: imageOverlay.height };
}

function preprocessCell(sourceCanvas, sx, sy, sw, sh, options = {}) {
  const {
    threshold = 170,
    adaptive = false,
    invert = false,
    binary = true,
    contrastBoost = 1.25,
  } = options;
  const out = document.createElement("canvas");
  out.width = 96;
  out.height = 96;
  const outCtx = out.getContext("2d");
  if (!outCtx) {
    return out;
  }
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 10, 10, 76, 76);

  const imageData = outCtx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;
  let mean = 0;
  for (let i = 0; i < data.length; i += 4) {
    mean += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  mean /= (data.length / 4);
  const dynamicThreshold = adaptive ? Math.max(120, Math.min(205, mean - 10)) : threshold;
  for (let i = 0; i < data.length; i += 4) {
    let gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    gray = Math.max(0, Math.min(255, Math.round((gray - 128) * contrastBoost + 128)));
    if (binary) {
      let bit = gray < dynamicThreshold ? 0 : 255;
      if (invert) {
        bit = 255 - bit;
      }
      data[i] = bit;
      data[i + 1] = bit;
      data[i + 2] = bit;
    } else {
      const value = invert ? 255 - gray : gray;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    data[i + 3] = 255;
  }
  outCtx.putImageData(imageData, 0, 0);
  return out;
}

function hasInk(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 120) {
      dark += 1;
    }
  }
  return dark / (width * height) > 0.002;
}

function hasInkRaw(sourceCanvas, sx, sy, sw, sh) {
  const probe = document.createElement("canvas");
  probe.width = 42;
  probe.height = 42;
  const ctx = probe.getContext("2d");
  if (!ctx) {
    return false;
  }
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, probe.width, probe.height);
  const { data, width, height } = ctx.getImageData(0, 0, probe.width, probe.height);
  let dark = 0;
  let sum = 0;
  let sumSq = 0;
  const total = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (gray < 150) {
      dark += 1;
    }
    sum += gray;
    sumSq += gray * gray;
  }
  const ratio = dark / total;
  const mean = sum / total;
  const variance = Math.max(0, (sumSq / total) - mean * mean);
  const stddev = Math.sqrt(variance);
  return ratio > 0.012 || stddev > 22;
}

function cleanDigitText(text) {
  const normalized = String(text || "").replace(/[^1-9]/g, "");
  return normalized ? Number(normalized[0]) : 0;
}

function ocrConfidence(result) {
  const value = Number(result?.data?.confidence ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function extractOcrGlyphs(result) {
  const data = result?.data || {};
  if (Array.isArray(data.symbols) && data.symbols.length) {
    return data.symbols.map((symbol) => ({
      text: symbol?.text ?? "",
      confidence: Number(symbol?.confidence ?? data.confidence ?? 0),
      bbox: symbol?.bbox ?? null,
    }));
  }
  if (Array.isArray(data.words) && data.words.length) {
    const glyphs = [];
    for (const word of data.words) {
      const text = String(word?.text ?? "").replace(/[^1-9]/g, "");
      if (!text) {
        continue;
      }
      const bbox = word?.bbox ?? null;
      if (!bbox || !Number.isFinite(bbox.x0) || !Number.isFinite(bbox.x1)) {
        for (const ch of text) {
          glyphs.push({
            text: ch,
            confidence: Number(word?.confidence ?? data.confidence ?? 0),
            bbox: null,
          });
        }
        continue;
      }
      const span = Math.max(1, bbox.x1 - bbox.x0);
      const cw = span / text.length;
      for (let i = 0; i < text.length; i += 1) {
        glyphs.push({
          text: text[i],
          confidence: Number(word?.confidence ?? data.confidence ?? 0),
          bbox: {
            x0: bbox.x0 + i * cw,
            y0: bbox.y0,
            x1: bbox.x0 + (i + 1) * cw,
            y1: bbox.y1,
          },
        });
      }
    }
    return glyphs;
  }
  return [];
}

async function readDigit(worker, canvas) {
  const result = await worker.recognize(canvas);
  return {
    digit: cleanDigitText(result?.data?.text || ""),
    confidence: ocrConfidence(result),
    result,
  };
}

function extractBoardRegion(source, x1, y1, regionW, regionH) {
  const insetX = Math.max(2, Math.floor(regionW * 0.01));
  const insetY = Math.max(2, Math.floor(regionH * 0.01));
  const sx = x1 + insetX;
  const sy = y1 + insetY;
  const sw = Math.max(20, regionW - insetX * 2);
  const sh = Math.max(20, regionH - insetY * 2);
  const board = document.createElement("canvas");
  board.width = sw;
  board.height = sh;
  const boardCtx = board.getContext("2d");
  if (!boardCtx) {
    return board;
  }
  boardCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return board;
}

function removeGridLines(boardCanvas) {
  const cleaned = document.createElement("canvas");
  cleaned.width = boardCanvas.width;
  cleaned.height = boardCanvas.height;
  const ctx = cleaned.getContext("2d");
  if (!ctx) {
    return boardCanvas;
  }
  ctx.drawImage(boardCanvas, 0, 0);
  const image = ctx.getImageData(0, 0, cleaned.width, cleaned.height);
  const data = image.data;
  const width = cleaned.width;
  const height = cleaned.height;

  const colDark = new Array(width).fill(0);
  const rowDark = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (gray < 95) {
        colDark[x] += 1;
        rowDark[y] += 1;
      }
    }
  }

  const colThreshold = Math.max(8, Math.floor(height * 0.42));
  const rowThreshold = Math.max(8, Math.floor(width * 0.42));
  const colLines = [];
  const rowLines = [];
  for (let x = 0; x < width; x += 1) {
    if (colDark[x] >= colThreshold) {
      colLines.push(x);
    }
  }
  for (let y = 0; y < height; y += 1) {
    if (rowDark[y] >= rowThreshold) {
      rowLines.push(y);
    }
  }

  const whitenColumn = (x) => {
    for (let y = 0; y < height; y += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  };
  const whitenRow = (y) => {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  };

  for (const x of colLines) {
    for (let d = -1; d <= 1; d += 1) {
      const xx = x + d;
      if (xx >= 0 && xx < width) {
        whitenColumn(xx);
      }
    }
  }
  for (const y of rowLines) {
    for (let d = -1; d <= 1; d += 1) {
      const yy = y + d;
      if (yy >= 0 && yy < height) {
        whitenRow(yy);
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return cleaned;
}

async function boardWidePass(worker, boardCanvas) {
  const board = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({ digit: 0, confidence: -1 })));
  await worker.setParameters({
    tessedit_char_whitelist: "123456789",
    tessedit_pageseg_mode: "6",
  });
  const result = await worker.recognize(boardCanvas);
  const glyphs = extractOcrGlyphs(result);
  const cellW = boardCanvas.width / 9;
  const cellH = boardCanvas.height / 9;
  for (const glyph of glyphs) {
    const digit = cleanDigitText(glyph.text);
    if (!digit || !glyph.bbox) {
      continue;
    }
    const cx = (Number(glyph.bbox.x0) + Number(glyph.bbox.x1)) / 2;
    const cy = (Number(glyph.bbox.y0) + Number(glyph.bbox.y1)) / 2;
    const row = Math.floor(cy / cellH);
    const col = Math.floor(cx / cellW);
    if (row < 0 || row > 8 || col < 0 || col > 8) {
      continue;
    }
    const confidence = Number(glyph.confidence ?? 0);
    if (confidence > board[row][col].confidence) {
      board[row][col] = { digit, confidence };
    }
  }
  return board;
}

async function cellFallbackPass(worker, rawBoardCanvas, cleanedBoardCanvas, boardState) {
  await worker.setParameters({
    tessedit_char_whitelist: "123456789",
    tessedit_pageseg_mode: "10",
    classify_bln_numeric_mode: "1",
  });
  const cellW = rawBoardCanvas.width / 9;
  const cellH = rawBoardCanvas.height / 9;
  const variants = [
    { binary: false, invert: false, contrastBoost: 1.35 },
    { binary: true, threshold: 138, adaptive: false, invert: false, contrastBoost: 1.2 },
    { binary: true, threshold: 158, adaptive: false, invert: false, contrastBoost: 1.28 },
    { binary: true, threshold: 178, adaptive: false, invert: false, contrastBoost: 1.35 },
    { binary: true, threshold: 170, adaptive: true, invert: false, contrastBoost: 1.25 },
  ];

  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (boardState[row][col].digit >= 1 && boardState[row][col].confidence >= 55) {
        continue;
      }
      const marginX = Math.max(2, Math.floor(cellW * 0.17));
      const marginY = Math.max(2, Math.floor(cellH * 0.17));
      const sx = Math.floor(col * cellW + marginX);
      const sy = Math.floor(row * cellH + marginY);
      const sw = Math.max(4, Math.floor(cellW - marginX * 2));
      const sh = Math.max(4, Math.floor(cellH - marginY * 2));
      if (!hasInkRaw(rawBoardCanvas, sx, sy, sw, sh)) {
        continue;
      }
      let best = { digit: 0, confidence: -1 };
      const votes = new Map();
      for (const variant of variants) {
        const sourceCanvas = variant.binary ? cleanedBoardCanvas : rawBoardCanvas;
        const cellCanvas = preprocessCell(sourceCanvas, sx, sy, sw, sh, variant);
        if (!hasInk(cellCanvas)) {
          if (variant.binary) {
            continue;
          }
        }
        const read = await readDigit(worker, cellCanvas);
        if (read.digit >= 1 && read.digit <= 9 && read.confidence > best.confidence) {
          best = { digit: read.digit, confidence: read.confidence };
        }
        if (read.digit >= 1 && read.digit <= 9) {
          votes.set(read.digit, (votes.get(read.digit) ?? 0) + 1);
        }
      }
      if (votes.size) {
        const voted = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
        if (voted && voted[1] >= 2 && best.confidence < 55) {
          best = { digit: voted[0], confidence: Math.max(best.confidence, 45) };
        }
      }
      if (best.digit >= 1 && best.digit <= 9 && best.confidence >= 24) {
        boardState[row][col] = best;
      }
    }
  }
}

async function autoTranscribeFromImage() {
  if (transcribeBusy) {
    return;
  }
  if (!(imagePreview instanceof HTMLImageElement) || !imagePreview.src) {
    setStatus("Import an image first.", true);
    return;
  }
  if (!window.Tesseract?.createWorker) {
    setStatus("OCR library unavailable. Refresh and try again.", true);
    return;
  }

  const bounds = autoGridModel?.ocr_bounds || normalizedGridBounds();
  if (!bounds) {
    setStatus("Could not determine image bounds. Re-import the image and try again.", true);
    return;
  }

  transcribeBusy = true;
  if (autoTranscribeButton) {
    autoTranscribeButton.disabled = true;
  }
  setStatus("Auto-transcribing puzzle... this may take a bit.");

  const source = document.createElement("canvas");
  source.width = imagePreview.naturalWidth;
  source.height = imagePreview.naturalHeight;
  const srcCtx = source.getContext("2d");
  if (!srcCtx) {
    setStatus("Could not process image.", true);
    transcribeBusy = false;
    if (autoTranscribeButton) {
      autoTranscribeButton.disabled = false;
    }
    return;
  }
  srcCtx.drawImage(imagePreview, 0, 0);

  const scaleX = source.width / Math.max(1, imageOverlay?.width || imagePreview.clientWidth || 1);
  const scaleY = source.height / Math.max(1, imageOverlay?.height || imagePreview.clientHeight || 1);
  const x1 = Math.round(bounds.x1 * scaleX);
  const y1 = Math.round(bounds.y1 * scaleY);
  const x2 = Math.round(bounds.x2 * scaleX);
  const y2 = Math.round(bounds.y2 * scaleY);
  const regionW = Math.max(9, x2 - x1);
  const regionH = Math.max(9, y2 - y1);
  const worker = await window.Tesseract.createWorker("eng", 1, {
    logger: () => {},
  });

  let filled = 0;
  try {
    const boardCanvas = extractBoardRegion(source, x1, y1, regionW, regionH);
    const cleanedBoard = removeGridLines(boardCanvas);
    const boardState = await boardWidePass(worker, cleanedBoard);
    await cellFallbackPass(worker, boardCanvas, cleanedBoard, boardState);
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const digit = boardState[row][col].digit;
        puzzleInputs[row * 9 + col].value = digit >= 1 && digit <= 9 ? String(digit) : "";
        if (digit >= 1 && digit <= 9) {
          filled += 1;
        }
      }
    }
    if (filled < 18) {
      setStatus(`Auto-transcribe complete but low confidence (${filled} cells). You can use Image entry mode for fast manual fill.`, true);
    } else {
      setStatus(`Auto-transcribe complete. Filled ${filled} cells. Please review and correct any mistakes.`);
    }
  } catch (error) {
    setStatus("Auto-transcribe failed. You can still fill manually.", true);
  } finally {
    await worker.terminate();
    transcribeBusy = false;
    if (autoTranscribeButton) {
      autoTranscribeButton.disabled = false;
    }
  }
}

async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) {
    setStatus("Clipboard image paste is unavailable in this browser. Use Upload image.", true);
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) {
        continue;
      }
      const blob = await item.getType(imageType);
      setImportedImage(blob);
      return;
    }
    setStatus("No image found in clipboard.", true);
  } catch (error) {
    setStatus("Could not read clipboard image. Press Ctrl+V or use Upload image.", true);
  }
}

async function importImageFromPasteEvent(event) {
  const items = event.clipboardData?.items ? Array.from(event.clipboardData.items) : [];
  for (const item of items) {
    if (!item.type.startsWith("image/")) {
      continue;
    }
    const blob = item.getAsFile();
    if (blob) {
      event.preventDefault();
      setImportedImage(blob);
      return true;
    }
  }
  return false;
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

if (pasteImageButton) {
  pasteImageButton.addEventListener("click", pasteImageFromClipboard);
}

if (uploadImageButton && imageInput) {
  uploadImageButton.addEventListener("click", () => {
    imageInput.click();
  });
  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (file) {
      setImportedImage(file);
    }
    imageInput.value = "";
  });
}

if (clearImageButton) {
  clearImageButton.addEventListener("click", () => {
    clearImportedImage();
    setStatus("Imported image cleared.");
  });
}

if (autoTranscribeButton) {
  autoTranscribeButton.addEventListener("click", () => {
    autoTranscribeFromImage().catch(() => {
      setStatus("Auto-transcribe failed. You can still fill manually.", true);
    });
  });
}

if (imageEntryButton) {
  imageEntryButton.addEventListener("click", () => {
    if (!imagePreview?.src) {
      setStatus("Import an image first.", true);
      return;
    }
    imageEntryMode = !imageEntryMode;
    if (!imageEntryMode) {
      imageEntryCell = null;
    } else if (!imageEntryCell) {
      selectImageEntryCell(0, 0);
    }
    updateImageEntryButton();
    drawGridOverlay();
    setStatus(imageEntryMode
      ? "Image entry mode on. Click a cell in the image and type digits."
      : "Image entry mode off.");
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
updateImageEntryButton();
if (imagePreview) {
  imagePreview.addEventListener("load", () => {
    syncOverlaySize();
    autoGridModel = detectAutoGridModel();
    drawGridOverlay();
  });
}

document.addEventListener("paste", (event) => {
  importImageFromPasteEvent(event).catch(() => {
    // ignore
  });
});

if (imagePreviewWrap) {
  imagePreviewWrap.addEventListener("click", (event) => {
    if (imageEntryMode) {
      const point = clickToOverlayPoint(event);
      const cell = imagePointToCell(point);
      if (cell) {
        selectImageEntryCell(cell.row, cell.column);
        setStatus(`Image cell selected: row ${cell.row + 1}, column ${cell.column + 1}.`);
      }
    }
  });
}

window.addEventListener("resize", () => {
  syncOverlaySize();
  autoGridModel = detectAutoGridModel();
  drawGridOverlay();
});

document.addEventListener("keydown", (event) => {
  if (!imageEntryMode || !imageEntryCell) {
    return;
  }
  const isDigit = /^[1-9]$/.test(event.key);
  if (isDigit) {
    event.preventDefault();
    applyImageEntryDigit(Number(event.key));
    moveImageEntryCell(0, 1);
    return;
  }
  if (event.key === "0" || event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    applyImageEntryDigit(0);
    if (event.key === "Backspace") {
      moveImageEntryCell(0, -1);
    }
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveImageEntryCell(0, -1);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveImageEntryCell(0, 1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveImageEntryCell(-1, 0);
    return;
  }
  if (event.key === "ArrowDown" || event.key === "Enter") {
    event.preventDefault();
    moveImageEntryCell(1, 0);
  }
});

window.addEventListener("beforeunload", () => {
  clearImportedImage();
});
