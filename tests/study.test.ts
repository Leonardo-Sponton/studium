import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { parseCards, readState, schedule, statesOf } from "../src/data/cards";
import {
  chaptersOf,
  continueAt,
  addPdf,
  addExerciseFile,
  createExercise,
  guessLinkKind,
  isExercisePath,
  addProjectFile,
  createMaterial,
  createProject,
  createStudyNote,
  DESCRIPTION_MAX,
  isFreeNote,
  statusPatch,
  createSubject,
  donePatch,
  dueCards,
  filterStudyNotes,
  importText,
  loadSubjects,
  progress,
  setCardState,
  subjectProgress,
} from "../src/data/study";

const AT = new Date(2026, 9, 18, 21, 52, 7);

describe("flashcards", () => {
  it("reads the Obsidian Spaced Repetition marks", () => {
    const body = [
      "# JDBC",
      "",
      "- What does autoCommit=true do? :: Each statement is its own transaction",
      "Statement ::: runs plain SQL",
      "",
      "What does ACID",
      "stand for?",
      "?",
      "Atomicity, Consistency,",
      "Isolation, Durability",
      "",
      "Pool",
      "??",
      "HikariCP",
    ].join("\n");
    const cards = parseCards(body);
    expect(cards.map(c => [c.front, c.back, c.line])).toEqual([
      ["What does autoCommit=true do?", "Each statement is its own transaction", 2],
      ["Statement", "runs plain SQL", 3],
      ["runs plain SQL", "Statement", 3],
      ["What does ACID\nstand for?", "Atomicity, Consistency,\nIsolation, Durability", 5],
      ["Pool", "HikariCP", 11],
      ["HikariCP", "Pool", 11],
    ]);
    expect(cards[1].id).not.toBe(cards[2].id);
  });

  it("does not take a one-line card into a multi-line one", () => {
    const cards = parseCards("A :: B\nWhat is ACID?\n?\nFour guarantees\nC :: D");
    expect(cards.map(c => [c.front, c.back])).toEqual([["A", "B"], ["What is ACID?", "Four guarantees"], ["C", "D"]]);
  });

  it("ignores :: inside code", () => {
    const body = "Use `String::length` here\n\n```java\nlist.forEach(System.out::println);\nA :: B\n```\n\n`a::b` means :: a method reference";
    expect(parseCards(body).map(c => [c.front, c.back])).toEqual([["`a::b` means", "a method reference"]]);
  });

  it("keeps the id when the answer changes, not when the question does", () => {
    const a = parseCards("Q :: A")[0].id;
    expect(parseCards("Q :: other answer")[0].id).toBe(a);
    expect(parseCards("Q2 :: A")[0].id).not.toBe(a);
    const twice = parseCards("Q :: A\nQ :: B");
    expect(twice[1].id).toBe(`${a}-2`);
  });

  it("schedules like SM-2", () => {
    const today = "2026-10-18";
    expect(schedule(undefined, "again", today)).toEqual({ due: today, interval: 0, ease: 250 });
    const g = schedule(undefined, "good", today);
    expect(g).toEqual({ due: "2026-10-19", interval: 1, ease: 250 });
    expect(schedule(undefined, "easy", today)).toEqual({ due: "2026-10-22", interval: 4, ease: 265 });
    const g2 = schedule({ due: today, interval: 4, ease: 250 }, "good", today);
    expect(g2).toEqual({ due: "2026-10-28", interval: 10, ease: 250 });
    expect(schedule({ due: today, interval: 4, ease: 250 }, "hard", today)).toEqual({ due: "2026-10-23", interval: 5, ease: 235 });
    expect(schedule({ due: today, interval: 10, ease: 140 }, "again", today)).toEqual({ due: today, interval: 0, ease: 130 });
  });

  it("reads states back and skips broken ones", () => {
    expect(readState("2026-10-20 3 240")).toEqual({ due: "2026-10-20", interval: 3, ease: 240 });
    expect(readState("tomorrow")).toBeUndefined();
    expect(statesOf({ cards: { a: "2026-10-20 3 240", b: 7 } }).size).toBe(1);
  });
});

describe("chapters", () => {
  it("splits at the level used more than once, skipping the title and code", () => {
    const body = "# Handout\n\nRead this first.\n\n## Chapter 1\nA\n```\n## not a heading\n```\n## Chapter 2\nB\n### Part\nC\n";
    const ch = chaptersOf(body);
    expect(ch.map(c => [c.n, c.title])).toEqual([[0, "Handout"], [1, "Chapter 1"], [2, "Chapter 2"]]);
    expect(body.slice(ch[2].from, ch[2].to)).toBe("## Chapter 2\nB\n### Part\nC\n");
  });

  it("has no chapter 0 when only a title comes before", () => {
    expect(chaptersOf("# T\n\n## A\nx\n## B\ny").map(c => c.n)).toEqual([1, 2]);
    expect(chaptersOf("just text").map(c => c.n)).toEqual([0]);
    expect(chaptersOf("")).toEqual([]);
  });
});

describe("study area", () => {
  it("imports a handout with its own header", () => {
    expect(importText("---\ntitle: \"Spring Core\"\ntags: [java]\n---\n\n# Other\n\n## A\n")).toEqual({ title: "Spring Core", body: "# Other\n\n## A\n" });
    expect(importText("## A\n## B\n", "apostila-jpa.md").title).toBe("apostila-jpa");
  });

  it("filters and orders a subject's notes", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "JDBC" });
    await createMaterial(notes, "study/jdbc", { title: "A handout", kind: "handout", body: "## One\n## Two\n## Three\n" });
    await createMaterial(notes, "study/jdbc", { title: "B handout", kind: "handout", body: "## One\n" });
    await createStudyNote(notes, "study/jdbc", { title: "Free note" }, new Date(2026, 9, 18, 10));
    await createStudyNote(notes, "study/jdbc", { material: "a-handout", chapter: 3, title: "Ação três" }, new Date(2026, 9, 18, 11));
    const b = await createStudyNote(notes, "study/jdbc", { material: "b-handout", chapter: 1, title: "B one" }, new Date(2026, 9, 18, 12));
    await createStudyNote(notes, "study/jdbc", { material: "a-handout", chapter: 1, title: "A one" }, new Date(2026, 9, 18, 13));
    const loaded = await notes.load(b.path);
    await notes.save(loaded, loaded.data, loaded.body + "Q? :: A\n");

    const [s] = await loadSubjects(notes);
    const titles = (q: string, only: Parameters<typeof filterStudyNotes>[2], sort: Parameters<typeof filterStudyNotes>[3]) =>
      filterStudyNotes(s, q, only, sort).map(n => n.title);
    expect(titles("", "", "chapter")).toEqual(["A one", "Ação três", "B one", "Free note"]);
    expect(titles("", "", "newest")).toEqual(["A one", "B one", "Ação três", "Free note"]);
    expect(titles("", "", "title")).toEqual(["A one", "Ação três", "B one", "Free note"]);
    expect(titles("", "m:a-handout", "chapter")).toEqual(["A one", "Ação três"]);
    expect(titles("", "free", "chapter")).toEqual(["Free note"]);
    expect(titles("", "cards", "chapter")).toEqual(["B one"]);
    expect(titles("acao", "", "chapter")).toEqual(["Ação três"]);
  });

  it("loads subjects with materials, progress, notes and cards", async () => {
    const notes = new Notes(new MemoryStorage());
    const s = await createSubject(notes, { title: "JDBC", group: "Java" });
    expect(s.path).toBe("study/jdbc/subject.md");
    const m = await createMaterial(notes, "study/jdbc", { title: "JDBC handout", kind: "handout", source: "Claude", body: "# JDBC\n\n## One\na\n## Two\nb\n## Three\nc\n" });
    await notes.patchHeader(m.path, { ...donePatch([], 1, true), at: 2 });
    const n = await createStudyNote(notes, "study/jdbc", { material: "jdbc-handout", chapter: 2, title: "Statements" }, AT);
    expect(n.path).toBe("study/jdbc/notes/20261018-215207.md");
    const loaded = await notes.load(n.path);
    await notes.save(loaded, loaded.data, loaded.body + "PreparedStatement stops? :: SQL injection\n");

    const [subject] = await loadSubjects(notes);
    expect(subject.title).toBe("JDBC");
    expect(subject.group).toBe("Java");
    expect(progress(subject.materials[0])).toEqual({ read: 1, total: 3 });
    expect(subjectProgress(subject)).toEqual({ read: 1, total: 3 });
    expect(subject.notes[0].title).toBe("Statements");
    expect(subject.notes[0].chapter).toBe(2);
    const c = continueAt([subject]);
    expect(c?.chapter.title).toBe("Two");

    const before = (await notes.load(n.path)).data.modified;
    const due = dueCards([subject], "2026-10-18");
    expect(due.map(d => d.card.front)).toEqual(["PreparedStatement stops?"]);
    await setCardState(notes, n.path, due[0].card.id, schedule(undefined, "good", "2026-10-18"));
    const after = await loadSubjects(notes);
    expect(dueCards(after, "2026-10-18")).toEqual([]);
    expect(dueCards(after, "2026-10-19")).toHaveLength(1);
    // Reviewing does not count as editing.
    expect((await notes.load(n.path)).data.modified).toBe(before);
    expect(Object.keys((await notes.load(n.path)).data.cards as object)).toEqual([due[0].card.id]);
  });
});

import { allGroups, deleteGroup, linksBody, loadGroups, parseLinks, renameGroup, saveGroups, saveLinks } from "../src/data/study";

describe("study links", () => {
  it("reads list items with a title, a bare address or a note, and writes them back", () => {
    const body = "Intro text\n- [JDBC guide](https://docs.oracle.com/jdbc) — chapter 3\n- https://youtu.be/x\n* [a \\[b\\]](http://x.org)\n";
    const list = parseLinks(body);
    expect(list).toEqual([
      { title: "JDBC guide", url: "https://docs.oracle.com/jdbc", note: "chapter 3", kind: "" },
      { title: "", url: "https://youtu.be/x", note: "", kind: "" },
      { title: "a [b]", url: "http://x.org", note: "", kind: "" },
    ]);
    expect(parseLinks(linksBody(list))).toEqual([list[0], { ...list[1], title: "https://youtu.be/x" }, list[2]]);
  });

  it("are kept in links.md and loaded with the subject", async () => {
    const notes = new Notes(new MemoryStorage());
    const s = await createSubject(notes, { title: "JDBC" });
    const dir = s.path.replace("/subject.md", "");
    await saveLinks(notes, dir, [{ title: "Docs", url: "https://x.org", note: "", kind: "video" as const }]);
    expect((await loadSubjects(notes))[0].links).toEqual([{ title: "Docs", url: "https://x.org", note: "", kind: "video" as const }]);
    await saveLinks(notes, dir, []);
    expect((await loadSubjects(notes))[0].links).toEqual([]);
  });
});

describe("link kinds", () => {
  it("are read and written as a #tag after the link", () => {
    const list = parseLinks("- [Intro](https://youtu.be/a) #video — part 1\n- [Old](https://x.org) #nope\n- https://dev.to/a #blog");
    expect(list.map(l => [l.title, l.kind, l.note])).toEqual([
      ["Intro", "video", "part 1"],
      ["Old", "", ""],
      ["", "blog", ""],
    ]);
    expect(linksBody([list[0]])).toBe("- [Intro](https://youtu.be/a) #video — part 1\n");
  });

  it("are guessed from the address", () => {
    expect(guessLinkKind("https://www.youtube.com/watch?v=1")).toBe("video");
    expect(guessLinkKind("https://medium.com/@a/b")).toBe("blog");
    expect(guessLinkKind("https://docs.spring.io/x")).toBe("docs");
    expect(guessLinkKind("https://www.udemy.com/course/x")).toBe("course");
    expect(guessLinkKind("https://example.com")).toBe("");
  });
});

describe("study exercises", () => {
  it("keep .md lists, PDFs and links in exercises/", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "SQL" });
    const e = await createExercise(notes, "study/sql", "Lista 1 — SELECT");
    expect(e.path).toBe("study/sql/exercises/lista-1-select.md");
    await addExerciseFile(notes, "study/sql", "prova antiga.pdf", new Uint8Array([37]));
    await saveLinks(notes, "study/sql/exercises", [{ title: "SQLZoo", url: "https://sqlzoo.net", note: "", kind: "tutorial" }]);
    const [s] = await loadSubjects(notes);
    expect(s.exercises.docs.map(d => [d.title, d.path])).toEqual([["Lista 1 — SELECT", e.path]]);
    expect(s.exercises.pdfs.map(p => p.name)).toEqual(["prova antiga.pdf"]);
    expect(s.exercises.links.map(l => [l.title, l.kind])).toEqual([["SQLZoo", "tutorial"]]);
    expect(s.pdfs).toEqual([]);
    expect(s.links).toEqual([]);
    expect(isExercisePath(e.path)).toBe(true);
  });
});

describe("study groups", () => {
  it("keep their order and empty groups; rename and delete move the subjects", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "JDBC", group: "Java" });
    await createSubject(notes, { title: "SQL", group: "Databases" });
    await saveGroups(notes, ["Languages", "Java"]);
    let subjects = await loadSubjects(notes);
    let saved = await loadGroups(notes);
    expect(allGroups(saved, subjects)).toEqual(["Languages", "Java", "Databases"]);

    await renameGroup(notes, subjects, saved, "Java", "Java SE");
    subjects = await loadSubjects(notes);
    saved = await loadGroups(notes);
    expect(subjects.find(s => s.title === "JDBC")!.group).toBe("Java SE");
    expect(saved).toEqual(["Languages", "Java SE", "Databases"]);

    await deleteGroup(notes, subjects, saved, "Databases");
    subjects = await loadSubjects(notes);
    expect(subjects.find(s => s.title === "SQL")!.group).toBe("");
    expect(allGroups(await loadGroups(notes), subjects)).toEqual(["Languages", "Java SE"]);
  });
});

describe("study PDFs and workbench", () => {
  it("keeps PDFs, notes about them and filters them apart from free notes", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "Redes" });
    expect(await addPdf(notes, "study/redes", "Modelo OSI.pdf", new Uint8Array([37, 80, 68, 70]))).toBe("Modelo OSI.pdf");
    expect(await addPdf(notes, "study/redes", "Modelo OSI.pdf", new Uint8Array([1]))).toBe("Modelo OSI (2).pdf");
    expect(await addPdf(notes, "study/redes", "tcp", new Uint8Array([1]))).toBe("tcp.pdf");
    await createStudyNote(notes, "study/redes", { pdf: "Modelo OSI.pdf", title: "Camadas" }, new Date(2026, 9, 1));
    await createStudyNote(notes, "study/redes", { title: "Solta" }, new Date(2026, 9, 2));

    const [s] = await loadSubjects(notes);
    expect(s.pdfs.map(p => p.title)).toEqual(["Modelo OSI", "Modelo OSI (2)", "tcp"]);
    expect(s.pdfs[0].path).toBe("study/redes/pdfs/Modelo OSI.pdf");
    expect(s.notes.map(n => [n.title, n.pdf, isFreeNote(n)])).toEqual([
      ["Camadas", "Modelo OSI.pdf", false],
      ["Solta", "", true],
    ]);
    expect(filterStudyNotes(s, "", "free", "chapter").map(n => n.title)).toEqual(["Solta"]);
    expect(filterStudyNotes(s, "", "p:Modelo OSI.pdf", "chapter").map(n => n.title)).toEqual(["Camadas"]);
  });

  it("creates, loads and orders workbench projects", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "Spring" });
    const a = await createProject(notes, "study/spring", { title: "API de tarefas", description: "x".repeat(400) }, "## Goal\n", "2026-10-01");
    expect(a.path).toBe("study/spring/workbench/api-de-tarefas/project.md");
    expect(String(a.data.description).length).toBe(DESCRIPTION_MAX);
    const b = await createProject(notes, "study/spring", { title: "Blog" }, "", "2026-10-02");
    await notes.patchHeader(b.path, { ...statusPatch("active"), github: "https://github.com/x/blog", drawio: "https://app.diagrams.net/#Gx" });
    await saveLinks(notes, "study/spring/workbench/blog", [{ title: "Docs", url: "https://spring.io", note: "", kind: "" as const }]);
    await addProjectFile(notes, "study/spring/workbench/blog", "modelo.drawio", new Uint8Array([60]));

    const [s] = await loadSubjects(notes);
    expect(s.workbench.map(p => [p.title, p.status])).toEqual([
      ["Blog", "active"],
      ["API de tarefas", "planning"],
    ]);
    const blog = s.workbench[0];
    expect(blog.github).toBe("https://github.com/x/blog");
    expect(blog.drawio).toBe("https://app.diagrams.net/#Gx");
    expect(blog.links.map(l => l.url)).toEqual(["https://spring.io"]);
    expect(blog.files).toEqual(["modelo.drawio"]);
    expect(blog.started).toBe("2026-10-02");
    expect(s.workbench[1].hasNotes).toBe(true);
    expect(statusPatch("done", "2026-10-20")).toEqual({ status: "done", finished: "2026-10-20" });
    expect(statusPatch("active")).toEqual({ status: "active", finished: undefined });
  });
});

describe("project guides", () => {
  it("write each heading with its hint, and the hints come out in one go", async () => {
    const { GUIDES, guideBody, guideOf, stripComments } = await import("../src/data/guides");
    const pick = (w: { en: string }) => w.en;
    const body = guideBody(guideOf("small"), pick);
    expect(body.startsWith("## Goal\n\n%% ")).toBe(true);
    expect(body).toContain("## Steps\n\n%% ");
    expect(body).toContain("- [ ] ");
    const clean = stripComments(body);
    expect(clean).not.toContain("%%");
    expect(clean).toBe("## Goal\n\n## Input and output\n\n## Steps\n\n- [ ] \n\n## What I learned\n\n");
    expect(stripComments("text %%inline%% more\n")).toBe("text more\n");
    expect(new Set(GUIDES.map(g => g.id)).size).toBe(GUIDES.length);
    expect(guideOf("nope").id).toBe("standard");
  });
});
