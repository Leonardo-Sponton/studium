import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createMaterial, createStudyNote, createSubject, loadGroups, loadSubjects } from "../src/data/study";
import {
  addGroup,
  duplicateNote,
  loadPins,
  movePin,
  moveNote,
  moveSubject,
  placesFor,
  relinkAll,
  relinkText,
  renameNote,
  renameTitled,
  retitle,
  togglePin,
} from "../src/data/organize";

const AT = new Date(2026, 9, 24, 10, 0, 0);
const fresh = () => new Notes(new MemoryStorage());

describe("retitle", () => {
  it("changes the first-line heading and keeps the rest", () => {
    expect(retitle("# Old\n\nText", "New")).toBe("# New\n\nText");
    expect(retitle("  # Old  \nText", "New")).toBe("# New\nText");
  });
  it("adds a heading when there is none", () => {
    expect(retitle("first line\nmore", "New")).toBe("# New\n\nfirst line\nmore");
    expect(retitle("", "New")).toBe("# New\n\n");
  });
});

describe("relinkText", () => {
  it("rewrites links, aliases, parts and embeds, ignoring accents and case", () => {
    const body = "See [[Transações]], [[transacoes|this]], [[Transações#ACID]] and ![[TRANSAÇÕES]]; not [[Other]].";
    expect(relinkText(body, "Transações", "Transactions in JDBC")).toBe(
      "See [[Transactions in JDBC]], [[Transactions in JDBC|this]], [[Transactions in JDBC#ACID]] and ![[Transactions in JDBC]]; not [[Other]].",
    );
  });
  it("leaves code alone", () => {
    const body = "`[[A]]` and [[A]]\n```\n[[A]]\n```\n[[A]]";
    expect(relinkText(body, "A", "B")).toBe("`[[A]]` and [[B]]\n```\n[[A]]\n```\n[[B]]");
  });
});

describe("renaming", () => {
  it("renames a note and the links to it, but not links another note still answers", async () => {
    const notes = fresh();
    const s = await createSubject(notes, { title: "JDBC", group: "Backend" });
    const dir = s.path.slice(0, s.path.lastIndexOf("/"));
    const a = await createStudyNote(notes, dir, { title: "PreparedStatement" }, AT);
    const b = await createStudyNote(notes, dir, { title: "Transactions" }, new Date(+AT + 1000));
    await notes.save(b, b.data, "# Transactions\n\nUse [[PreparedStatement]] and [[preparedstatement|it]].");
    await renameNote(notes, a.path, "PreparedStatement e SQL injection");
    const subjects = await loadSubjects(notes);
    expect(await relinkAll(notes, subjects, "PreparedStatement", "PreparedStatement e SQL injection", a.path)).toBe(1);
    expect((await notes.load(b.path)).body).toBe(
      "# Transactions\n\nUse [[PreparedStatement e SQL injection]] and [[PreparedStatement e SQL injection|it]].",
    );
    // The renamed note keeps its file; the list reads the new title.
    expect((await loadSubjects(notes))[0].notes.map(n => n.title).sort()).toEqual(["PreparedStatement e SQL injection", "Transactions"]);

    // Another item with the old title: its links stay.
    const c = await createStudyNote(notes, dir, { title: "Pool" }, new Date(+AT + 2000));
    await createMaterial(notes, dir, { title: "Pool", kind: "handout" });
    const latest = await notes.load(b.path);
    await notes.save(latest, latest.data, "[[Pool]]");
    await renameNote(notes, c.path, "Connection pool");
    expect(await relinkAll(notes, await loadSubjects(notes), "Pool", "Connection pool", c.path)).toBe(0);
  });

  it("renames a subject in its header", async () => {
    const notes = fresh();
    const s = await createSubject(notes, { title: "Git" });
    await renameTitled(notes, s.path, "Git e GitHub");
    expect((await loadSubjects(notes))[0].title).toBe("Git e GitHub");
  });
});

describe("moving", () => {
  it("moves a note to another subject and drops what tied it to the old one", async () => {
    const notes = fresh();
    const a = await createSubject(notes, { title: "JDBC" });
    const b = await createSubject(notes, { title: "JPA" });
    const dirA = a.path.replace("/subject.md", "");
    const dirB = b.path.replace("/subject.md", "");
    const n = await createStudyNote(notes, dirA, { title: "Transactions", material: "handout", chapter: 2 }, AT);
    const to = await moveNote(notes, n.path, dirB);
    expect(to.startsWith(`${dirB}/notes/`)).toBe(true);
    expect(await notes.exists(n.path)).toBe(false);
    const moved = await notes.load(to);
    expect(moved.data.material).toBeUndefined();
    expect(moved.data.chapter).toBeUndefined();
    expect(moved.body).toBe("# Transactions\n\n");
    // Same subject: nothing happens.
    expect(await moveNote(notes, to, dirB)).toBe(to);
  });

  it("moves subjects between groups and under other subjects, never into themselves", async () => {
    const notes = fresh();
    await createSubject(notes, { title: "Backend", group: "Dev" });
    await createSubject(notes, { title: "JDBC", group: "Dev" });
    let subjects = await loadSubjects(notes);
    const backend = subjects.find(s => s.title === "Backend")!;
    const jdbc = subjects.find(s => s.title === "JDBC")!;
    await moveSubject(notes, subjects, jdbc, { parent: backend.slug });
    subjects = await loadSubjects(notes);
    expect(subjects.find(s => s.title === "JDBC")).toMatchObject({ parent: backend.slug, group: "" });
    // Backend cannot go under JDBC (its own child).
    expect(placesFor(subjects, backend).map(s => s.title)).toEqual([]);
    await expect(moveSubject(notes, subjects, backend, { parent: jdbc.slug })).rejects.toThrow();
    // Back to the top, in another group.
    await moveSubject(notes, subjects, subjects.find(s => s.title === "JDBC")!, { group: "Banco de dados" });
    subjects = await loadSubjects(notes);
    expect(subjects.find(s => s.title === "JDBC")).toMatchObject({ parent: "", group: "Banco de dados" });
  });
});

describe("duplicate, groups and pins", () => {
  it("duplicates a note beside it without its card progress", async () => {
    const notes = fresh();
    const s = await createSubject(notes, { title: "SQL" });
    const dir = s.path.replace("/subject.md", "");
    const n = await createStudyNote(notes, dir, { title: "JOIN" }, AT);
    await notes.save(n, { ...n.data, cards: { abc: "2026-10-30,3,250" } }, "# JOIN\n\nQ :: A\n");
    const copy = await duplicateNote(notes, n.path, t => `${t} (copy)`);
    const c = await notes.load(copy);
    expect(c.body).toBe("# JOIN (copy)\n\nQ :: A\n");
    expect(c.data.cards).toBeUndefined();
    expect(c.data.type).toBe("study-note");
  });

  it("adds an empty group once", async () => {
    const notes = fresh();
    await addGroup(notes, "Linguagens");
    await addGroup(notes, "Linguagens ");
    expect(await loadGroups(notes)).toEqual(["Linguagens"]);
  });

  it("pins, follows a move and unpins", async () => {
    const notes = fresh();
    expect(await loadPins(notes)).toEqual([]);
    expect(await togglePin(notes, "study/a/notes/x.md")).toBe(true);
    await movePin(notes, "study/a/notes/x.md", "study/b/notes/x.md");
    expect(await loadPins(notes)).toEqual(["study/b/notes/x.md"]);
    expect(await togglePin(notes, "study/b/notes/x.md")).toBe(false);
    expect(await loadPins(notes)).toEqual([]);
    // The pins file is not a subject.
    expect(await loadSubjects(notes)).toEqual([]);
  });
});
