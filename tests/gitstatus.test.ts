import { describe, expect, it } from "vitest";
import { buildTree, groupFiles, newRepoId, parseBranches, parseLog, parseStatus, type TreeNode } from "../src/data/gitstatus";

// Real output of `git status --porcelain=v2 --branch -z` (NULs written as |).
const STATUS = [
  "# branch.oid 55a30208a68c31763ae1e9d2785d8594b66065df",
  "# branch.head main",
  "# branch.upstream origin/main",
  "# branch.ab +1 -0",
  "1 .M N... 100644 100644 100644 7898192 7898192 a.txt",
  "1 MM N... 100644 100644 100644 6178079 7de6a6c b c.txt",
  "2 R. N... 100644 100644 100644 587be6b 587be6b R100 renamed file.txt",
  "new.txt",
  "u UU N... 100644 100644 100644 100644 aaa bbb ccc both.txt",
  "? novo.txt",
  "",
].join("\0");

describe("git status", () => {
  it("reads branch, upstream, ahead/behind and every kind of file", () => {
    const s = parseStatus(STATUS);
    expect(s).toMatchObject({ branch: "main", initial: false, upstream: "origin/main", ahead: 1, behind: 0 });
    expect(s.files).toEqual([
      { path: "a.txt", staged: "", changed: "M" },
      { path: "b c.txt", staged: "M", changed: "M" },
      { path: "renamed file.txt", from: "new.txt", staged: "R", changed: "" },
      { path: "both.txt", staged: "U", changed: "U", conflict: true },
      { path: "novo.txt", staged: "", changed: "", untracked: true },
    ]);
    const g = groupFiles(s.files);
    expect(g.staged.map(f => f.path)).toEqual(["b c.txt", "renamed file.txt"]);
    expect(g.changed.map(f => f.path)).toEqual(["a.txt", "b c.txt"]);
    expect(g.untracked.map(f => f.path)).toEqual(["novo.txt"]);
    expect(g.conflicts.map(f => f.path)).toEqual(["both.txt"]);
  });

  it("new repository, detached head, no upstream, clean", () => {
    expect(parseStatus("# branch.oid (initial)\0# branch.head main\0")).toMatchObject({ initial: true, branch: "main", upstream: null, files: [] });
    expect(parseStatus("# branch.oid abc\0# branch.head (detached)\0").branch).toBeNull();
    expect(parseStatus("")).toMatchObject({ branch: null, ahead: 0, behind: 0, files: [] });
  });

  it("log, with branch decorations and author", () => {
    const out =
      "55a3020\x1fsecond: a | b\x1f2026-10-26T15:25:18-03:00\x1fHEAD -> main\x1fAna\x1e\n" +
      "1d0815f\x1ffirst\x1f2026-10-25T10:00:00-03:00\x1forigin/main, origin/HEAD, tag: v1\x1fAna\x1e\n";
    expect(parseLog(out)).toEqual([
      { hash: "55a3020", subject: "second: a | b", date: "2026-10-26T15:25:18-03:00", refs: ["HEAD -> main"], author: "Ana" },
      { hash: "1d0815f", subject: "first", date: "2026-10-25T10:00:00-03:00", refs: ["origin/main", "tag: v1"], author: "Ana" },
    ]);
    expect(parseLog("")).toEqual([]);
  });

  it("branches: local first, current on top, symbolic refs left out", () => {
    const rec = (...f: string[]) => f.join("\x1f") + "\x1e\n";
    const out =
      rec("refs/heads/docs", " ", "", "", "2026-10-20T10:00:00-03:00", "docs", "") +
      rec("refs/heads/main", "*", "origin/main", "[ahead 1, behind 2]", "2026-10-26T15:25:18-03:00", "second", "") +
      rec("refs/heads/old", " ", "origin/old", "[gone]", "2026-10-01T10:00:00-03:00", "x", "") +
      rec("refs/remotes/origin/HEAD", " ", "", "", "2026-10-26T15:25:18-03:00", "first", "refs/remotes/origin/main") +
      rec("refs/remotes/origin/main", " ", "", "", "2026-10-26T15:25:18-03:00", "first", "");
    const b = parseBranches(out);
    expect(b.map(x => x.name)).toEqual(["main", "docs", "old", "origin/main"]);
    expect(b[0]).toMatchObject({ current: true, upstream: "origin/main", ahead: 1, behind: 2, remote: false });
    expect(b[2].gone).toBe(true);
    expect(b[3].remote).toBe(true);
  });

  it("file tree: folders first, changes marked up to the root", () => {
    const ls = ["pom.xml", "src/main/App.java", "src/main/dao/Dao.java", "README.md", "docs/a.md", "docs/b/c.md"].join("\0") + "\0";
    const st = parseStatus("1 .M N... 100644 100644 100644 a b src/main/App.java\0? docs/\0");
    const t = buildTree(ls, st.files);
    const names = (n: TreeNode) => n.children.map(c => c.name + (c.dir ? "/" : ""));
    expect(names(t)).toEqual(["docs/", "src/", "pom.xml", "README.md"]);
    const src = t.children.find(c => c.name === "src")!;
    const main = src.children[0];
    expect(names(main)).toEqual(["dao/", "App.java"]);
    expect(main.children.find(c => c.name === "App.java")!.code).toBe("M");
    expect(src.changed && t.changed).toBe(true);
    const docs = t.children[0];
    expect(docs.children.find(c => c.name === "a.md")!.code).toBe("?");
    expect(docs.children[0].children[0].code).toBe("?");
    expect(main.children[0].changed).toBeUndefined();
  });

  it("project ids pass the main process check", () => {
    for (let i = 0; i < 20; i++) expect(newRepoId()).toMatch(/^[a-z0-9]{8,32}$/);
  });
});
