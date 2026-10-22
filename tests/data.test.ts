import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { parse, stringify, titleOf, withTitle } from "../src/data/frontmatter";
import { ConflictError, Notes } from "../src/data/notes";
import { parseLocal, slugify } from "../src/data/dates";
import { checkPath } from "../src/storage/types";

describe("frontmatter", () => {
  const file = `---
type: todo
# a hand-written comment
status: open
mine: [a, b]   # unknown key
created: 2026-10-17T21:52
---
# Buy milk

notes
`;

  it("reads header and body; dates stay strings", () => {
    const p = parse(file);
    expect(p.data).toEqual({ type: "todo", status: "open", mine: ["a", "b"], created: "2026-10-17T21:52" });
    expect(p.body).toBe("# Buy milk\n\nnotes\n");
    expect(titleOf(p.body)).toBe("Buy milk");
  });

  it("keeps unknown keys, order and comments when one key changes", () => {
    const p = parse(file);
    const out = stringify({ ...p.data, status: "done" }, p.body, p);
    // Only the spacing before a comment may change.
    expect(out).toBe(file.replace("status: open", "status: done").replace("]   #", "] #"));
  });

  it("unchanged data gives the same text", () => {
    const p = parse(file);
    expect(stringify(p.data, p.body, p)).toBe(file);
  });

  it("removes keys that are missing or undefined, adds new ones at the end", () => {
    const p = parse(file);
    const { mine: _m, ...rest } = p.data;
    const out = parse(stringify({ ...rest, status: undefined, due: "2026-10-20" }, p.body, p));
    expect(out.data).toEqual({ type: "todo", created: "2026-10-17T21:52", due: "2026-10-20" });
  });

  it("quotes times so YAML 1.1 readers do not see numbers", () => {
    expect(stringify({ time: "17:00", n: "12" }, "")).toBe('---\ntime: "17:00"\nn: "12"\n---\n');
  });

  it("a file without header, or with a broken one, keeps all its text as body", () => {
    expect(parse("# Hi\n").body).toBe("# Hi\n");
    const broken = "---\ntype: [oops\n---\ntext\n";
    expect(parse(broken)).toMatchObject({ data: {}, body: broken });
  });

  it("titles", () => {
    expect(titleOf("intro\n# A long title #\n")).toBe("A long title");
    expect(withTitle("# Old\n\nbody", "New")).toBe("# New\n\nbody");
    expect(withTitle("body", "New")).toBe("# New\n\nbody");
  });
});

describe("notes", () => {
  it("create, load, save with read-back", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await notes.create("todo/a.md", { type: "todo", status: "open" }, "# A\n");
    expect(n.data.type).toBe("todo");
    expect(n.data.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const saved = await notes.save(n, { ...n.data, status: "done" }, n.body);
    expect((await notes.load("todo/a.md")).data.status).toBe("done");
    expect(saved.text).toBe(await notes.storage.read("todo/a.md"));
    await expect(notes.create("todo/a.md", {}, "")).rejects.toThrow("already exists");
  });

  it("detects a change made outside the app", async () => {
    const s = new MemoryStorage();
    const notes = new Notes(s);
    const n = await notes.create("todo/a.md", { type: "todo" }, "# A\n");
    await s.write("todo/a.md", "---\ntype: todo\n---\n# Changed elsewhere\n");
    await expect(notes.save(n, n.data, "# Mine\n")).rejects.toBeInstanceOf(ConflictError);
    await notes.save(n, n.data, "# Mine\n", { force: true });
    expect(titleOf((await notes.load("todo/a.md")).body)).toBe("Mine");
  });

  it("keep both writes a copy", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await notes.create("todo/a.md", { type: "todo" }, "# A\n");
    const c = await notes.saveCopy(n, n.data, "# Mine\n");
    expect(c.path).toBe("todo/a (my copy).md");
    expect((await notes.saveCopy(n, n.data, "x")).path).toBe("todo/a (my copy 2).md");
  });

  it("free paths", async () => {
    const notes = new Notes(new MemoryStorage());
    await notes.create("ideas/x.md", {}, "");
    expect(await notes.freePath("ideas", "x")).toBe("ideas/x-2.md");
  });
});

describe("memory storage", () => {
  it("lists files and folders, moves folders", async () => {
    const s = new MemoryStorage();
    await s.write("books/a/book.md", "1");
    await s.write("books/a/quotes/q.md", "2");
    await s.write("books/b.md", "3");
    expect((await s.list("books")).map(f => [f.name, f.isDir]).sort()).toEqual([["a", true], ["b.md", false]]);
    await s.move("books/a", ".trash/books/a");
    expect(await s.read(".trash/books/a/quotes/q.md")).toBe("2");
    expect(await s.list("nothing")).toEqual([]);
  });

  it("refuses paths that leave the data folder", () => {
    expect(() => checkPath("../x")).toThrow();
    expect(() => checkPath("/etc/passwd")).toThrow();
    expect(checkPath("a/b.md")).toBe("a/b.md");
  });
});

describe("dates", () => {
  it("slugs", () => {
    expect(slugify("Ação rápida: comprar pão!")).toBe("acao-rapida-comprar-pao");
    expect(slugify("x".repeat(60)).length).toBe(40);
    expect(slugify("!!!")).toBe("untitled");
  });

  it("parses local dates and rejects invalid ones", () => {
    expect(parseLocal("2026-10-17T21:52")?.getHours()).toBe(21);
    expect(parseLocal("2026-02-30")).toBeNull();
    expect(parseLocal("someday")).toBeNull();
  });
});
