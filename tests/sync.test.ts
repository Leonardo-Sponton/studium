import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { listTrash } from "../src/data/trash";
import { diffLines } from "../src/data/diff";
import {
  canKeepBoth,
  type Choice,
  DEVICE_LAST,
  isSynced,
  loadDeviceLast,
  loadLast,
  LOCK_PATH,
  plan,
  run,
  storageHashes,
  syncDevice,
  type Hashes,
  type Side,
} from "../src/data/sync";

const h = (o: Record<string, string>): Hashes => new Map(Object.entries(o));
const side = (s: MemoryStorage): Side => ({ storage: s, hashes: () => storageHashes(s) });
const target = { serial: "R5", model: "SM-X000", pcName: "notebook" };

async function pair(files: Record<string, string>) {
  const pc = new MemoryStorage();
  const dev = new MemoryStorage();
  for (const [p, t] of Object.entries(files)) {
    await pc.write(p, t);
    await dev.write(p, t);
  }
  return { pc, dev };
}

const sync = (pc: MemoryStorage, dev: MemoryStorage, choices?: Record<string, Choice>) =>
  syncDevice(side(pc), side(dev), target, undefined, 0, choices && (async () => new Map(Object.entries(choices))));

describe("sync plan (SPEC 6.2)", () => {
  it("follows the decision table, row by row", () => {
    const base = h({ same: "1", pcEdit: "1", devEdit: "1", both: "1", bothSame: "1", pcDel: "1", devDel: "1", delEdit: "1", editDel: "1", allDel: "1" });
    const pc = h({ same: "1", pcEdit: "2", devEdit: "1", both: "2", bothSame: "2", devDel: "1", editDel: "2", pcNew: "1", newBoth: "1" });
    const dev = h({ same: "1", pcEdit: "1", devEdit: "2", both: "3", bothSame: "2", pcDel: "1", delEdit: "2", devNew: "1", newBoth: "2" });
    const kinds = Object.fromEntries(plan(pc, dev, base).map(s => [s.path, s.kind]));
    expect(kinds).toEqual({
      same: "same",
      pcEdit: "toDevice",
      pcNew: "toDevice",
      devEdit: "toPC",
      devNew: "toPC",
      both: "conflict",
      bothSame: "same",
      newBoth: "conflict",
      pcDel: "trashDevice",
      devDel: "trashPC",
      delEdit: "conflict",
      editDel: "conflict",
      allDel: "gone",
    });
  });

  it("leaves per-device files out", () => {
    expect(isSynced("todo/a.md")).toBe(true);
    expect(isSynced(".studium/lists.json")).toBe(true);
    for (const p of [".trash/todo/a.md", ".studium/settings.json", LOCK_PATH, DEVICE_LAST, ".studium/sync/R5.json", ".studium/before-restore/todo/a.md", "todo/a.md.tmp-123"])
      expect(isSynced(p)).toBe(false);
  });
});

describe("sync run", () => {
  it("first sync: copies what is missing, both ways; different files are conflicts", async () => {
    const { pc, dev } = await pair({ "todo/a.md": "a" });
    await pc.write("todo/pc.md", "pc");
    await dev.write("inbox/dev.md", "dev");
    await dev.writeBinary("books/x/cover.jpg", new Uint8Array([1, 2, 3]));
    await pc.write("ideas/i.md", "pc version");
    await dev.write("ideas/i.md", "device version");
    await dev.write(".studium/settings.json", '{"theme":"light"}');

    const r = await sync(pc, dev);
    expect(r.counts).toEqual({ toDevice: 1, toPC: 2, trashDevice: 0, trashPC: 0 });
    expect(await dev.read("todo/pc.md")).toBe("pc");
    expect(await pc.read("inbox/dev.md")).toBe("dev");
    expect([...(await pc.readBinary("books/x/cover.jpg"))]).toEqual([1, 2, 3]);
    expect(r.conflicts.map(c => c.path)).toEqual(["ideas/i.md"]);
    // A conflict is never overwritten.
    expect(await pc.read("ideas/i.md")).toBe("pc version");
    expect(await dev.read("ideas/i.md")).toBe("device version");
    // Settings are per device.
    expect(await pc.stat(".studium/settings.json")).toBeNull();
    // The lock is gone; both sides know the sync happened; a conflict is not in the state.
    expect(await dev.stat(LOCK_PATH)).toBeNull();
    const last = (await loadLast(pc, "R5"))!;
    expect(last.with).toBe("SM-X000");
    expect(Object.keys(last.files)).toEqual(["books/x/cover.jpg", "inbox/dev.md", "todo/a.md", "todo/pc.md"]);
    expect((await loadDeviceLast(dev))!.with).toBe("notebook");
  });

  it("second sync: edits travel, deletions go to the other side's trash", async () => {
    const { pc, dev } = await pair({ "todo/a.md": "a", "todo/b.md": "b", "todo/c.md": "c" });
    await sync(pc, dev);
    await pc.write("todo/a.md", "a2");
    await dev.write("todo/b.md", "b2");
    await pc.remove("todo/c.md");

    const r = await sync(pc, dev);
    expect(r.counts).toEqual({ toDevice: 1, toPC: 1, trashDevice: 1, trashPC: 0 });
    expect(await dev.read("todo/a.md")).toBe("a2");
    expect(await pc.read("todo/b.md")).toBe("b2");
    expect(await dev.stat("todo/c.md")).toBeNull();
    expect((await listTrash(dev)).map(t => t.from)).toEqual(["todo/c.md"]);
    expect(r.conflicts).toEqual([]);
    // Nothing left to do.
    expect((await sync(pc, dev)).counts).toEqual({ toDevice: 0, toPC: 0, trashDevice: 0, trashPC: 0 });
  });

  it("a book deleted on the device goes to the PC's trash as one item", async () => {
    const { pc, dev } = await pair({ "books/x/book.md": "x", "books/x/quotes/1.md": "q", "books/y/book.md": "y", "books/y/quotes/1.md": "q1", "books/y/quotes/2.md": "q2" });
    await sync(pc, dev);
    await dev.remove("books/x");
    await dev.remove("books/y/quotes/1.md");

    const r = await sync(pc, dev);
    expect(r.counts.trashPC).toBe(2);
    expect((await listTrash(pc)).map(t => t.from).sort()).toEqual(["books/x", "books/y/quotes/1.md"]);
    expect(await pc.read("books/y/quotes/2.md")).toBe("q2");
  });

  it("deleted on one side and edited on the other is a conflict, and stays one", async () => {
    const { pc, dev } = await pair({ "todo/a.md": "a" });
    await sync(pc, dev);
    await pc.remove("todo/a.md");
    await dev.write("todo/a.md", "edited");

    for (let i = 0; i < 2; i++) {
      const r = await sync(pc, dev);
      expect(r.conflicts).toEqual([{ path: "todo/a.md", kind: "conflict", pc: undefined, device: r.conflicts[0].device }]);
      expect(await dev.read("todo/a.md")).toBe("edited");
      expect((await loadLast(pc, "R5"))!.files["todo/a.md"]).toBeDefined();
    }
  });

  it("an interrupted sync finishes on the next one without conflicts", async () => {
    const { pc, dev } = await pair({});
    for (let i = 0; i < 5; i++) await pc.write(`todo/${i}.md`, `t${i}`);
    // Breaks on the third write to the device (the lock is the first).
    let writes = 0;
    const broken = { ...side(dev), storage: Object.create(dev) as MemoryStorage };
    broken.storage.writeBinary = async (p, d) => {
      if (++writes === 3) throw new Error("cable pulled");
      return dev.writeBinary(p, d);
    };
    await expect(syncDevice(side(pc), broken, target, undefined, 0)).rejects.toThrow("cable pulled");
    expect(await loadLast(pc, "R5")).toBeNull();

    const r = await sync(pc, dev);
    expect(r.conflicts).toEqual([]);
    expect(r.counts.toDevice).toBe(4);
    for (let i = 0; i < 5; i++) expect(await dev.read(`todo/${i}.md`)).toBe(`t${i}`);
    expect(await dev.stat(LOCK_PATH)).toBeNull();
  });

  it("refuses a file that changed while it was being copied", async () => {
    const { pc, dev } = await pair({});
    await pc.write("todo/a.md", "a");
    const sly: Side = {
      storage: pc,
      hashes: async () => {
        const out = await storageHashes(pc);
        await pc.write("todo/a.md", "typed meanwhile");
        return out;
      },
    };
    await expect(run(sly, side(dev), new Map())).rejects.toThrow("changed during the sync");
    expect(await dev.stat("todo/a.md")).toBeNull();
  });
});

describe("sync conflicts (SPEC 6.2)", () => {
  async function conflicted() {
    const { pc, dev } = await pair({ "todo/a.md": "a", "todo/gone.md": "g", "books/x/book.md": "x" });
    await sync(pc, dev);
    await pc.write("todo/a.md", "pc");
    await dev.write("todo/a.md", "device");
    await pc.remove("todo/gone.md");
    await dev.write("todo/gone.md", "edited");
    await pc.write("books/x/book.md", "pc book");
    await dev.write("books/x/book.md", "device book");
    return { pc, dev };
  }

  it("keep this PC's: copied over the device's; a deletion is repeated into the trash", async () => {
    const { pc, dev } = await conflicted();
    const r = await sync(pc, dev, { "todo/a.md": "pc", "todo/gone.md": "pc" });
    expect(r.settled).toBe(2);
    expect(r.conflicts.map(c => c.path)).toEqual(["books/x/book.md"]);
    expect(await dev.read("todo/a.md")).toBe("pc");
    expect(await dev.stat("todo/gone.md")).toBeNull();
    expect((await listTrash(dev)).map(t => t.from)).toEqual(["todo/gone.md"]);
    // Settled for good; the one left comes back.
    expect((await sync(pc, dev)).conflicts.map(c => c.path)).toEqual(["books/x/book.md"]);
  });

  it("keep the device's: the other way round", async () => {
    const { pc, dev } = await conflicted();
    const r = await sync(pc, dev, { "todo/a.md": "device", "todo/gone.md": "device", "books/x/book.md": "device" });
    expect(r.conflicts).toEqual([]);
    expect(await pc.read("todo/a.md")).toBe("device");
    expect(await pc.read("todo/gone.md")).toBe("edited");
    expect(await pc.read("books/x/book.md")).toBe("device book");
    const again = await sync(pc, dev);
    expect(again.conflicts).toEqual([]);
    expect(again.counts).toEqual({ toDevice: 0, toPC: 0, trashDevice: 0, trashPC: 0 });
  });

  it("keep both: the device's version becomes a (device copy) file on both sides", async () => {
    const { pc, dev } = await conflicted();
    await pc.write("todo/a (device copy).md", "an older copy");
    const r = await sync(pc, dev, { "todo/a.md": "both", "todo/gone.md": "both", "books/x/book.md": "both" });
    // Only where both files exist and the area can hold a second file.
    expect(r.settled).toBe(1);
    expect(r.conflicts.map(c => c.path)).toEqual(["books/x/book.md", "todo/gone.md"]);
    for (const s of [pc, dev]) {
      expect(await s.read("todo/a.md")).toBe("pc");
      expect(await s.read("todo/a (device copy 2).md")).toBe("device");
    }
    expect((await loadLast(pc, "R5"))!.files["todo/a (device copy 2).md"]).toBeDefined();
    expect((await sync(pc, dev)).conflicts).toHaveLength(2);
  });

  it("nothing is settled on a version that changed after it was shown", async () => {
    const { pc, dev } = await conflicted();
    const r = syncDevice(side(pc), side(dev), target, undefined, 0, async () => {
      await dev.write("todo/a.md", "edited meanwhile");
      return new Map([["todo/a.md", "pc" as Choice]]);
    });
    await expect(r).rejects.toThrow(/changed during the sync/);
    expect(await dev.read("todo/a.md")).toBe("edited meanwhile");
    expect(await dev.stat(LOCK_PATH)).toBeNull();
  });

  it("knows which files can be kept twice", () => {
    for (const p of ["todo/a.md", "inbox/a.md", "ideas/a.md", "notes/a.md", "thoughts/a.md", "books/x/quotes/1.md", "projects/p/01-step/a.md"]) expect(canKeepBoth(p)).toBe(true);
    for (const p of ["books/x/book.md", "books/x/cover.jpg", "journal/2026-10-17.md", "review/2026-10-17.md", ".studium/lists.json", "projects/p/project.md"])
      expect(canKeepBoth(p)).toBe(false);
  });

  it("marks the lines that differ", () => {
    const d = diffLines(["---", "last_reviewed: 2026-10-16", "---", "> quote"], ["---", "last_reviewed: 2026-10-17", "---", "> quote", "comment"])!;
    expect(d.a).toEqual([false, true, false, false]);
    expect(d.b).toEqual([false, true, false, false, true]);
  });
});
