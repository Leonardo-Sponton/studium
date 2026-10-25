import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createStudyNote, createSubject, filterStudyNotes, isFreeNote, isNotebookNote, loadSubjects, removeSubjectCover, setSubjectCover } from "../src/data/study";
import { isHub } from "../src/ui/study/SubjectPage";

describe("a subject that only holds others", () => {
  it("is an index until something of its own is added", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "Java" });
    let all = await loadSubjects(notes);
    const java = () => all.find(s => s.title === "Java")!;
    expect(isHub(all, java())).toBe(false); // nothing inside yet: a subject to fill
    await createSubject(notes, { title: "00. Básico", parent: java().slug });
    all = await loadSubjects(notes);
    expect(isHub(all, java())).toBe(true);
    await notes.save(await notes.load(java().path), (await notes.load(java().path)).data, "Java em minhas palavras");
    all = await loadSubjects(notes);
    expect(isHub(all, java())).toBe(true); // its own words don't make it a subject to study
    await createStudyNote(notes, java().dir, { title: "Visão geral" });
    all = await loadSubjects(notes);
    expect(isHub(all, java())).toBe(false);
  });

  it("follows the type chosen for it, whatever is inside", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "C", kind: "hub" });
    await createSubject(notes, { title: "Docker", kind: "study" });
    let all = await loadSubjects(notes);
    const by = (t: string) => all.find(s => s.title === t)!;
    expect(by("C").kind).toBe("hub");
    expect(isHub(all, by("C"))).toBe(true); // a hub from the start, still empty
    await createSubject(notes, { title: "Compose", parent: by("Docker").slug });
    await createStudyNote(notes, by("C").dir, { title: "Visão geral" });
    all = await loadSubjects(notes);
    expect(isHub(all, by("C"))).toBe(true); // a note kept in it doesn't change it
    expect(isHub(all, by("Docker"))).toBe(false); // a study folder with a sub-subject stays one
  });

  it("keeps a cover of its own in its folder", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "Java", kind: "hub" });
    const dir = () => all.find(s => s.title === "Java")!.dir;
    let all = await loadSubjects(notes);
    expect(all[0].cover).toBe("");
    await setSubjectCover(notes.storage, dir(), ".png", new Uint8Array([1, 2]));
    await setSubjectCover(notes.storage, dir(), ".jpg", new Uint8Array([3])); // replaces the png
    all = await loadSubjects(notes);
    expect(all[0].cover).toBe(`${dir()}/cover.jpg`);
    expect((await notes.storage.list(dir())).filter(f => f.name.startsWith("cover"))).toHaveLength(1);
    await removeSubjectCover(notes.storage, dir());
    all = await loadSubjects(notes);
    expect(all[0].cover).toBe("");
  });
});

describe("notebook notes", () => {
  it("are not standalone notes", async () => {
    const notes = new Notes(new MemoryStorage());
    await createSubject(notes, { title: "C" });
    await createStudyNote(notes, "study/c", { title: "Ponteiros soltos" }, new Date(2026, 9, 1));
    await createStudyNote(notes, "study/c", { title: "01. Variáveis" }, new Date(2026, 9, 2));
    await createStudyNote(notes, "study/c", { title: "00. Introdução a Linguagem C" }, new Date(2026, 9, 3));
    const [s] = await loadSubjects(notes);
    expect(s.notes.map(n => [n.title, isNotebookNote(n), isFreeNote(n)])).toEqual([
      ["Ponteiros soltos", false, true],
      ["01. Variáveis", true, false],
      ["00. Introdução a Linguagem C", true, false],
    ]);
    expect(filterStudyNotes(s, "", "notebook", "chapter").map(n => n.title)).toEqual(["00. Introdução a Linguagem C", "01. Variáveis"]);
    expect(filterStudyNotes(s, "", "", "chapter").map(n => n.title)).toEqual(["00. Introdução a Linguagem C", "01. Variáveis", "Ponteiros soltos"]);
  });
});
