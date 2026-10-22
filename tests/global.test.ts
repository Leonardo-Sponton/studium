import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { deleteForever, emptyTrash, listTrash, moveToTrash, restore, restoreFromTrash } from "../src/data/trash";
import { fold, loadDocs, search } from "../src/data/search";
import { BEFORE_RESTORE, BackupError, exportBackup, readBackup, restoreBackup } from "../src/data/backup";
import { SETTINGS_PATH } from "../src/data/settings";

const SAT = new Date(2026, 9, 17, 9, 30);
const text = (s: MemoryStorage, p: string) => s.read(p);

describe("trash", () => {
  it("moves, lists with time and origin, restores", async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "A");
    await s.write("inbox/b.md", "B");
    const ta = await moveToTrash(s, "todo/a.md", SAT);
    await moveToTrash(s, "inbox/b.md", new Date(2026, 9, 17, 10, 0));
    expect(ta).toBe(".trash/todo/a.md");
    const list = await listTrash(s);
    expect(list.map(t => [t.from, t.at])).toEqual([
      ["inbox/b.md", "2026-10-17T10:00"],
      ["todo/a.md", "2026-10-17T09:30"],
    ]);
    expect(await restore(s, list[1])).toBe("todo/a.md");
    expect(await text(s, "todo/a.md")).toBe("A");
    expect((await listTrash(s)).length).toBe(1);
  });

  it("keeps two deleted files with the same name apart", async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "1");
    await moveToTrash(s, "todo/a.md");
    await s.write("todo/a.md", "2");
    expect(await moveToTrash(s, "todo/a.md")).toBe(".trash/todo/a-2.md");
    expect((await listTrash(s)).map(t => t.from)).toEqual(["todo/a.md", "todo/a.md"]);
  });

  it("restores next to a new file that took the old name", async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "old");
    await moveToTrash(s, "todo/a.md");
    await s.write("todo/a.md", "new");
    const [item] = await listTrash(s);
    expect(await restore(s, item)).toBe("todo/a-2.md");
    expect(await text(s, "todo/a.md")).toBe("new");
    expect(await text(s, "todo/a-2.md")).toBe("old");
  });

  it("undo refuses to overwrite", async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "old");
    const t = await moveToTrash(s, "todo/a.md");
    await s.write("todo/a.md", "new");
    await expect(restoreFromTrash(s, t, "todo/a.md")).rejects.toThrow();
  });

  it("guesses the origin of files moved in by hand", async () => {
    const s = new MemoryStorage();
    await s.write(".trash/ideas/x-3.md", "X");
    expect((await listTrash(s))[0]).toMatchObject({ from: "ideas/x.md", at: "" });
  });

  it("deletes forever and empties", async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "A");
    await s.write("todo/b.md", "B");
    await moveToTrash(s, "todo/a.md");
    await moveToTrash(s, "todo/b.md");
    await deleteForever(s, (await listTrash(s))[0]);
    expect((await listTrash(s)).length).toBe(1);
    await emptyTrash(s);
    expect(await listTrash(s)).toEqual([]);
    expect([...s.files.keys()].some(p => p.startsWith(".trash"))).toBe(false);
  });
});

describe("search", () => {
  const setup = async () => {
    const s = new MemoryStorage();
    const notes = new Notes(s);
    await s.write("todo/1.md", "---\ntype: todo\nmodified: 2026-10-16T10:00\n---\n# Ligar para a Ana\n\nSobre a reunião de amanhã.\n");
    await s.write("inbox/2.md", "---\ntype: inbox\nmodified: 2026-01-02T10:00\n---\nA long note that mentions Ana somewhere in the middle of the text.\n");
    await s.write("ideas/3.md", "---\nmodified: 2026-10-17T08:00\n---\n# Café app\n");
    await s.write(".trash/todo/4.md", "# Ana in the trash\n");
    await s.write(".studium/settings.json", "{}");
    return loadDocs(notes);
  };

  it("folds accents and case, keeping positions", () => {
    expect(fold("ÁrvoRe é").folded).toBe("arvore e");
    expect(fold("ação").map).toEqual([0, 1, 2, 3]);
  });

  it("skips trash and app files", async () => {
    expect((await setup()).map(d => d.path).sort()).toEqual(["ideas/3.md", "inbox/2.md", "todo/1.md"]);
  });

  it("ignores accents and case; title matches first", async () => {
    const docs = await setup();
    expect(search(docs, "cafe").map(h => h.doc.path)).toEqual(["ideas/3.md"]);
    expect(search(docs, "REUNIAO").map(h => h.doc.path)).toEqual(["todo/1.md"]);
    expect(search(docs, "ana").map(h => h.doc.path)).toEqual(["todo/1.md", "inbox/2.md"]);
  });

  it("needs every word", async () => {
    const docs = await setup();
    expect(search(docs, "ana amanha").map(h => h.doc.path)).toEqual(["todo/1.md"]);
    expect(search(docs, "ana zebra")).toEqual([]);
    expect(search(docs, "   ")).toEqual([]);
  });

  it("filters by area and date", async () => {
    const docs = await setup();
    expect(search(docs, "ana", { area: "inbox" }).map(h => h.doc.path)).toEqual(["inbox/2.md"]);
    expect(search(docs, "ana", { since: "month", today: SAT }).map(h => h.doc.path)).toEqual(["todo/1.md"]);
  });

  it("gives a snippet with the original text of the match", async () => {
    const docs = await setup();
    const [hit] = search(docs, "reuniao");
    expect(hit.snippet).toEqual({ before: "Sobre a ", match: "reunião", after: " de amanhã." });
  });
});

describe("backup", () => {
  const setup = async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "A");
    await s.writeBinary("books/x/cover.jpg", new Uint8Array([1, 2, 3]));
    await s.write(SETTINGS_PATH, '{"theme":"light"}');
    await s.write(".studium/lists.json", "[1]");
    await s.write(".trash/inbox/z.md", "Z");
    return s;
  };

  it("round-trips every file", async () => {
    const s = await setup();
    const b = readBackup(await exportBackup(s, SAT));
    expect(b.created).toBe("2026-10-17T09:30");
    expect([...b.files.keys()].sort()).toEqual(
      [".studium/lists.json", SETTINGS_PATH, ".trash/inbox/z.md", "books/x/cover.jpg", "todo/a.md"].sort(),
    );
    expect([...b.files.get("books/x/cover.jpg")!]).toEqual([1, 2, 3]);
  });

  it("refuses files that are not backups", () => {
    expect(() => readBackup(new Uint8Array([1, 2, 3]))).toThrow(BackupError);
    expect(() => readBackup(zipSync({ "a.md": new Uint8Array([65]) }))).toThrow(/not a Studium backup/);
    const manifest = new TextEncoder().encode('{"app":"studium"}');
    expect(() => readBackup(zipSync({ "studium-backup.json": manifest, "../evil.md": new Uint8Array([65]) }))).toThrow(
      /unsafe path/,
    );
  });

  it("restores, keeping device settings and the old data aside", async () => {
    const s = await setup();
    const b = readBackup(await exportBackup(s));
    // Things change after the backup.
    await s.write("todo/a.md", "changed");
    await s.write("todo/new.md", "N");
    await s.write(SETTINGS_PATH, '{"theme":"dark"}');
    await restoreBackup(s, b);
    expect(await text(s, "todo/a.md")).toBe("A");
    expect(await s.stat("todo/new.md")).toBeNull();
    expect(await text(s, ".studium/lists.json")).toBe("[1]");
    expect(await text(s, SETTINGS_PATH)).toBe('{"theme":"dark"}');
    expect(await text(s, `${BEFORE_RESTORE}/todo/a.md`)).toBe("changed");
    expect(await text(s, `${BEFORE_RESTORE}/todo/new.md`)).toBe("N");
    expect(await text(s, `${BEFORE_RESTORE}/.studium/lists.json`)).toBe("[1]");
    // A second restore replaces the old before-restore and never puts it in a backup.
    const again = readBackup(await exportBackup(s));
    expect([...again.files.keys()].some(p => p.startsWith(BEFORE_RESTORE))).toBe(false);
    await restoreBackup(s, again);
    expect(await s.stat(`${BEFORE_RESTORE}/todo/new.md`)).toBeNull();
    expect(await text(s, `${BEFORE_RESTORE}/todo/a.md`)).toBe("A");
  });
});
