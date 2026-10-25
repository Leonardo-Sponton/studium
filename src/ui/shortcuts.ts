// Every keyboard shortcut of the app's screens, in one place: the Shell listens for them, the
// command palette and the menus show them, and the shortcuts list (F1) reads this table. The
// editor's own keys (bold, link, find…) live in editor/keys.ts and are listed in the Markdown guide.
// "Mod" is Ctrl on Linux, Windows and Android keyboards, ⌘ on a Mac.

export type ShortcutId =
  | "palette"
  | "open"
  | "search"
  | "newNote"
  | "newSubject"
  | "back"
  | "forward"
  | "explorer"
  | "rename"
  | "help"
  | "goToday"
  | "goPersonal"
  | "goSchool";

/** The keys of each shortcut ("Mod+Shift+N"). The first is the one shown. */
export const SHORTCUTS: Record<ShortcutId, string[]> = {
  palette: ["Mod+P"],
  open: ["Mod+O"],
  search: ["Mod+Shift+F"],
  newNote: ["Mod+N"],
  newSubject: ["Mod+Shift+N"],
  back: ["Mod+Alt+ArrowLeft", "BrowserBack"],
  forward: ["Mod+Alt+ArrowRight", "BrowserForward"],
  explorer: ["Mod+Shift+E"],
  rename: ["F2"],
  help: ["F1"],
  goToday: ["Mod+1"],
  goPersonal: ["Mod+2"],
  goSchool: ["Mod+3"],
};

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Whether a key event is this combo ("Mod+Shift+N"); letters and digits by their key, so any layout works. */
export function matches(e: KeyLike, combo: string, mac = isMac): boolean {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const want = { mod: parts.includes("Mod"), alt: parts.includes("Alt"), shift: parts.includes("Shift") };
  const mod = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  if (mod !== want.mod || other || e.altKey !== want.alt || e.shiftKey !== want.shift) return false;
  // Digits by their physical key: Shift or a layout may change e.key.
  if (/^\d$/.test(key)) return e.code === `Digit${key}` || e.key === key;
  return e.key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
}

/** The shortcut a key event asks for, or null. */
export function shortcutOf(e: KeyLike, mac = isMac): ShortcutId | null {
  for (const [id, combos] of Object.entries(SHORTCUTS) as [ShortcutId, string[]][]) if (combos.some(c => matches(e, c, mac))) return id;
  return null;
}

const NAMES: Record<string, [pc: string, mac: string]> = {
  Mod: ["Ctrl", "⌘"],
  Alt: ["Alt", "⌥"],
  Shift: ["Shift", "⇧"],
  ArrowLeft: ["←", "←"],
  ArrowRight: ["→", "→"],
  ArrowUp: ["↑", "↑"],
  ArrowDown: ["↓", "↓"],
  Enter: ["Enter", "↩"],
  Escape: ["Esc", "Esc"],
  Delete: ["Delete", "⌦"],
};

/** How a combo is written for people: "Ctrl+Shift+N" (⌘⇧N on a Mac). */
export function keyLabel(combo: string, mac = isMac): string {
  const parts = combo.split("+").map(p => NAMES[p]?.[mac ? 1 : 0] ?? (p.length === 1 ? p.toUpperCase() : p));
  return parts.join(mac ? "" : "+");
}

/** The label of a shortcut's first combo. */
export const shortcutLabel = (id: ShortcutId, mac = isMac) => keyLabel(SHORTCUTS[id][0], mac);

/** True while typing in a field or the editor: single keys (F2, Delete) are not taken then. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest("input, textarea, select, [contenteditable='true'], .cm-content");
}
