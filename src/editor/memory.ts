// Where the caret and the scroll were in each file, so a note opens where it was left (like the
// "Remember cursor position" plugin for Obsidian; own code). Kept per device in localStorage: a
// convenience, so failures are ignored.

const KEY = "studium.cursor";
const MAX = 400;

export interface Spot {
  anchor: number;
  head: number;
  top: number;
}

function readAll(): Record<string, Spot & { at: number }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function recallSpot(path: string): Spot | null {
  return readAll()[path] ?? null;
}

export function keepSpot(path: string, spot: Spot) {
  try {
    const all = readAll();
    all[path] = { ...spot, at: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > MAX) {
      // Forget the oldest ones.
      for (const k of keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX)) delete all[k];
    }
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not remembered.
  }
}

// ---- Recently opened files (the quick switcher lists them first) ----

const RECENT = "studium.recent";

export function recentFiles(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markOpened(path: string) {
  try {
    const list = [path, ...recentFiles().filter(p => p !== path)].slice(0, 50);
    localStorage.setItem(RECENT, JSON.stringify(list));
  } catch {
    // Not remembered.
  }
}
