import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { POINT_CALLOUTS, POINT_KINDS, reviewPoints, scheduleNote, sectionsOf, sortPoints } from "../src/data/recall";
import { demoteHeadings, importFolder, nextChapterPrefix, notebookAt, notebookBody, notebookOf, orderOf, relativePaths, setFinished, setNotebookAt, todayPicks } from "../src/data/notebook";
import { createStudyNote, createSubject, loadSubjects } from "../src/data/study";
import type { PickedFile } from "../src/data/drawings";

const NOTE = [
  "# 08. Transações em JDBC",
  "",
  "Intro text.",
  "",
  "## Transações",
  "",
  "Uma transação é um grupo de comandos.",
  "",
  "> **Conceito**",
  "> ",
  "> Quatro garantias: **ACID**.",
  "",
  "### Rollback",
  "",
  "```java",
  "// ⚠️ check-then-act",
  "> **Atenção** not a callout inside code",
  "```",
  "",
  "> ⚠️**Ponto de Atenção**⚠️ cuidado com autoCommit",
  "",
  "**Importante:** a transação é da Connection.",
  "",
  "Obs. Characters são unsigned.",
  "",
  "> [!dificuldade] Savepoint",
  "> Não entendi bem quando usar.",
  "",
  "> Só uma citação qualquer.",
  "",
  "## Resumindo",
  "",
  "| a | b |",
  "| - | - |",
  "",
  "**Resumindo**",
  "",
  "- item",
].join("\n");

describe("review points", () => {
  it("finds the callouts the notes already have, not code or plain quotes", () => {
    const p = reviewPoints(NOTE);
    expect(p.map(x => [x.kind, x.label, x.section])).toEqual([
      ["concept", "Conceito", "Transações"],
      ["attention", "Ponto de Atenção", "Rollback"],
      ["important", "Importante", "Rollback"],
      ["note", "Obs", "Rollback"],
      ["difficulty", "Savepoint", "Rollback"],
      ["summary", "Resumindo", "Resumindo"],
      ["summary", "Resumindo", "Resumindo"],
    ]);
    expect(p[0].text).toBe("**Conceito**\n\nQuatro garantias: **ACID**.");
    expect(p.at(-1)!.text).toBe("**Resumindo**\n\n- item");
    expect(sortPoints(p)[0].kind).toBe("difficulty");
  });
});

describe("points written with /", () => {
  it("reads back as the kind it was written as", () => {
    for (const k of POINT_KINDS) {
      const [p] = reviewPoints(`## A\n\n> [!${POINT_CALLOUTS[k]}] Título\n> texto`);
      expect([p.kind, p.label, p.text]).toEqual([k, "Título", `[!${POINT_CALLOUTS[k]}] Título\ntexto`]);
    }
  });
});

describe("sections", () => {
  it("cuts a note at its headings, the title line left out", () => {
    const s = sectionsOf(NOTE);
    expect(s.map(x => [x.level, x.title])).toEqual([
      [0, ""],
      [2, "Transações"],
      [3, "Rollback"],
      [2, "Resumindo"],
    ]);
    expect(s[0].text).toBe("Intro text.");
    expect(s[1].points.map(p => p.kind)).toEqual(["concept"]);
    expect(s[2].points.map(p => p.kind)).toEqual(["attention", "important", "note", "difficulty"]);
    expect(s[2].text.startsWith("```java")).toBe(true);
  });

  it("keeps a note with no headings as one block", () => {
    expect(sectionsOf("Just text\nmore").map(x => [x.level, x.text])).toEqual([[0, "Just text\nmore"]]);
  });
});

describe("whole-note review", () => {
  const today = "2026-10-24";
  it("starts at 1, 3 or 5 days and then grows", () => {
    expect(scheduleNote(undefined, "forgot", today).due).toBe("2026-10-25");
    expect(scheduleNote(undefined, "partly", today).due).toBe("2026-10-27");
    const r = scheduleNote(undefined, "remembered", today);
    expect(r).toEqual({ due: "2026-10-29", interval: 5, ease: 250 });
    expect(scheduleNote(r, "remembered", today).interval).toBe(13);
    expect(scheduleNote(r, "forgot", today)).toEqual({ due: "2026-10-25", interval: 1, ease: 230 });
  });
});

const file = (path: string, text: string): PickedFile => ({ path, read: async () => new TextEncoder().encode(text) });

describe("notebook", () => {
  it("reads the chapter number of a title", () => {
    expect(orderOf("08. Transações em JDBC")).toBe(8);
    expect(orderOf("3) Joins")).toBe(3);
    expect(orderOf("10 - Exceptions")).toBe(10);
    expect(orderOf("2026 plans")).toBeNull();
    expect(orderOf("JDBC")).toBeNull();
  });

  it("puts the file name on top as the title, header dropped", () => {
    expect(notebookBody("---\nCategoria: Java\n---\n## Transações\n\ntext", "08. Transações")).toBe("# 08. Transações\n\n## Transações\n\ntext\n");
    expect(notebookBody("# 08. Transações\n\ntext\n", "08. Transações")).toBe("# 08. Transações\n\ntext\n");
    expect(demoteHeadings("# A\n```\n# code\n```\n###### deep")).toBe("## A\n```\n# code\n```\n###### deep");
  });

  it("drops the folder's own name and hidden folders", () => {
    const r = relativePaths([file("JDBC/01. B.md", ""), file("JDBC/00. A.md", ""), file("JDBC/.obsidian/x.json", "")]);
    expect(r.root).toBe("JDBC");
    expect(r.files.map(x => x.rel)).toEqual(["00. A.md", "01. B.md"]);
  });

  it("brings a folder in as notebook, sub-folders as sub-subjects, the summary as own words", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "Java" });
    let [java] = await loadSubjects(notes);
    const picked = [
      file("Java/01. OOP/00. Classes e Objetos.md", "## Classe\n\ntexto"),
      file("Java/01. OOP/Composição_.md", ""),
      file("Java/00. Intro.md", "texto"),
      file("Java/_meuResumo.md", "Java em minhas palavras"),
      file("Java/img/diagram.png", "png"),
    ];
    const r = await importFolder(notes, java, [java], picked, "notebook");
    expect(r).toMatchObject({ notes: 3, subjects: 1, summary: true, files: 1, skipped: [] });
    const all = await loadSubjects(notes);
    java = all.find(s => s.title === "Java")!;
    const oop = all.find(s => s.title === "01. OOP")!;
    expect(oop.parent).toBe(java.slug);
    expect(java.hasSummary).toBe(true);
    expect(notebookOf(oop).map(n => n.title)).toEqual(["00. Classes e Objetos"]);
    expect(oop.notes.find(n => n.title === "Composição_")!.empty).toBe(true);
    expect(nextChapterPrefix(oop)).toBe("01. ");
    expect(await notes.storage.stat("attachments/diagram.png")).toBeTruthy();

    // Again: nothing new.
    const again = await importFolder(notes, java, all, picked, "notebook");
    expect(again.notes).toBe(0);
    expect(again.subjects).toBe(0);
    expect(again.skipped.sort()).toEqual(["00. Classes e Objetos", "00. Intro", "Composição_"].sort());
  });

  it("brings a split handout in as one material, a chapter per file", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "SQL" });
    const [sql] = await loadSubjects(notes);
    await importFolder(notes, sql, [sql], [file("Apostila/02. Join.md", "# Join\n\n## Inner"), file("Apostila/01. Select.md", "Select text")], "material");
    const [after] = await loadSubjects(notes);
    expect(after.materials[0].title).toBe("Apostila");
    expect(after.materials[0].chapters.map(c => c.title)).toEqual(["01. Select", "02. Join"]);
  });

  it("remembers where the notebook stopped and picks at most three things", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "JDBC" });
    const long = "texto ".repeat(100);
    const a = await createStudyNote(notes, "study/jdbc", { title: "00. Intro" });
    await notes.save(a, { ...a.data, modified: "2026-10-15T10:00" }, `# 00. Intro\n\n${long}`, { touch: false });
    const b = await createStudyNote(notes, "study/jdbc", { title: "01. Conexão" });
    await notes.save(b, b.data, `# 01. Conexão\n\n${long}`);
    await createStudyNote(notes, "study/jdbc", { title: "02. Statement" });
    let [s] = await loadSubjects(notes);
    expect(notebookAt(s)).toBeNull();
    await setNotebookAt(notes, s, b.path);
    [s] = await loadSubjects(notes);
    expect(notebookAt(s)?.title).toBe("01. Conexão");
    const picks = todayPicks([s], "2026-10-24");
    expect(picks.map(p => [p.kind, "note" in p ? p.note.title : ""])).toEqual([
      ["continue-notebook", "01. Conexão"],
      ["recall", "00. Intro"],
      ["todo", "02. Statement"],
    ]);
  });

  it("goes on to the next chapter not finished", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "JDBC" });
    const a = await createStudyNote(notes, "study/jdbc", { title: "00. Intro" });
    await notes.save(a, a.data, "# 00. Intro\n\ntexto");
    await createStudyNote(notes, "study/jdbc", { title: "01. Conexão" });
    let [s] = await loadSubjects(notes);
    await setNotebookAt(notes, s, a.path);
    await setFinished(notes, a.path, true);
    [s] = await loadSubjects(notes);
    expect(s.notes.find(n => n.title === "00. Intro")!.finished).toBe(true);
    // The chapter stopped at is finished: no "continue" on it, the next one is to write.
    expect(todayPicks([s], "2026-10-24").map(p => [p.kind, "note" in p ? p.note.title : ""])).toEqual([["todo", "01. Conexão"]]);
    await setFinished(notes, a.path, false);
    [s] = await loadSubjects(notes);
    expect(s.notes.find(n => n.title === "00. Intro")!.finished).toBe(false);
  });
});
