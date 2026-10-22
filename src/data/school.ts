import type { Storage } from "../storage/types";
import { slugify, stamp } from "./dates";
import type { Data } from "./frontmatter";
import type { Note, Notes } from "./notes";

// School: courses (ADS…) split in semesters; a school subject is a Study subject (data/study)
// with `course:` and `semester:` in its header, plus class fields (teacher, room, schedule…).
//   study/_courses/<slug>.md                 a course: title, institution, semesters, current,
//                                            pass mark and minimum attendance
//   study/<subject>/assignments/<slug>/      an assignment: assignment.md (due date, group,
//                                            status, grade) and any files handed in or received
//   study/<subject>/exams/<stamp>.md         an exam: date, room, grade; the body is what to study
// The average of a subject comes from the grades of its assignments and exams (each with a weight).

export const COURSES_DIR = "study/_courses";
export const ASSIGNMENT_FILE = "assignment.md";

export interface Course {
  path: string;
  /** File name without .md: what a subject points to in `course:`. */
  id: string;
  title: string;
  institution: string;
  semesters: number;
  /** The semester being taken now (1-based). */
  current: number;
  /** Lowest average that passes, on a 0–10 scale. */
  pass: number;
  /** Minimum attendance, in percent. */
  attendance: number;
}

export type ClassResult = "taking" | "passed" | "failed";
export const CLASS_RESULTS: ClassResult[] = ["taking", "passed", "failed"];

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A weekly class time: "mon 19:00-20:40". */
export interface Slot {
  day: Weekday;
  from: string;
  to: string;
}

export type AssignmentStatus = "todo" | "doing" | "delivered" | "graded";
export const ASSIGNMENT_STATUSES: AssignmentStatus[] = ["todo", "doing", "delivered", "graded"];

export interface Graded {
  grade: number | null;
  weight: number;
}

export interface Assignment extends Graded {
  path: string;
  dir: string;
  title: string;
  due: string;
  group: boolean;
  members: string;
  status: AssignmentStatus;
  /** Names of the files in the assignment folder (besides assignment.md). */
  files: string[];
}

export interface Exam extends Graded {
  path: string;
  title: string;
  date: string;
  time: string;
  room: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const pick = <T extends string>(v: unknown, list: T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

export function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const pad = (t: string) => (t.length === 4 ? `0${t}` : t);

export function parseSlot(v: unknown): Slot | null {
  const m = /^\s*(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/i.exec(str(v));
  if (!m || !TIME.test(m[2]) || !TIME.test(m[3])) return null;
  return { day: m[1].toLowerCase() as Weekday, from: pad(m[2]), to: pad(m[3]) };
}

export const slotText = (s: Slot) => `${s.day} ${s.from}-${s.to}`;

export function slotsOf(v: unknown): Slot[] {
  return (Array.isArray(v) ? v : [])
    .map(parseSlot)
    .filter((s): s is Slot => !!s)
    .sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || a.from.localeCompare(b.from));
}

/** The weekday of a yyyy-mm-dd day. */
export function weekdayOf(day: string): Weekday {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

export function toCourse(n: Note): Course {
  const d = n.data;
  const id = n.path.slice(n.path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const semesters = Math.max(1, Math.min(20, Math.round(num(d.semesters) ?? 1)));
  return {
    path: n.path,
    id,
    title: str(d.title) || id,
    institution: str(d.institution),
    semesters,
    current: Math.max(1, Math.min(semesters, Math.round(num(d.current) ?? 1))),
    pass: num(d.pass) ?? 6,
    attendance: num(d.attendance) ?? 75,
  };
}

export async function loadCourses(notes: Notes, onError?: (path: string) => void): Promise<Course[]> {
  const out: Course[] = [];
  for (const f of await notes.storage.list(COURSES_DIR)) {
    if (f.isDir || !f.name.endsWith(".md")) continue;
    const path = `${COURSES_DIR}/${f.name}`;
    try {
      out.push(toCourse(await notes.load(path)));
    } catch {
      onError?.(path);
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export async function createCourse(notes: Notes, fields: { title: string; institution?: string; semesters: number }): Promise<Note> {
  const path = await notes.freePath(COURSES_DIR, slugify(fields.title));
  const data: Data = {
    type: "course",
    title: fields.title.trim(),
    institution: fields.institution?.trim() || undefined,
    semesters: fields.semesters,
    current: 1,
    pass: 6,
    attendance: 75,
  };
  return notes.create(path, data, "");
}

// ---- Assignments and exams ----

const graded = (d: Data): Graded => ({ grade: num(d.grade), weight: num(d.weight) ?? 1 });

export async function loadAssignments(s: Storage, notes: Notes, subjectDir: string, onError?: (p: string) => void): Promise<Assignment[]> {
  const out: Assignment[] = [];
  const base = `${subjectDir}/assignments`;
  for (const f of await s.list(base)) {
    if (!f.isDir) continue;
    const dir = `${base}/${f.name}`;
    const path = `${dir}/${ASSIGNMENT_FILE}`;
    try {
      const entries = await s.list(dir);
      if (!entries.some(e => e.name === ASSIGNMENT_FILE)) continue;
      const d = (await notes.load(path)).data;
      out.push({
        path,
        dir,
        title: str(d.title) || f.name,
        due: str(d.due).slice(0, 10),
        group: d.group === true,
        members: str(d.members),
        status: pick(d.status, ASSIGNMENT_STATUSES, "todo"),
        files: entries
          .filter(e => !e.isDir && e.name !== ASSIGNMENT_FILE && !e.name.includes(".tmp-"))
          .map(e => e.name)
          .sort((a, b) => a.localeCompare(b)),
        ...graded(d),
      });
    } catch {
      onError?.(path);
    }
  }
  // Open work first, by due date; then the delivered ones, latest first.
  const open = (a: Assignment) => a.status === "todo" || a.status === "doing";
  return out.sort((a, b) =>
    open(a) !== open(b) ? (open(a) ? -1 : 1) : open(a) ? (a.due || "9999").localeCompare(b.due || "9999") : b.due.localeCompare(a.due),
  );
}

export function toExam(n: Note): Exam {
  const d = n.data;
  return {
    path: n.path,
    title: str(d.title) || n.path.slice(n.path.lastIndexOf("/") + 1, -3),
    date: str(d.date).slice(0, 10),
    time: TIME.test(str(d.time)) ? pad(str(d.time)) : "",
    room: str(d.room),
    ...graded(d),
  };
}

export async function createAssignment(notes: Notes, subjectDir: string, fields: { title: string; due?: string }): Promise<Note> {
  const dir = await notes.freePath(`${subjectDir}/assignments`, slugify(fields.title), "");
  const data: Data = { type: "assignment", title: fields.title.trim(), due: fields.due || undefined, status: "todo" };
  return notes.create(`${dir}/${ASSIGNMENT_FILE}`, data, "");
}

export async function createExam(notes: Notes, subjectDir: string, fields: { title: string; date?: string }, at = new Date()): Promise<Note> {
  const path = await notes.freePath(`${subjectDir}/exams`, stamp(at));
  return notes.create(path, { type: "exam", title: fields.title.trim(), date: fields.date || undefined }, "");
}

/** A file name safe on Linux, Android and FAT-formatted cards; keeps the extension. */
export function safeFileName(name: string): string {
  const clean = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return clean.slice(-120) || "file";
}

/** Copies a picked file into an assignment folder, renaming it when the name is taken. */
export async function addFile(s: Storage, dir: string, name: string, data: Uint8Array): Promise<string> {
  const clean = safeFileName(name);
  const dot = clean.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  let target = clean;
  for (let i = 2; target === ASSIGNMENT_FILE || (await s.stat(`${dir}/${target}`)); i++) target = `${stem} (${i})${ext}`;
  await s.writeBinary(`${dir}/${target}`, data);
  return target;
}

// ---- Grades and attendance ----

/** Weighted average of the graded items, or null when none has a grade yet. */
export function average(items: Graded[]): number | null {
  let sum = 0;
  let weights = 0;
  for (const x of items)
    if (x.grade !== null && x.weight > 0) {
      sum += x.grade * x.weight;
      weights += x.weight;
    }
  return weights ? Math.round((sum / weights) * 100) / 100 : null;
}

/**
 * The grade still needed in the items not graded yet (all with the same grade) to reach `pass`:
 * null when everything is graded or nothing has a weight left; 0 when already safe.
 */
export function neededGrade(items: Graded[], pass: number): number | null {
  const all = items.filter(x => x.weight > 0);
  const left = all.filter(x => x.grade === null).reduce((n, x) => n + x.weight, 0);
  if (!left) return null;
  const total = all.reduce((n, x) => n + x.weight, 0);
  const got = all.reduce((n, x) => n + (x.grade ?? 0) * x.weight, 0);
  return Math.max(0, Math.round(((pass * total - got) / left) * 100) / 100);
}

/** Total class hours of a term: the given total, else hours a week × 20 weeks. */
export const totalHours = (total: number | null, perWeek: number | null) => total ?? (perWeek ? perWeek * 20 : null);

/** Hours of absence allowed before failing by attendance. */
export const absenceLimit = (total: number | null, attendance: number) =>
  total === null ? null : Math.floor((total * (100 - attendance)) / 100);
