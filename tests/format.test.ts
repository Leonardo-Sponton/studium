import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { CARET, formatSpec, type Format } from "../src/editor/format";

const TABLE = "| A | B |\n| --- | --- |\n|  |  |";

/** Text with "^" marking the caret, or "«" "»" around the selection; returns the result the same way. */
function run(src: string, f: Format): string {
  const a = src.includes("«") ? src.indexOf("«") : src.indexOf("^");
  const plain = src.replace(/[«»^]/g, "");
  const b = src.includes("»") ? src.indexOf("»") - 1 : a;
  const state = EditorState.create({ doc: plain, selection: EditorSelection.range(a, b) });
  const next = state.update(formatSpec(state, f, TABLE)).state;
  const { from, to } = next.selection.main;
  const d = next.doc.toString();
  return from === to ? d.slice(0, from) + "^" + d.slice(from) : d.slice(0, from) + "«" + d.slice(from, to) + "»" + d.slice(to);
}

describe("quick formatting", () => {
  it("wraps the selection or leaves the caret between the marks", () => {
    expect(run("say «hi» now", "bold")).toBe("say **«hi»** now");
    expect(run("say ^", "italic")).toBe("say *^*");
    expect(run("«x»", "strike")).toBe("~~«x»~~");
    expect(run("a ^", "code")).toBe("a `^`");
  });

  it("takes the marks off when tapped again", () => {
    expect(run("say **«hi»** now", "bold")).toBe("say «hi» now");
    expect(run("say «**hi**» now", "bold")).toBe("say «hi» now");
    expect(run("say **^**", "bold")).toBe("say ^");
    expect(run("*«x»*", "italic")).toBe("«x»");
    expect(run("***«x»***", "italic")).toBe("**«x»**");
    expect(run("***«x»***", "bold")).toBe("*«x»*");
    expect(run("**«x»**", "italic")).toBe("***«x»***");
    expect(run("~~«x»~~", "strike")).toBe("«x»");
    expect(run("`^`", "code")).toBe("^");
  });

  it("adds a line marker, replaces another one and removes the same one", () => {
    expect(run("Hel^lo", "h1")).toBe("# Hel^lo");
    expect(run("# Hel^lo", "h2")).toBe("## Hel^lo");
    expect(run("## Hel^lo", "h2")).toBe("Hel^lo");
    expect(run("- it^em", "todo")).toBe("- [ ] it^em");
    expect(run("- [x] it^em", "list")).toBe("- it^em");
    expect(run("^", "list")).toBe("- ^");
    expect(run("  ne^st", "quote")).toBe("  > ne^st");
  });

  it("numbers every selected line, and takes the numbers off again", () => {
    expect(run("«a\nb\nc»", "numbered")).toBe("1. «a\n2. b\n3. c»");
    expect(run("1. «a\n2. b»", "numbered")).toBe("«a\nb»");
  });

  it("makes links with the address ready to type", () => {
    expect(run("see «docs»", "link")).toBe("see [docs](«https://»)");
    expect(run("see ^", "link")).toBe("see [^](https://)");
  });

  it("puts blocks under the caret line after an empty line", () => {
    expect(run("Text^", "line")).toBe("Text\n\n---\n^");
    expect(run("Text\n^", "line")).toBe("Text\n\n---\n^");
    expect(run("^", "table")).toBe(TABLE + "\n^");
    // The table of the app selects its first title, ready to be typed over.
    const s = EditorState.create({ doc: "" });
    const next = s.update(formatSpec(s, "table", `| ${CARET}A${CARET} | B |\n| --- | --- |`)).state;
    expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe("A");
  });
});
