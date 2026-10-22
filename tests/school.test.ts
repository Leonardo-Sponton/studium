import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { parseCards } from "../src/data/cards";
import {
  absenceLimit,
  addFile,
  average,
  createAssignment,
  createCourse,
  createExam,
  loadCourses,
  neededGrade,
  parseSlot,
  safeFileName,
  slotsOf,
  totalHours,
  weekdayOf,
} from "../src/data/school";
import {
  appendCards,
  backlinks,
  cardText,
  childrenOf,
  createStudyNote,
  createSubject,
  descendantsOf,
  linksIn,
  loadSubjects,
  resolveLink,
  rootsOf,
} from "../src/data/study";

const notesOf = () => new Notes(new MemoryStorage());

describe("school data", () => {
  it("reads class times and sorts them by weekday", () => {
    expect(parseSlot("mon 19:00-20:40")).toEqual({ day: "mon", from: "19:00", to: "20:40" });
    expect(parseSlot("Wed 7:30 - 9:10")).toEqual({ day: "wed", from: "07:30", to: "09:10" });
    expect(parseSlot("monday 19:00-20:40")).toBeNull();
    expect(parseSlot("mon 25:00-26:00")).toBeNull();
    expect(slotsOf(["fri 19:00-20:40", "mon 21:00-22:40", "mon 19:00-20:40", 3]).map(s => `${s.day} ${s.from}`)).toEqual([
      "mon 19:00",
      "mon 21:00",
      "fri 19:00",
    ]);
    expect(weekdayOf("2026-10-18")).toBe("sun");
    expect(weekdayOf("2026-10-19")).toBe("mon");
  });

  it("averages grades by weight and says what is still needed", () => {
    const items = [
      { grade: 6, weight: 1 },
      { grade: 8, weight: 2 },
      { grade: null, weight: 2 },
    ];
    expect(average(items)).toBe(7.33);
    expect(average([{ grade: null, weight: 1 }])).toBeNull();
    // pass 6 over weights 5 = 30 points; has 22; 8 left over weight 2 → 4.
    expect(neededGrade(items, 6)).toBe(4);
    expect(neededGrade(items.slice(0, 2), 6)).toBeNull();
    expect(neededGrade([{ grade: 10, weight: 3 }, { grade: null, weight: 1 }], 6)).toBe(0);
  });

  it("works out the absence limit from the hours", () => {
    expect(totalHours(80, 4)).toBe(80);
    expect(totalHours(null, 4)).toBe(80);
    expect(totalHours(null, null)).toBeNull();
    expect(absenceLimit(80, 75)).toBe(20);
    expect(absenceLimit(null, 75)).toBeNull();
  });

  it("creates courses, assignments with files, and exams", async () => {
    const notes = notesOf();
    await createCourse(notes, { title: "ADS", institution: "Sample College", semesters: 5 });
    const [c] = await loadCourses(notes);
    expect(c).toMatchObject({ id: "ads", title: "ADS", semesters: 5, current: 1, pass: 6, attendance: 75 });

    const subj = await createSubject(notes, { title: "Banco de Dados", course: "ads", semester: 3 });
    const dir = subj.path.replace("/subject.md", "");
    const a = await createAssignment(notes, dir, { title: "Modelo ER", due: "2026-10-30" });
    const adir = a.path.replace("/assignment.md", "");
    expect(await addFile(notes.storage, adir, "enunciado.pdf", new Uint8Array([1, 2]))).toBe("enunciado.pdf");
    expect(await addFile(notes.storage, adir, "enunciado.pdf", new Uint8Array([3]))).toBe("enunciado (2).pdf");
    expect(await addFile(notes.storage, adir, "assignment.md", new Uint8Array([3]))).toBe("assignment (2).md");
    await notes.patchHeader(a.path, { grade: 8, weight: 2 });
    const e = await createExam(notes, dir, { title: "P1", date: "2026-11-05" });
    await notes.patchHeader(e.path, { grade: "6,5" });

    // A personal subject has no assignments loaded; the courses folder is not a subject.
    await createSubject(notes, { title: "Docker" });
    const all = await loadSubjects(notes);
    expect(all.map(s => s.title).sort()).toEqual(["Banco de Dados", "Docker"]);
    const s = all.find(x => x.course === "ads")!;
    expect(s.semester).toBe(3);
    expect(s.result).toBe("taking");
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0]).toMatchObject({ title: "Modelo ER", due: "2026-10-30", status: "todo", grade: 8, weight: 2 });
    expect(s.assignments[0].files).toEqual(["assignment (2).md", "enunciado (2).pdf", "enunciado.pdf"]);
    expect(s.exams[0]).toMatchObject({ title: "P1", date: "2026-11-05", grade: 6.5, weight: 1 });
    expect(average([...s.assignments, ...s.exams])).toBe(7.5);
  });

  it("makes picked file names safe", () => {
    expect(safeFileName('a/b:c*?"<>|.pdf')).toBe("a_b_c______.pdf");
    expect(safeFileName("..hidden")).toBe("hidden");
    expect(safeFileName("")).toBe("file");
  });
});

describe("personal tree", () => {
  it("nests subjects by parent and never hides one in a loop", async () => {
    const notes = notesOf();
    await createSubject(notes, { title: "Java" });
    await createSubject(notes, { title: "JDBC", parent: "java" });
    await createSubject(notes, { title: "Pool", parent: "jdbc" });
    await createSubject(notes, { title: "Orphan", parent: "gone" });
    const a = await createSubject(notes, { title: "Loop A", parent: "loop-b" });
    await createSubject(notes, { title: "Loop B", parent: "loop-a" });
    await createSubject(notes, { title: "ADS subject", course: "ads", semester: 1 });
    const all = await loadSubjects(notes);
    expect(rootsOf(all).map(s => s.slug).sort()).toEqual(["java", "loop-a", "loop-b", "orphan"]);
    expect(childrenOf(all, "java").map(s => s.slug)).toEqual(["jdbc"]);
    expect([...descendantsOf(all, "java")].sort()).toEqual(["java", "jdbc", "pool"]);
    expect(a.path).toBe("study/loop-a/subject.md");
  });
});

describe("links and cards", () => {
  it("finds [[links]] outside code", () => {
    const body = "See [[JDBC]] and [[Pool|the pool]] and [[Docker#Volumes]].\n`[[not]]`\n```\n[[nope]]\n```\n";
    expect(linksIn(body)).toEqual(["JDBC", "Pool", "Docker"]);
  });

  it("resolves links (own subject first) and lists backlinks", async () => {
    const notes = notesOf();
    const java = await createSubject(notes, { title: "Java" });
    const sql = await createSubject(notes, { title: "SQL" });
    const jdir = java.path.replace("/subject.md", "");
    const sdir = sql.path.replace("/subject.md", "");
    await createStudyNote(notes, jdir, { title: "Joins" }, new Date(2026, 9, 1, 10));
    const sj = await createStudyNote(notes, sdir, { title: "Joins" }, new Date(2026, 9, 1, 11));
    const n = await createStudyNote(notes, sdir, {}, new Date(2026, 9, 1, 12));
    await notes.save(n, n.data, "# Index\n\nRead [[joins]] and [[Java]].\n");
    const all = await loadSubjects(notes);
    expect(resolveLink(all, "Joins", sdir)?.path).toBe(sj.path);
    expect(resolveLink(all, "java", sdir)).toMatchObject({ kind: "subject", path: java.path });
    expect(resolveLink(all, "nothing", sdir)).toBeNull();
    expect(backlinks(all, "Joins").map(x => x.path)).toEqual([n.path]);
  });

  it("writes cards in the note syntax and appends them to the flashcard note", async () => {
    expect(cardText({ front: "Q", back: "A" })).toBe("Q :: A");
    expect(cardText({ front: "Q", back: "A", both: true })).toBe("Q ::: A");
    expect(cardText({ front: "Line 1\nLine 2", back: "A" })).toBe("Line 1\nLine 2\n?\nA");
    const notes = notesOf();
    const s = await createSubject(notes, { title: "Docker" });
    const dir = s.path.replace("/subject.md", "");
    const p = await appendCards(notes, dir, [{ front: "What is an image?", back: "A read-only template" }]);
    await appendCards(notes, dir, [{ front: "Container?", back: "A running image", both: true }, { front: "", back: "x" }]);
    const ai = await appendCards(notes, dir, [{ front: "Daemon?", back: "dockerd" }], { material: "handout", title: "Docker handout" });
    expect(p).toBe(`${dir}/notes/flashcards.md`);
    expect(ai).toBe(`${dir}/notes/cards-handout.md`);
    const body = (await notes.load(p)).body;
    expect(parseCards(body).map(c => c.front)).toEqual(["What is an image?", "Container?", "A running image"]);
    const [loaded] = await loadSubjects(notes);
    const aiNote = loaded.notes.find(n => n.path === ai)!;
    expect(aiNote).toMatchObject({ kind: "cards", material: "handout", title: "Flashcards: Docker handout" });
  });
});
