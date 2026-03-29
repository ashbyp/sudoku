export function systemTheme() {
  if (typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storedTheme(storageKey) {
  try {
    const value = window.localStorage?.getItem(storageKey);
    if (["light", "dark", "shock"].includes(value)) {
      return value;
    }
  } catch (error) {
    // Ignore storage issues (private mode, blocked, etc).
  }
  return null;
}

export function setStoredTheme(storageKey, theme) {
  try {
    window.localStorage?.setItem(storageKey, theme);
  } catch (error) {
    // Ignore storage issues.
  }
}

export function storedEmail(storageKey) {
  try {
    return window.localStorage?.getItem(storageKey) || "";
  } catch (error) {
    return "";
  }
}

export function setStoredEmail(storageKey, value) {
  try {
    window.localStorage?.setItem(storageKey, value);
  } catch (error) {
    // Ignore storage issues.
  }
}

export function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
