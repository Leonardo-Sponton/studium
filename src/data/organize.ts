import type { Notes } from "./notes";
import { walkFiles } from "./files";
import { descendantsOf, isSchool, linkTargets, loadGroups, saveGroups, type Subject } from "./study";

// Organizing personal study from the tree (ui/study/SubjectTree): rename, move, duplicate and
// pin notes and subjects. Groups and subjects are the folders of the tree; their place is a
// header field (`group`, `parent`), so moving a subject never moves files. A note moved to
// another subject is the one file that changes folder.
// [[Links]] point at titles: a rename rewrites the links to the old title in every study file,
// unless another note, material or subject still has that title (the links then stay its own).

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** A body with its title ("# " heading on the first line) changed, or one added on top. */
export function retitle(body: string, title: string): string {
  const head = `# ${title.trim()}`;
  const m = /^\s*#[ \t]+.*?[ \t]*(?:\r?\n|$)/.exec(body);
  if (m) return head + (m[0].endsWith("\n") ? "\n" : "") + body.slice(m[0].length);
  return body.trim() ? `${head}\n\n${body}` : `${head}\n\n`;
}

/** The text with every [[from]] (also [[from|shown]], [[from#part]], ![[from]]) pointing at `to`; code is left alone. */
export function relinkText(body: string, from: string, to: string): string {
  const key = fold(from);
  let fence = false;
  return body
    .split("\n")
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        return line;
      }
      if (fence) return line;
      // Inline `code` keeps its text: only the parts between code spans are rewritten.
      return line
        .split(/(`[^`]*`)/)
        .map((part, i) =>
          i % 2
            ? part
            : part.replace(/\[\[([^\[\]\n|#]+)([#|][^\[\]\n]*)?\]\]/g, (all, name: string, rest = "") =>
                fold(name) === key ? `[[${to}${rest}]]` : all,
              ),
        )
        .join("");
    })
    .join("\n");
}

/**
 * Rewrites [[from]] to [[to]] in every Markdown file under study/. Not done when something else
 * keeps the old title (`except` = the renamed item's path). Returns how many files changed.
 */
export async function relinkAll(notes: Notes, subjects: Subject[], from: string, to: string, except: string): Promise<number> {
  if (!fold(from) || fold(from) === fold(to)) return 0;
  if (linkTargets(subjects).some(x => x.path !== except && fold(x.title) === fold(from))) return 0;
  let changed = 0;
  for (const path of await walkFiles(notes.storage, "study")) {
    if (!path.endsWith(".md")) continue;
    try {
      const n = await notes.load(path);
      if (!n.body.includes("[[")) continue;
      const body = relinkText(n.body, from, to);
      if (body === n.body) continue;
      await notes.save(n, n.data, body, { touch: false });
      changed++;
    } catch {
      // An unreadable file keeps its links; the rest still change.
    }
  }
  return changed;
}

/** Renames a study note (its "# " title). */
export async function renameNote(notes: Notes, path: string, title: string): Promise<void> {
  const n = await notes.load(path);
  await notes.save(n, n.data, retitle(n.body, title));
}

/** Renames a subject or a material (the `title` in its header). */
export const renameTitled = (notes: Notes, path: string, title: string) => notes.patchHeader(path, { title: title.trim() });

/**
 * Moves a note into another subject's notes/. What only made sense in the old subject (the
 * material, chapter or PDF it was about) is dropped. Returns the new path.
 */
export async function moveNote(notes: Notes, path: string, toSubjectDir: string): Promise<string> {
  const from = path.split("/").slice(0, 2).join("/");
  if (from === toSubjectDir) return path;
  const name = path.slice(path.lastIndexOf("/") + 1, -3);
  const to = await notes.freePath(`${toSubjectDir}/notes`, name);
  await notes.storage.move(path, to);
  const d = (await notes.load(to)).data;
  if (d.material !== undefined || d.chapter !== undefined || d.pdf !== undefined)
    await notes.patchHeader(to, { material: undefined, chapter: undefined, pdf: undefined });
  return to;
}

/** A copy of a note beside it, "Title (copy)", with no flashcard progress. Returns its path. */
export async function duplicateNote(notes: Notes, path: string, copyTitle: (title: string) => string): Promise<string> {
  const n = await notes.load(path);
  const dir = path.slice(0, path.lastIndexOf("/"));
  const to = await notes.freePath(dir, `${path.slice(path.lastIndexOf("/") + 1, -3)}-copy`);
  const title = /^\s*#[ \t]+(.*?)[ \t]*(?:\r?\n|$)/.exec(n.body)?.[1] ?? "";
  const { cards: _cards, created: _c, modified: _m, ...data } = n.data;
  await notes.create(to, { ...data, type: data.type ?? "study-note" }, title ? retitle(n.body, copyTitle(title)) : n.body);
  return to;
}

/** Where a personal subject sits in the tree: inside a group (top level) or inside another subject. */
export type Place = { group: string } | { parent: string };

/** Places a personal subject may move to: any group, or any subject not inside it (no loops). */
export function placesFor(subjects: Subject[], s: Subject | null): Subject[] {
  const below = s ? descendantsOf(subjects, s.slug) : new Set<string>();
  return subjects.filter(x => !isSchool(x) && !below.has(x.slug));
}

/** Moves a personal subject (with everything under it) to a group or under another subject. */
export async function moveSubject(notes: Notes, subjects: Subject[], s: Subject, to: Place): Promise<void> {
  if ("parent" in to) {
    if (descendantsOf(subjects, s.slug).has(to.parent)) throw new Error("loop");
    await notes.patchHeader(s.path, { parent: to.parent, group: undefined });
  } else await notes.patchHeader(s.path, { parent: undefined, group: to.group.trim() || undefined });
}

/** A new empty group (a top-level folder), kept in study/_groups.md. */
export async function addGroup(notes: Notes, name: string): Promise<void> {
  const saved = await loadGroups(notes);
  if (!saved.includes(name.trim())) await saveGroups(notes, [...saved, name.trim()]);
}

// ---- Pinned (favorites) ----
// study/_pinned.md keeps the pinned paths in its header, so they travel with the data folder.

export const PINS_PATH = "study/_pinned.md";

export async function loadPins(notes: Notes): Promise<string[]> {
  if (!(await notes.exists(PINS_PATH))) return [];
  const v = (await notes.load(PINS_PATH)).data.pinned;
  return Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : [];
}

export async function savePins(notes: Notes, pins: string[]): Promise<void> {
  const list = [...new Set(pins)];
  if (await notes.exists(PINS_PATH)) {
    const n = await notes.load(PINS_PATH);
    await notes.save(n, { ...n.data, pinned: list.length ? list : undefined }, n.body, { touch: false });
  } else if (list.length) await notes.create(PINS_PATH, { type: "pinned", pinned: list }, "");
}

/** Pins `path`, or unpins it when it already is. Returns whether it is pinned now. */
export async function togglePin(notes: Notes, path: string): Promise<boolean> {
  const pins = await loadPins(notes);
  const on = !pins.includes(path);
  await savePins(notes, on ? [...pins, path] : pins.filter(p => p !== path));
  return on;
}

/** A pin follows a file that moved. */
export async function movePin(notes: Notes, from: string, to: string): Promise<void> {
  const pins = await loadPins(notes);
  if (pins.includes(from)) await savePins(notes, pins.map(p => (p === from ? to : p)));
}
