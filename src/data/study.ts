import type { FileInfo } from "../storage/types";
import { parseCards, statesOf, isDue, writeState, type Card, type CardState } from "./cards";
import { isoDate, slugify, stamp } from "./dates";
import { parse, titleOf, type Data } from "./frontmatter";
import type { Note, Notes } from "./notes";
import { readReview, reviewPoints, type ReviewPoint } from "./recall";
import { addFile, CLASS_RESULTS, loadAssignments, num, slotsOf, toExam, type Assignment, type ClassResult, type Exam, type Slot } from "./school";

// Study: one folder per subject (JDBC, Docker, a school course…), study/<slug>/:
//   subject.md            the subject: title, group, parent subject (the tree), exam date in the
//                         header; the body is "in my own words", the subject explained as if
//                         teaching it (Feynman). `notebook_at` keeps the notebook chapter
//                         opened last (data/notebook). `kind: hub` = a subject that only gathers
//                         others (its page is an index of them); `kind: study` = a study folder
//                         (notebook, notes, materials…); no kind = guessed (ui/study/SubjectPage isHub).
//                         The kind is set once (when made, or once for an older subject) and
//                         then never changes. A school subject also has course, semester and
//                         class fields (data/school); its body is the syllabus.
//   materials/<name>.md   what is studied from: a handout an AI wrote, a book, a course. The whole
//                         text lives in the body; its headings are the chapters, and the header
//                         keeps which chapters are read (`done`) and where reading stopped (`at`)
//   notes/<stamp>.md      study notes ("# Title"), optionally about one chapter of a material;
//                         flashcards inside them (data/cards) keep their review state in the header,
//                         and so does the whole-note review, `review:` (data/recall). A title that
//                         starts with a number ("08. Transações") makes it a chapter of the
//                         subject's notebook (data/notebook).
//                         `kind: class` (with `date`) = notes of one class; `kind: cards` = a note
//                         holding only flashcards (added by hand or made by the AI from a material)
//   links.md              links to read or watch (videos, docs, articles): one Markdown list item
//                         per link, "- [Title](https://…) #video — note" (the #kind is optional)
//   pdfs/<name>.pdf       PDFs studied from (opened in the device's PDF app); a study note about
//                         one keeps its file name in `pdf:`
//   workbench/<slug>/     a project for studying the subject in depth: project.md (title, short
//                         description, status, draw.io and GitHub links in the header; the body is
//                         the project notes), links.md like the subject's, files/ (anything added)
//   exercises/            exercises to practise with: lists written or imported as .md ("# Title"),
//                         PDFs (opened in the device's PDF app) and a links.md like the subject's
//   assignments/, exams/  school subjects only (data/school)
//   cover.jpg             the subject's own cover picture (any picture extension), optional
// study/_groups.md keeps the personal groups (their order, and groups with no subject yet);
// study/_covers/ their cover pictures.
// Notes link to each other with [[Title]] (a note, a material or a subject, by title).

/** Title and the rest of a note: its "# " heading, or else its first line. */
function itemParts(body: string): { title: string; rest: string } {
  const m = /^\s*#[ \t]+(.*?)[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)?/.exec(body);
  if (m) return { title: m[1].replace(/[ \t]+#+$/, ""), rest: body.slice(m[0].length) };
  const lines = body.replace(/^\s*\n/, "").split("\n");
  const title = (lines.shift() ?? "").trim();
  return { title, rest: lines.join("\n").replace(/^\s*\n/, "") };
}

export type MaterialKind = "handout" | "book" | "course" | "video" | "article" | "other";
export const MATERIAL_KINDS: MaterialKind[] = ["handout", "book", "course", "video", "article", "other"];

export const SUBJECT_FILE = "subject.md";
export const PROJECT_FILE = "project.md";
export const LINKS_FILE = "links.md";
export const GROUPS_PATH = "study/_groups.md";

export const EXERCISES_DIR = "exercises";

/** What a link leads to; each kind has its own color (LINK_KIND_COLORS). */
export const LINK_KINDS = ["article", "blog", "video", "lecture", "tutorial", "course", "docs", "podcast", "other"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
/** Tag colors of the link kinds: fixed hues, mid tones, so they read the same on every theme. */
export const LINK_KIND_COLORS: Record<LinkKind, string> = {
  article: "#4c9be8",
  blog: "#a371f7",
  video: "#e5534b",
  lecture: "#f0883e",
  tutorial: "#3fb68b",
  course: "#d4a72c",
  docs: "#2fb5c4",
  podcast: "#db61a2",
  other: "#8b949e",
};

export interface StudyLink {
  title: string;
  url: string;
  note: string;
  /** "" = not said. */
  kind: LinkKind | "";
}

/** An exercise list kept as Markdown in exercises/. */
export interface ExerciseDoc {
  path: string;
  title: string;
  preview: string;
  modified: string;
}

export interface Exercises {
  docs: ExerciseDoc[];
  pdfs: StudyPdf[];
  links: StudyLink[];
}

export interface Chapter {
  /** 0 = the text before the first chapter heading; 1, 2… = the headings in order. */
  n: number;
  title: string;
  /** Start and end (exclusive) in the body. */
  from: number;
  to: number;
}

export interface Material {
  path: string;
  /** File name without .md: what a study note points to in `material:`. */
  name: string;
  title: string;
  kind: MaterialKind;
  source: string;
  url: string;
  chapters: Chapter[];
  done: number[];
  /** The chapter where reading stopped, or null. */
  at: number | null;
  modified: string;
}

export type StudyNoteKind = "note" | "class" | "cards";

export interface StudyPdf {
  path: string;
  /** File name, with .pdf: what a study note points to in `pdf:`. */
  name: string;
  title: string;
  size: number;
  modified: number;
}

export const WORKBENCH_STATUSES = ["planning", "active", "paused", "done"] as const;
export type WorkbenchStatus = (typeof WORKBENCH_STATUSES)[number];
/** Longest project description, in characters. */
export const DESCRIPTION_MAX = 350;

export interface WorkbenchProject {
  path: string;
  dir: string;
  title: string;
  description: string;
  status: WorkbenchStatus;
  /** Link to the model on draw.io (diagrams.net). */
  drawio: string;
  github: string;
  /** Where it runs (a deploy, a demo video…). */
  demo: string;
  started: string;
  finished: string;
  links: StudyLink[];
  /** Names of the files in files/. */
  files: string[];
  /** The project notes are not empty. */
  hasNotes: boolean;
  modified: string;
}

export interface StudyNote {
  path: string;
  kind: StudyNoteKind;
  /** Day of the class (kind class), yyyy-mm-dd. */
  date: string;
  title: string;
  preview: string;
  material: string;
  chapter: number | null;
  /** File name of the PDF this note is about (pdfs/<name>). */
  pdf: string;
  cards: Card[];
  states: Map<string, CardState>;
  /** Names this note links to with [[…]]. */
  links: string[];
  /** Notebook chapter number, from the title ("08. Transações" → 8; data/notebook), or null. */
  order: number | null;
  /** Nothing written under the title yet: a topic still to study. */
  empty: boolean;
  /** Marked as finished (`finished: true`), for a notebook chapter: nothing left to write. */
  finished: boolean;
  /** Length of the text, in characters. */
  chars: number;
  /** Whole-note review (data/recall), when it was ever reviewed. */
  review?: CardState;
  /** Callouts kept as things to look at again (data/recall). */
  points: ReviewPoint[];
  /** Title and body folded (no accents, lowercase), for the notes filter. */
  folded: string;
  created: string;
  modified: string;
}

/** What a personal subject is: a hub that gathers others, a study folder, or "" (not chosen: guessed). */
export type SubjectKind = "hub" | "study" | "";

export interface Subject {
  path: string;
  dir: string;
  /** Folder name: what a child subject points to in `parent:`. */
  slug: string;
  title: string;
  kind: SubjectKind;
  /** The subject's own cover picture (`<dir>/cover.jpg`), or "". */
  cover: string;
  /** How the cover is framed (`cover_frame: "x y zoom"`), or "" for centered. */
  coverFrame: string;
  group: string;
  parent: string;
  exam: string;
  /** School: the course id (data/school) or "" for a personal subject. */
  course: string;
  semester: number | null;
  teacher: string;
  room: string;
  hoursWeek: number | null;
  /** Total class hours of the term, when known. */
  hoursTotal: number | null;
  schedule: Slot[];
  result: ClassResult;
  /** Hours of class missed. */
  absences: number;
  assignments: Assignment[];
  exams: Exam[];
  /** The "in my own words" text is not empty. */
  hasSummary: boolean;
  /** File name of the notebook chapter where reading stopped (data/notebook), or "". */
  notebookAt: string;
  /** When the subject's header last changed: when `notebookAt` was set, near enough. */
  notebookWhen: string;
  materials: Material[];
  notes: StudyNote[];
  links: StudyLink[];
  pdfs: StudyPdf[];
  exercises: Exercises;
  workbench: WorkbenchProject[];
  modified: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const pick = <T extends string>(v: unknown, list: T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const nums = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b) : [];
function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(str(v), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export const subjectDirOf = (path: string) => path.split("/").slice(0, 2).join("/");
export const isSubjectPath = (p: string) => /^study\/[^/]+\/subject\.md$/.test(p);
export const isMaterialPath = (p: string) => /^study\/[^/]+\/materials\/[^/]+\.md$/.test(p);
export const isStudyNotePath = (p: string) => /^study\/[^/]+\/notes\/[^/]+\.md$/.test(p);
export const isLinksPath = (p: string) => /^study\/[^/]+\/links\.md$/.test(p);
export const isPdfPath = (p: string) => /^study\/[^/]+\/pdfs\/[^/]+\.pdf$/i.test(p);
export const isExercisePath = (p: string) => /^study\/[^/]+\/exercises\//.test(p);
export const isWorkbenchPath = (p: string) => /^study\/[^/]+\/workbench\/[^/]+\//.test(p);
/** project.md of the workbench project a path is in. */
export const workbenchProjectOf = (p: string) => `${p.split("/").slice(0, 4).join("/")}/${PROJECT_FILE}`;

// ---- Links ----

const LINK_ITEM = /^\s*[-*+]\s+(?:\[((?:\\.|[^\]\\])*)\]\(<?([^)\s>]+)>?\)|<?(https?:\/\/[^\s>]+)>?)(?:\s+#([a-z]+))?\s*(?:[—–-]\s*(.*))?$/;

const linkKind = (v: string | undefined): LinkKind | "" => ((LINK_KINDS as readonly string[]).includes(v ?? "") ? (v as LinkKind) : "");

/** The links of a links.md body: list items "- [Title](url) #kind — note" or "- https://…"; anything else is ignored. */
export function parseLinks(body: string): StudyLink[] {
  const out: StudyLink[] = [];
  for (const l of body.split("\n")) {
    const m = LINK_ITEM.exec(l);
    if (m)
      out.push({ title: (m[1] ?? "").replace(/\\([[\]])/g, "$1").trim(), url: m[2] ?? m[3], kind: linkKind(m[4]), note: (m[5] ?? "").trim() });
  }
  return out;
}

/** A first guess of a link's kind from its address (the user can change it). */
export function guessLinkKind(url: string): LinkKind | "" {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
  const on = (...names: string[]) => names.some(x => host === x || host.endsWith(`.${x}`));
  if (on("youtube.com", "youtu.be", "vimeo.com", "twitch.tv")) return "video";
  if (on("udemy.com", "coursera.org", "alura.com.br", "edx.org", "khanacademy.org", "dio.me", "rocketseat.com.br", "freecodecamp.org")) return "course";
  if (on("medium.com", "dev.to", "substack.com", "hashnode.dev", "blogspot.com", "wordpress.com")) return "blog";
  if (on("spotify.com", "podcasts.apple.com", "anchor.fm")) return "podcast";
  if (/^(docs|developer|devdocs|learn)\./.test(host) || on("developer.mozilla.org", "readthedocs.io", "docs.oracle.com")) return "docs";
  return "";
}

export function linksBody(list: StudyLink[]): string {
  const item = (l: StudyLink) =>
    `- [${(l.title || l.url).replace(/([[\]])/g, "\\$1")}](${l.url})${l.kind ? ` #${l.kind}` : ""}${l.note ? ` — ${l.note.replace(/\n/g, " ")}` : ""}`;
  return list.length ? `${list.map(item).join("\n")}\n` : "";
}

/** Writes a subject's links (links.md, made on the first link). */
export async function saveLinks(notes: Notes, subjectDir: string, list: StudyLink[]): Promise<void> {
  const path = `${subjectDir}/${LINKS_FILE}`;
  if (await notes.exists(path)) {
    const n = await notes.load(path);
    await notes.save(n, n.data, linksBody(list));
  } else await notes.create(path, { type: "links" }, linksBody(list));
}

// ---- PDFs ----

export async function loadPdfs(notes: Notes, subjectDir: string, folder = "pdfs"): Promise<StudyPdf[]> {
  const dir = `${subjectDir}/${folder}`;
  return (await notes.storage.list(dir))
    .filter(f => !f.isDir && /\.pdf$/i.test(f.name) && !f.name.includes(".tmp-"))
    .map(f => ({ path: `${dir}/${f.name}`, name: f.name, title: f.name.replace(/\.pdf$/i, ""), size: f.size, modified: f.mtime }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

/** Copies a picked PDF into the subject (renamed when the name is taken). Returns its file name. */
export const addPdf = (notes: Notes, subjectDir: string, name: string, data: Uint8Array) =>
  addFile(notes.storage, `${subjectDir}/pdfs`, /\.pdf$/i.test(name) ? name : `${name}.pdf`, data);

// ---- Exercises ----

const toExerciseDoc = (n: Note): ExerciseDoc => {
  const { title, rest } = itemParts(n.body);
  const preview = rest
    .split("\n")
    .map(l => l.replace(/^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, "").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 140);
  return { path: n.path, title: str(n.data.title) || title || n.path.slice(n.path.lastIndexOf("/") + 1, -3), preview, modified: str(n.data.modified ?? n.data.created) };
};

export async function loadExercises(notes: Notes, subjectDir: string, onError?: (p: string) => void): Promise<Exercises> {
  const dir = `${subjectDir}/${EXERCISES_DIR}`;
  const docs = (await loadAll(notes, dir, toExerciseDoc, onError, LINKS_FILE)).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const linksInfo = await notes.storage.stat(`${dir}/${LINKS_FILE}`);
  const links = linksInfo ? await loadCached(notes, `${dir}/${LINKS_FILE}`, linksInfo, x => parseLinks(x.body)).catch(() => []) : [];
  return { docs, pdfs: await loadPdfs(notes, subjectDir, EXERCISES_DIR), links };
}

/** A new exercise list ("# Title"), in exercises/. */
export async function createExercise(notes: Notes, subjectDir: string, title: string, at = new Date()): Promise<Note> {
  const dir = `${subjectDir}/${EXERCISES_DIR}`;
  return notes.create(await notes.freePath(dir, slugify(title) || stamp(at)), { type: "exercise" }, `# ${title.trim()}\n\n`);
}

/**
 * Copies a picked .md or .pdf into exercises/ (renamed when the name is taken). A .md keeps
 * `title` in its header, shown instead of its first heading. Returns its file name.
 */
export async function addExerciseFile(notes: Notes, subjectDir: string, name: string, data: Uint8Array, title?: string): Promise<string> {
  const dir = `${subjectDir}/${EXERCISES_DIR}`;
  const added = await addFile(notes.storage, dir, name, data);
  if (title?.trim() && /\.(md|markdown)$/i.test(added)) await notes.patchHeader(`${dir}/${added}`, { title: title.trim() });
  return added;
}

// ---- Workbench ----

const toProject = (n: Note, dir: string, links: StudyLink[], files: string[]): WorkbenchProject => {
  const d = n.data;
  return {
    path: n.path,
    dir,
    title: str(d.title) || dir.slice(dir.lastIndexOf("/") + 1),
    description: str(d.description),
    status: pick(d.status, [...WORKBENCH_STATUSES], "planning"),
    drawio: str(d.drawio),
    github: str(d.github),
    demo: str(d.demo),
    started: str(d.started).slice(0, 10),
    finished: str(d.finished).slice(0, 10),
    links,
    files,
    hasNotes: n.body.trim() !== "",
    modified: str(d.modified ?? d.created),
  };
};

/** The workbench projects of a subject: active first, then planning, paused and done; last changed first. */
export async function loadWorkbench(notes: Notes, subjectDir: string, onError?: (p: string) => void): Promise<WorkbenchProject[]> {
  const out: WorkbenchProject[] = [];
  const base = `${subjectDir}/workbench`;
  for (const f of await notes.storage.list(base)) {
    if (!f.isDir) continue;
    const dir = `${base}/${f.name}`;
    const path = `${dir}/${PROJECT_FILE}`;
    try {
      const info = await notes.storage.stat(path);
      if (!info) continue;
      const linksInfo = await notes.storage.stat(`${dir}/${LINKS_FILE}`);
      const links = linksInfo ? await loadCached(notes, `${dir}/${LINKS_FILE}`, linksInfo, x => parseLinks(x.body)).catch(() => []) : [];
      const files = (await notes.storage.list(`${dir}/files`))
        .filter(e => !e.isDir && !e.name.includes(".tmp-"))
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b));
      const n = await notes.load(path);
      out.push(toProject(n, dir, links, files));
    } catch {
      onError?.(path);
    }
  }
  const rank: Record<WorkbenchStatus, number> = { active: 0, planning: 1, paused: 2, done: 3 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.modified.localeCompare(a.modified));
}

/** A new workbench project; the notes start with a few headings to fill in (in the app language). */
export async function createProject(
  notes: Notes,
  subjectDir: string,
  fields: { title: string; description?: string },
  body = "",
  today = isoDate(),
): Promise<Note> {
  const dir = await notes.freePath(`${subjectDir}/workbench`, slugify(fields.title), "");
  const data: Data = {
    type: "workbench",
    title: fields.title.trim(),
    description: fields.description?.trim().slice(0, DESCRIPTION_MAX) || undefined,
    status: "planning",
    started: today,
  };
  return notes.create(`${dir}/${PROJECT_FILE}`, data, body);
}

/** Header change for a new status: `finished` is set when done and cleared when reopened. */
export function statusPatch(status: WorkbenchStatus, today = isoDate()): Data {
  return { status, finished: status === "done" ? today : undefined };
}

/** Copies a picked file into a project's files/ folder. Returns its file name. */
export const addProjectFile = (notes: Notes, projectDir: string, name: string, data: Uint8Array) =>
  addFile(notes.storage, `${projectDir}/files`, name, data);

// ---- Groups (personal) ----

/** The saved group order (study/_groups.md); groups only used by subjects come after it. */
export async function loadGroups(notes: Notes): Promise<string[]> {
  if (!(await notes.exists(GROUPS_PATH))) return [];
  const d = (await notes.load(GROUPS_PATH)).data.groups;
  return Array.isArray(d) ? [...new Set(d.map(x => str(x).trim()).filter(Boolean))] : [];
}

export async function saveGroups(notes: Notes, groups: string[]): Promise<void> {
  const list = [...new Set(groups.map(g => g.trim()).filter(Boolean))];
  if (await notes.exists(GROUPS_PATH)) {
    const n = await notes.load(GROUPS_PATH);
    await notes.save(n, { ...n.data, groups: list }, n.body);
  } else await notes.create(GROUPS_PATH, { type: "groups", groups: list }, "");
}

/** Every personal group: the saved order first, then the others in use, A–Z. */
export function allGroups(saved: string[], subjects: Subject[]): string[] {
  const used = groupsOf(subjects.filter(s => !isSchool(s))).filter(g => !saved.includes(g));
  return [...saved, ...used];
}

/** Renames a group (every subject in it follows). Merges into `to` when that group exists. */
export async function renameGroup(notes: Notes, subjects: Subject[], saved: string[], from: string, to: string): Promise<void> {
  to = to.trim();
  if (!to || to === from) return;
  for (const s of subjects) if (!isSchool(s) && s.group === from) await notes.patchHeader(s.path, { group: to });
  const all = allGroups(saved, subjects);
  await saveGroups(notes, all.includes(to) ? all.filter(g => g !== from) : all.map(g => (g === from ? to : g)));
  // The cover follows, unless the group it merges into has one.
  const covers = await loadCovers(notes.storage);
  const old = covers[slugify(from)];
  if (old && !covers[slugify(to)]) {
    await notes.storage.move(old, `${COVERS_DIR}/${slugify(to)}${old.slice(old.lastIndexOf("."))}`);
    await setGroupCoverFrame(notes, to, frameOf((await loadGroupFrames(notes))[slugify(from)]));
  }
  await setGroupCoverFrame(notes, from, null);
}

/** Removes a group; its subjects stay, with no group. */
export async function deleteGroup(notes: Notes, subjects: Subject[], saved: string[], name: string): Promise<void> {
  for (const s of subjects) if (!isSchool(s) && s.group === name) await notes.patchHeader(s.path, { group: undefined });
  await saveGroups(notes, allGroups(saved, subjects).filter(g => g !== name));
  await removeGroupCover(notes.storage, name);
  await setGroupCoverFrame(notes, name, null);
}

// ---- Group covers (personal) ----
// study/_covers/<group slug>.jpg: the picture on a group's card (Study → cards view).

export const COVERS_DIR = "study/_covers";
const COVER_EXTS = /\.(jpe?g|png|webp|gif|avif)$/i;

/** Cover pictures by group slug. */
export async function loadCovers(storage: Notes["storage"]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of await storage.list(COVERS_DIR))
    if (!f.isDir && COVER_EXTS.test(f.name) && !f.name.includes(".tmp-")) out[f.name.replace(COVER_EXTS, "")] = `${COVERS_DIR}/${f.name}`;
  return out;
}

export const coverOf = (covers: Record<string, string>, group: string) => (group ? covers[slugify(group)] : undefined);

/** Sets a group's cover (`ext` like ".jpg"), replacing the one it had. */
export async function setGroupCover(storage: Notes["storage"], group: string, ext: string, data: Uint8Array): Promise<string> {
  await removeGroupCover(storage, group);
  const path = `${COVERS_DIR}/${slugify(group)}${ext}`;
  await storage.writeBinary(path, data);
  return path;
}

export async function removeGroupCover(storage: Notes["storage"], group: string): Promise<void> {
  const old = coverOf(await loadCovers(storage), group);
  if (old) await storage.remove(old);
}
// ---- Cover framing ----
// What part of a cover shows: the point kept in view (x, y in % of the picture) and the zoom
// (1 = just fills the box). Written "x y zoom": `cover_frame:` in a subject's header, and
// `frames: { <group slug>: "x y zoom" }` in study/_groups.md for group covers.

export interface CoverFrame {
  x: number;
  y: number;
  zoom: number;
}

export const CENTERED: CoverFrame = { x: 50, y: 50, zoom: 1 };
export const ZOOM_MAX = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "x y zoom" as a frame, or null when it isn't one. */
export function frameOf(v: unknown): CoverFrame | null {
  const n = str(v).trim().split(/\s+/).map(Number);
  if (n.length !== 3 || n.some(x => !Number.isFinite(x))) return null;
  return { x: clamp(n[0], 0, 100), y: clamp(n[1], 0, 100), zoom: clamp(n[2], 1, ZOOM_MAX) };
}

/** A frame as "x y zoom" ("" for none or centered). */
export function frameText(f: CoverFrame | null): string {
  if (!f || (f.x === 50 && f.y === 50 && f.zoom === 1)) return "";
  return `${Math.round(f.x * 10) / 10} ${Math.round(f.y * 10) / 10} ${Math.round(f.zoom * 100) / 100}`;
}

export async function setSubjectCoverFrame(notes: Notes, path: string, f: CoverFrame | null): Promise<void> {
  await notes.patchHeader(path, { cover_frame: frameText(f) || undefined });
}

/** Group cover frames ("x y zoom") by group slug. */
export async function loadGroupFrames(notes: Notes): Promise<Record<string, string>> {
  if (!(await notes.exists(GROUPS_PATH))) return {};
  const d = (await notes.load(GROUPS_PATH)).data.frames;
  const out: Record<string, string> = {};
  if (d && typeof d === "object") for (const [k, v] of Object.entries(d)) if (frameText(frameOf(v))) out[k] = frameText(frameOf(v));
  return out;
}

export async function setGroupCoverFrame(notes: Notes, group: string, f: CoverFrame | null): Promise<void> {
  const text = frameText(f);
  const exists = await notes.exists(GROUPS_PATH);
  if (!exists && !text) return;
  const n = exists ? await notes.load(GROUPS_PATH) : null;
  const frames = { ...(await loadGroupFrames(notes)) };
  if (text) frames[slugify(group)] = text;
  else delete frames[slugify(group)];
  const data = { ...(n?.data ?? { type: "groups", groups: [] }), frames: Object.keys(frames).length ? frames : undefined };
  if (n) await notes.save(n, data, n.body);
  else await notes.create(GROUPS_PATH, data, "");
}

// ---- Subject covers ----
// <subject dir>/cover.jpg: a hub's or a study folder's own picture, over its group's.

const subjectCover = async (storage: Notes["storage"], dir: string) => {
  const f = (await storage.list(dir)).find(x => !x.isDir && /^cover\./i.test(x.name) && COVER_EXTS.test(x.name) && !x.name.includes(".tmp-"));
  return f ? `${dir}/${f.name}` : "";
};

/** Sets a subject's cover (`ext` like ".jpg"), replacing the one it had. */
export async function setSubjectCover(storage: Notes["storage"], dir: string, ext: string, data: Uint8Array): Promise<string> {
  await removeSubjectCover(storage, dir);
  const path = `${dir}/cover${ext}`;
  await storage.writeBinary(path, data);
  return path;
}

export async function removeSubjectCover(storage: Notes["storage"], dir: string): Promise<void> {
  const old = await subjectCover(storage, dir);
  if (old) await storage.remove(old);
}

export const materialName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

/**
 * The chapters of a text: the headings of the biggest level used at least twice (so a lone
 * "# Title" on top is not a chapter and "## Chapter 1", "## Chapter 2"… are). Headings inside
 * code blocks are skipped. Text before the first chapter is chapter 0 when it has anything
 * besides a title line. A text with no such headings is one chapter.
 */
export function chaptersOf(body: string): Chapter[] {
  const heads: { level: number; title: string; at: number }[] = [];
  let fence = false;
  let pos = 0;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) {
      const m = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
      if (m) heads.push({ level: m[1].length, title: m[2].trim(), at: pos });
    }
    pos += line.length + 1;
  }
  let level = 0;
  for (let l = 1; l <= 6 && !level; l++) if (heads.filter(h => h.level === l).length >= 2) level = l;
  const tops = heads.filter(h => h.level === level);
  if (!level) return body.trim() ? [{ n: 0, title: titleOf(body), from: 0, to: body.length }] : [];

  const out: Chapter[] = [];
  const intro = body.slice(0, tops[0].at);
  if (intro.replace(/^#[ \t]+.*$/m, "").trim()) out.push({ n: 0, title: titleOf(intro), from: 0, to: tops[0].at });
  tops.forEach((h, i) => out.push({ n: i + 1, title: h.title, from: h.at, to: tops[i + 1]?.at ?? body.length }));
  return out;
}

export function toMaterial(n: Note): Material {
  const d = n.data;
  return {
    path: n.path,
    name: materialName(n.path),
    title: str(d.title) || titleOf(n.body) || materialName(n.path),
    kind: pick(d.kind, MATERIAL_KINDS, "handout"),
    source: str(d.source),
    url: str(d.url),
    chapters: chaptersOf(n.body),
    done: nums(d.done),
    at: int(d.at),
    modified: str(d.modified ?? d.created),
  };
}

export function toStudyNote(n: Note): StudyNote {
  const { title, rest } = itemParts(n.body);
  const preview = rest
    .split("\n")
    .map(l => l.replace(/^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, "").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 140);
  const kind = n.data.kind === "class" || n.data.kind === "cards" ? n.data.kind : "note";
  return {
    path: n.path,
    kind,
    date: str(n.data.date).slice(0, 10),
    title,
    preview,
    material: str(n.data.material),
    chapter: int(n.data.chapter),
    pdf: str(n.data.pdf),
    cards: parseCards(n.body),
    states: statesOf(n.data),
    links: linksIn(n.body),
    order: orderOf(title),
    empty: !rest.trim(),
    finished: n.data.finished === true,
    chars: rest.length,
    review: readReview(n.data.review),
    points: reviewPoints(n.body),
    folded: fold(`${title}\n${n.body}`),
    created: str(n.data.created),
    modified: str(n.data.modified ?? n.data.created),
  };
}

/** The chapter number a title starts with ("08. Transações" → 8), or null (data/notebook). */
export function orderOf(title: string): number | null {
  const m = /^\s*(\d{1,4})\s*[.)\-–—:]\s*\S/.exec(title);
  return m ? Number(m[1]) : null;
}

export const STUDY_NOTE_SORTS = ["chapter", "modified", "newest", "oldest", "title"] as const;
export type StudyNoteSort = (typeof STUDY_NOTE_SORTS)[number];

/** What the notes list of a subject keeps: all, the notebook, the notes on one material or PDF, the free ones, or those with cards. */
export type StudyNoteOnly = "" | "notebook" | "free" | "cards" | `m:${string}` | `p:${string}`;

/** A chapter of the subject's notebook: a plain note whose title starts with a number (data/notebook). */
export const isNotebookNote = (n: StudyNote) => n.kind === "note" && n.order !== null && !n.material && !n.pdf;

/** A note tied to nothing: not on a material or a PDF, not a notebook chapter ("standalone"). */
export const isFreeNote = (n: StudyNote) => !n.material && !n.pdf && !isNotebookNote(n);

/** The notes of a subject that have every word of `query`, kept by `only`, in the chosen order.
 *  "chapter" follows the materials (as listed) and their chapters, then the PDFs, then the notebook in its
 *  numbered order, free notes last, each by creation. */
export function filterStudyNotes(s: Subject, query: string, only: StudyNoteOnly, sort: StudyNoteSort): StudyNote[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const list = s.notes.filter(
    n =>
      (!words.length || words.every(w => n.folded.includes(w))) &&
      (only === "" ||
        (only === "free"
          ? isFreeNote(n)
          : only === "notebook"
            ? isNotebookNote(n)
            : only === "cards"
              ? n.cards.length > 0
              : only.startsWith("p:")
                ? n.pdf === only.slice(2)
                : n.material === only.slice(2))),
  );
  const byCreated = (a: StudyNote, b: StudyNote) => a.created.localeCompare(b.created) || a.path.localeCompare(b.path);
  const at = new Map(s.materials.map((m, i) => [m.name, i]));
  const pdfAt = new Map(s.pdfs.map((p, i) => [p.name, s.materials.length + 1 + i]));
  const free = s.materials.length + s.pdfs.length + 2;
  const place = (n: StudyNote) =>
    n.material ? (at.get(n.material) ?? s.materials.length) : n.pdf ? (pdfAt.get(n.pdf) ?? free - 1) : isNotebookNote(n) ? free - 0.5 : free;
  const cmp: Record<StudyNoteSort, (a: StudyNote, b: StudyNote) => number> = {
    chapter: (a, b) =>
      place(a) - place(b) || (a.chapter ?? 1e9) - (b.chapter ?? 1e9) || (isNotebookNote(a) ? a.order! - b.order! : 0) || byCreated(a, b),
    modified: (a, b) => b.modified.localeCompare(a.modified) || byCreated(a, b),
    newest: (a, b) => byCreated(b, a),
    oldest: byCreated,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }) || byCreated(a, b),
  };
  return list.sort(cmp[sort]);
}

/** Read chapters out of the chapters a material has (a `done` number that no longer exists is not counted). */
export function progress(m: Material): { read: number; total: number } {
  const ids = new Set(m.chapters.map(c => c.n));
  return { read: m.done.filter(n => ids.has(n)).length, total: m.chapters.length };
}

export function subjectProgress(s: Subject): { read: number; total: number } {
  return s.materials.map(progress).reduce((a, b) => ({ read: a.read + b.read, total: a.total + b.total }), { read: 0, total: 0 });
}

export interface DueCard {
  card: Card;
  state?: CardState;
  notePath: string;
  noteTitle: string;
  subject: string;
  subjectTitle: string;
}

/** Cards to review today (new ones included), oldest due first, new ones last in note order. */
export function dueCards(subjects: Subject[], today = isoDate(), only?: string): DueCard[] {
  const out: DueCard[] = [];
  for (const s of subjects) {
    if (only && s.path !== only) continue;
    for (const n of s.notes)
      for (const card of n.cards) {
        const state = n.states.get(card.id);
        if (isDue(state, today)) out.push({ card, state, notePath: n.path, noteTitle: n.title, subject: s.path, subjectTitle: s.title });
      }
  }
  const key = (d: DueCard) => d.state?.due ?? "9999";
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}

export const cardCount = (s: Subject) => s.notes.reduce((n, x) => n + x.cards.length, 0);

/** Where to go on: the last material opened that still has a chapter to read. */
export function continueAt(subjects: Subject[]): { subject: Subject; material: Material; chapter: Chapter } | null {
  let best: { subject: Subject; material: Material; chapter: Chapter } | null = null;
  for (const s of subjects) {
    if (s.course && s.result !== "taking") continue;
    for (const m of s.materials) {
      const ch = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
      if (!ch || progress(m).read === m.chapters.length) continue;
      if (!best || m.modified > best.material.modified) best = { subject: s, material: m, chapter: ch };
    }
  }
  return best;
}

// ---- Loading, with a cache: handouts are big and the app reloads after every save. ----

type Parsed = { mtime: number; size: number; value: unknown };
const caches = new WeakMap<Notes, Map<string, Parsed>>();

async function loadCached<T>(notes: Notes, path: string, info: FileInfo, make: (n: Note) => T): Promise<T> {
  let cache = caches.get(notes);
  if (!cache) caches.set(notes, (cache = new Map()));
  const hit = cache.get(path);
  if (hit && hit.mtime === info.mtime && hit.size === info.size) return hit.value as T;
  const value = make(await notes.load(path));
  cache.set(path, { mtime: info.mtime, size: info.size, value });
  return value;
}

async function loadAll<T>(notes: Notes, dir: string, make: (n: Note) => T, onError?: (p: string) => void, skip?: string): Promise<T[]> {
  const out: T[] = [];
  for (const f of await notes.storage.list(dir)) {
    if (f.isDir || !f.name.endsWith(".md") || f.name === skip) continue;
    try {
      out.push(await loadCached(notes, `${dir}/${f.name}`, f, make));
    } catch {
      onError?.(`${dir}/${f.name}`);
    }
  }
  return out;
}

/** Every subject with its materials and notes, last changed first. */
export async function loadSubjects(notes: Notes, onError?: (path: string) => void): Promise<Subject[]> {
  const out: Subject[] = [];
  for (const f of await notes.storage.list("study")) {
    if (!f.isDir || f.name.startsWith("_")) continue;
    const dir = `study/${f.name}`;
    const path = `${dir}/${SUBJECT_FILE}`;
    let n: Note;
    try {
      if (!(await notes.exists(path))) continue;
      n = await notes.load(path);
    } catch {
      onError?.(path);
      continue;
    }
    const materials = (await loadAll(notes, `${dir}/materials`, toMaterial, onError)).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
    const studyNotes = (await loadAll(notes, `${dir}/notes`, toStudyNote, onError)).sort(
      (a, b) => a.created.localeCompare(b.created) || a.path.localeCompare(b.path),
    );
    const linksInfo = await notes.storage.stat(`${dir}/${LINKS_FILE}`);
    const links = linksInfo ? await loadCached(notes, `${dir}/${LINKS_FILE}`, linksInfo, x => parseLinks(x.body)).catch(() => []) : [];
    const pdfs = await loadPdfs(notes, dir);
    const exercises = await loadExercises(notes, dir, onError);
    const workbench = await loadWorkbench(notes, dir, onError);
    const d = n.data;
    const course = str(d.course);
    const assignments = course ? await loadAssignments(notes.storage, notes, dir, onError) : [];
    const exams = course
      ? (await loadAll(notes, `${dir}/exams`, toExam, onError)).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
      : [];
    const modified = [
      str(d.modified ?? d.created),
      ...materials.map(m => m.modified),
      ...studyNotes.map(x => x.modified),
      ...workbench.map(x => x.modified),
      ...exercises.docs.map(x => x.modified),
    ]
      .sort()
      .at(-1)!;
    out.push({
      path,
      dir,
      slug: f.name,
      title: str(d.title) || f.name,
      kind: d.kind === "hub" || d.kind === "study" ? d.kind : "",
      cover: await subjectCover(notes.storage, dir),
      coverFrame: frameText(frameOf(d.cover_frame)),
      group: str(d.group),
      parent: str(d.parent),
      exam: str(d.exam).slice(0, 10),
      course,
      semester: int(d.semester),
      teacher: str(d.teacher),
      room: str(d.room),
      hoursWeek: num(d.hours_week),
      hoursTotal: num(d.hours_total),
      schedule: slotsOf(d.schedule),
      result: pick(d.result, CLASS_RESULTS, "taking"),
      absences: Math.max(0, num(d.absences) ?? 0),
      assignments,
      exams,
      hasSummary: n.body.trim() !== "",
      notebookAt: str(d.notebook_at),
      notebookWhen: str(d.modified ?? d.created),
      materials,
      notes: studyNotes,
      links,
      pdfs,
      exercises,
      workbench,
      modified,
    });
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path));
}

export const groupsOf = (subjects: Subject[]) => [...new Set(subjects.map(s => s.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// ---- Changes ----

export async function createSubject(
  notes: Notes,
  fields: { title: string; kind?: SubjectKind; group?: string; parent?: string; course?: string; semester?: number },
): Promise<Note> {
  const dir = await notes.freePath("study", slugify(fields.title), "");
  const data: Data = {
    type: "subject",
    title: fields.title.trim(),
    kind: !fields.course && fields.kind ? fields.kind : undefined,
    group: fields.group?.trim() || undefined,
    parent: fields.parent || undefined,
    course: fields.course || undefined,
    semester: fields.course ? fields.semester : undefined,
    result: fields.course ? "taking" : undefined,
  };
  return notes.create(`${dir}/${SUBJECT_FILE}`, data, "");
}

export const isSchool = (s: Subject) => s.course !== "";

/** Children of a subject in the personal tree (parent = the subject's folder name). */
export const childrenOf = (subjects: Subject[], slug: string) => subjects.filter(s => !isSchool(s) && s.parent === slug);

/**
 * Personal subjects at the top of the tree: no parent, or a parent that no longer exists
 * (or would make a loop), so nothing is ever hidden.
 */
export function rootsOf(subjects: Subject[]): Subject[] {
  const personal = subjects.filter(s => !isSchool(s));
  const by = new Map(personal.map(s => [s.slug, s]));
  const reachesRoot = (s: Subject) => {
    const seen = new Set<string>();
    for (let x: Subject | undefined = s; x; x = by.get(x.parent)) {
      if (seen.has(x.slug)) return false;
      seen.add(x.slug);
      if (!x.parent || !by.has(x.parent)) return true;
    }
    return true;
  };
  return personal.filter(s => !s.parent || !by.has(s.parent) || !reachesRoot(s));
}

/** Slugs of a subject and everything under it (a subject cannot get one of these as parent). */
export function descendantsOf(subjects: Subject[], slug: string): Set<string> {
  const out = new Set([slug]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of subjects) if (!out.has(s.slug) && out.has(s.parent)) (out.add(s.slug), (grew = true));
  }
  return out;
}

/**
 * Text brought in as a material (an imported .md file or pasted text). A header it already has
 * is read for the title and left out of the body; the title is otherwise the first "# " heading,
 * then the file name.
 */
export function importText(text: string, fileName = ""): { title: string; body: string } {
  const p = parse(text.replace(/\r\n/g, "\n"));
  const title = str(p.data.title ?? p.data.titulo).trim() || titleOf(p.body) || fileName.replace(/\.(md|markdown|txt)$/i, "");
  return { title, body: p.body.replace(/^\s*\n/, "") };
}

export async function createMaterial(
  notes: Notes,
  subjectDir: string,
  fields: { title: string; kind: MaterialKind; source?: string; url?: string; body?: string },
): Promise<Note> {
  const path = await notes.freePath(`${subjectDir}/materials`, slugify(fields.title, 60));
  const data: Data = {
    type: "material",
    title: fields.title.trim(),
    kind: fields.kind,
    source: fields.source?.trim() || undefined,
    url: fields.url?.trim() || undefined,
  };
  return notes.create(path, data, fields.body ?? "");
}

/** Header change for a chapter marked read or unread. */
export function donePatch(done: number[], n: number, on: boolean): Data {
  const next = on ? [...new Set([...done, n])].sort((a, b) => a - b) : done.filter(x => x !== n);
  return { done: next.length ? next : undefined };
}

export async function createStudyNote(
  notes: Notes,
  subjectDir: string,
  about?: { material?: string; chapter?: number; pdf?: string; title?: string; kind?: StudyNoteKind; date?: string },
  at = new Date(),
): Promise<Note> {
  const data: Data = {
    type: "study-note",
    kind: about?.kind && about.kind !== "note" ? about.kind : undefined,
    date: about?.date,
    material: about?.material || undefined,
    pdf: about?.pdf || undefined,
    chapter: about?.chapter,
  };
  const body = about?.title ? `# ${about.title}\n\n` : "";
  return notes.create(await notes.freePath(`${subjectDir}/notes`, stamp(at)), data, body);
}

export interface NewCard {
  front: string;
  back: string;
  /** Also asked the other way round (":::" / "??"). */
  both?: boolean;
}

/** A card written in the note syntax (data/cards): one line when both sides are one line. */
export function cardText(c: NewCard): string {
  const front = c.front.trim();
  const back = c.back.trim();
  if (!front.includes("\n") && !back.includes("\n")) return `${front} ${c.both ? ":::" : "::"} ${back}`;
  const clean = (x: string) => x.replace(/\n\s*\n+/g, "\n");
  return `${clean(front)}\n${c.both ? "??" : "?"}\n${clean(back)}`;
}

/**
 * Adds cards to a subject's flashcard note: "Flashcards" for cards made by hand, or one note per
 * material for cards made from it. The note is created on first use. Returns its path.
 */
export async function appendCards(
  notes: Notes,
  subjectDir: string,
  cards: NewCard[],
  from?: { material: string; title: string },
): Promise<string> {
  const name = from ? `cards-${from.material}` : "flashcards";
  const path = `${subjectDir}/notes/${name}.md`;
  const lines = cards.filter(c => c.front.trim() && c.back.trim()).map(cardText);
  if (await notes.exists(path)) {
    const n = await notes.load(path);
    const body = n.body.replace(/\s*$/, "");
    await notes.save(n, n.data, `${body}\n\n${lines.join("\n\n")}\n`);
  } else {
    const title = from ? `Flashcards: ${from.title}` : "Flashcards";
    const data: Data = { type: "study-note", kind: "cards", material: from?.material };
    await notes.create(path, data, `# ${title}\n\n${lines.join("\n\n")}\n`);
  }
  return path;
}

// ---- [[Links]] between study notes ----

/** Names inside [[…]] in a text, outside code; "[[Name|shown text]]" and "[[Name#part]]" give Name. */
export function linksIn(body: string): string[] {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    for (const m of line.replace(/`[^`]*`/g, "").matchAll(/\[\[([^\[\]\n]+)\]\]/g)) {
      const name = m[1].split("|")[0].split("#")[0].trim();
      if (name) out.push(name);
    }
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export type LinkTarget =
  | { kind: "subject"; path: string; title: string }
  | { kind: "material"; path: string; title: string }
  | { kind: "note"; path: string; title: string };

/** Everything a [[link]] can point to, the given subject's own items first. */
export function linkTargets(subjects: Subject[], first?: string): LinkTarget[] {
  const order = [...subjects].sort((a, b) => Number(b.dir === first) - Number(a.dir === first));
  const out: LinkTarget[] = [];
  for (const s of order) {
    for (const n of s.notes) if (n.title) out.push({ kind: "note", path: n.path, title: n.title });
    for (const m of s.materials) out.push({ kind: "material", path: m.path, title: m.title });
  }
  for (const s of order) out.push({ kind: "subject", path: s.path, title: s.title });
  return out;
}

/** What [[name]] opens: notes first, then materials, then subjects; the current subject wins ties. */
export function resolveLink(subjects: Subject[], name: string, fromDir?: string): LinkTarget | null {
  const key = fold(name);
  return linkTargets(subjects, fromDir).find(x => fold(x.title) === key) ?? null;
}

/** Study notes that link to a title (backlinks). */
export function backlinks(subjects: Subject[], title: string, except?: string): StudyNote[] {
  const key = fold(title);
  if (!key) return [];
  return subjects.flatMap(s => s.notes.filter(n => n.path !== except && n.links.some(x => fold(x) === key)));
}

/**
 * Saves a card's review state in its note (undefined clears it). States of cards no longer in
 * the note are dropped. `modified` is not touched: reviewing is not editing. Returns the old state
 * for Undo.
 */
export async function setCardState(notes: Notes, path: string, id: string, state: CardState | undefined): Promise<CardState | undefined> {
  const n = await notes.load(path);
  const ids = new Set(parseCards(n.body).map(c => c.id));
  const states = statesOf(n.data);
  const old = states.get(id);
  if (state) states.set(id, state);
  else states.delete(id);
  const cards: Record<string, string> = {};
  for (const [k, s] of states) if (ids.has(k)) cards[k] = writeState(s);
  await notes.save(n, { ...n.data, cards: Object.keys(cards).length ? cards : undefined }, n.body, { touch: false });
  return old;
}
