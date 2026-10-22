import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import {
  createDrawing,
  drawingEmbed,
  drawingTitle,
  embeddedName,
  findDrawing,
  importDrawings,
  listDrawings,
  loadDrawing,
  parseDrawing,
  saveDrawing,
  serializeDrawing,
} from "../src/data/drawings";
import { MemoryStorage } from "../src/storage/memory";

const rect = { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1 };
const text = { id: "abcdefgh", type: "text", text: "Hello\nworld", originalText: "Hello\nworld", version: 1 };
const img = { id: "i1", type: "image", fileId: "0123456789abcdef0123456789abcdef01234567", version: 1 };

// What the Obsidian plugin writes (shape of a real file).
const pluginFile = (json: string) => `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements
Hello
world ^abcdefgh

## Embedded Files
0123456789abcdef0123456789abcdef01234567: [[Pasted Image 1.png]]

%%
## Drawing
\`\`\`compressed-json
${LZString.compressToBase64(json).replace(/(.{256})/g, "$1\n\n")}
\`\`\`
%%`;

describe("drawings (Obsidian Excalidraw format)", () => {
  const json = JSON.stringify({ type: "excalidraw", version: 2, elements: [rect, text, img], appState: { gridSize: null }, files: {} });

  it("reads the plugin's compressed file", () => {
    const d = parseDrawing(pluginFile(json));
    expect(d.scene.elements.map(e => e.id)).toEqual(["r1", "abcdefgh", "i1"]);
    expect(d.embedded).toEqual({ "0123456789abcdef0123456789abcdef01234567": "[[Pasted Image 1.png]]" });
    expect(d.front).toContain("excalidraw-plugin: parsed");
  });

  it("reads plain json blocks and .excalidraw files", () => {
    expect(parseDrawing("## Drawing\n```json\n" + json + "\n```\n").scene.elements).toHaveLength(3);
    expect(parseDrawing(json).scene.elements).toHaveLength(3);
  });

  it("writes text elements, embedded files and the scene back", () => {
    const d = parseDrawing(pluginFile(json));
    const out = serializeDrawing(d);
    expect(out).toContain("## Text Elements\nHello\nworld ^abcdefgh\n");
    expect(out).toContain("## Embedded Files\n0123456789abcdef0123456789abcdef01234567: [[Pasted Image 1.png]]\n");
    expect(out).toMatch(/%%\n## Drawing\n```compressed-json\n[\s\S]+\n```\n%%\n$/);
    expect(parseDrawing(out).scene.elements.map(e => e.id)).toEqual(["r1", "abcdefgh", "i1"]);
    // Deleted elements are left out.
    const gone = serializeDrawing({ ...d, scene: { ...d.scene, elements: [{ ...text, isDeleted: true }] } });
    expect(gone).not.toContain("^abcdefgh");
  });

  it("names", () => {
    expect(drawingTitle("drawings/Drawing 1.excalidraw.md")).toBe("Drawing 1");
    expect(drawingEmbed("drawings/Drawing 1.excalidraw.md")).toBe("![[Drawing 1.excalidraw]]");
    expect(embeddedName("[[Pasted Image.png|100%]]")).toBe("Pasted Image.png");
    expect(embeddedName("$$x^2$$")).toBeNull();
  });

  it("creates, finds, saves pictures and lists", async () => {
    const s = new MemoryStorage();
    const p = await createDrawing(s, "Plan");
    expect(p).toBe("drawings/Plan.excalidraw.md");
    expect(await createDrawing(s, "Plan")).toBe("drawings/Plan (2).excalidraw.md");
    expect(await findDrawing(s, "Plan.excalidraw")).toBe(p);
    expect(await findDrawing(s, "Excalidraw/Plan")).toBe(p);
    expect(await findDrawing(s, "Plan.excalidraw.md")).toBe(p);
    expect(await findDrawing(s, "Nope")).toBeNull();

    const d = await loadDrawing(s, p);
    d.scene.elements = [img];
    d.scene.files[img.fileId] = { id: img.fileId, mimeType: "image/png", dataURL: "data:image/png;base64,iVBORw0KGgo=", created: 1 };
    await saveDrawing(s, p, d);
    const again = await loadDrawing(s, p);
    const link = again.embedded[img.fileId];
    expect(link).toMatch(/^\[\[Pasted Image 01234567\.png\]\]$/);
    expect(await s.stat("attachments/Pasted Image 01234567.png")).toBeTruthy();
    expect(again.scene.files[img.fileId].dataURL).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect((await listDrawings(s)).map(x => x.title).sort()).toEqual(["Plan", "Plan (2)"]);
  });

  it("imports a vault's drawings with their pictures, never overwriting", async () => {
    const s = new MemoryStorage();
    await s.write("drawings/Taken.excalidraw.md", "x");
    const enc = (t: string) => async () => new TextEncoder().encode(t);
    const res = await importDrawings(s, [
      { path: "Vault/Excalidraw/Drawing A.excalidraw.md", read: enc(pluginFile(json)) },
      { path: "Vault/Excalidraw/Taken.excalidraw.md", read: enc(pluginFile(json)) },
      { path: "Vault/Pasted Image 1.png", read: async () => new Uint8Array([1, 2, 3]) },
      { path: "Vault/plain.excalidraw", read: enc(json) },
      { path: "Vault/.obsidian/x.excalidraw.md", read: enc(pluginFile(json)) },
      { path: "Vault/note.md", read: enc("# hi") },
    ]);
    expect(res.added.sort()).toEqual(["Drawing A", "plain"]);
    expect(res.skipped).toEqual(["Taken"]);
    expect(await s.read("drawings/Taken.excalidraw.md")).toBe("x");
    expect(await s.readBinary("attachments/Pasted Image 1.png")).toEqual(new Uint8Array([1, 2, 3]));
    expect(parseDrawing(await s.read("drawings/plain.excalidraw.md")).scene.elements).toHaveLength(3);
  });
});
