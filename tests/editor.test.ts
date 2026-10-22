import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { buildDecorations, Highlight, parseTable, tableCells, tableDecorations, toggleTask } from "../src/editor/livePreview";
import { previewOf } from "../src/data/frontmatter";

const stateOf = (doc: string) => EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage, extensions: [Highlight] })] });

/** What the reader sees: the text with hidden parts removed, boxes as [ ]/[x], widgets as their text, plus line classes. */
function render(doc: string, rawLines: number[] = []) {
  const state = stateOf(doc);
  const set = buildDecorations(state, [{ from: 0, to: doc.length }], new Set(rawLines));
  const hidden: [number, number, string?][] = [];
  const lineCls: Record<number, string[]> = {};
  const marks: string[] = [];
  set.between(0, doc.length, (from, to, d) => {
    const spec = d.spec as { class?: string; widget?: { checked?: boolean; text?: string } };
    if (from === to && spec.class) (lineCls[state.doc.lineAt(from).number] ??= []).push(spec.class);
    else if (spec.class) marks.push(`${spec.class}:${doc.slice(from, to)}`);
    else hidden.push([from, to, !spec.widget ? "" : spec.widget.text ?? (spec.widget.checked ? "[x]" : "[ ]")]);
  });
  let out = "";
  let pos = 0;
  for (const [from, to, shown] of hidden.sort((a, b) => a[0] - b[0])) {
    out += doc.slice(pos, from) + shown;
    pos = to;
  }
  return { text: out + doc.slice(pos), lineCls, marks };
}

describe("live preview", () => {
  it("hides Markdown symbols away from the caret", () => {
    const r = render("# Title\n\nSome **bold** and *it* and `code`.\n\n> quoted\n");
    expect(r.text).toBe("Title\n\nSome bold and it and code.\n\nquoted\n");
    expect(r.lineCls[1]).toEqual(["cm-hm-h1"]);
    expect(r.lineCls[5]).toEqual(["cm-hm-quote"]);
    expect(r.marks).toEqual(expect.arrayContaining(["cm-hm-strong:**bold**", "cm-hm-em:*it*", "cm-hm-code:`code`"]));
  });

  it("shows raw text on the caret lines only", () => {
    const r = render("# Title\n**a** **b**\n## Sub", [2]);
    expect(r.text).toBe("Title\n**a** **b**\nSub");
    expect(r.lineCls[3]).toEqual(["cm-hm-h2"]);
  });

  it("draws task boxes, hides the dash and strikes done tasks", () => {
    const r = render("- [ ] buy bread\n- [x] buy milk\n- plain\n1. first");
    expect(r.text).toBe("[ ] buy bread\n[x] buy milk\n• plain\n1. first");
    expect(r.marks).toContain("cm-hm-done: buy milk");
    expect(r.marks).toContain("cm-hm-number:1.");
  });

  it("keeps the box on the caret line but shows the dash", () => {
    expect(render("- [ ] task", [1]).text).toBe("- [ ] task");
  });

  it("does not format inside fenced code; the fences give way to the language", () => {
    const r = render("```java\n# not a title **x**\n```");
    expect(r.text).toBe("java\n# not a title **x**\n");
    expect(r.lineCls[1]).toEqual(["cm-hm-codeblock cm-hm-cb-first"]);
    expect(r.lineCls[2]).toEqual(["cm-hm-codeblock"]);
    expect(r.lineCls[3]).toEqual(["cm-hm-codeblock cm-hm-cb-last"]);
  });

  it("shows the fences while the caret is anywhere in the code block", () => {
    expect(render("```java\nint a;\n```", [2]).text).toBe("```java\nint a;\n```");
  });

  it("keeps only the text of links, highlights and escapes", () => {
    const r = render("See [the docs](https://x.org/a) and ==this== \\*not em\\*");
    expect(r.text).toBe("See the docs and this *not em*");
    expect(r.marks).toEqual(expect.arrayContaining(["cm-hm-link:the docs", "cm-hm-hl:==this=="]));
    expect(render("See [the docs](https://x.org/a)", [1]).text).toBe("See [the docs](https://x.org/a)");
  });

  it("draws callouts with their name", () => {
    const r = render("> [!tip]\n> be kind");
    expect(r.text).toBe("Tip\nbe kind");
    expect(r.lineCls[1]).toEqual(["cm-hm-callout cm-hm-callout-tip"]);
    expect(render("> [!warning] Careful\n> hot").text).toBe("Careful\nhot");
  });

  it("sizes every heading level", () => {
    expect(render("#### four\n###### six").lineCls).toEqual({ 1: ["cm-hm-h4"], 2: ["cm-hm-h6"] });
  });

  it("toggles a task box both ways", () => {
    const s = stateOf("- [ ] a\n- [X] b");
    expect(toggleTask(s, 2)).toEqual({ from: 3, to: 4, insert: "x" });
    expect(toggleTask(s, 10)).toEqual({ from: 11, to: 12, insert: " " });
    expect(toggleTask(s, 0)).toBeNull();
  });
});

describe("tables", () => {
  it("splits cells and reads the alignment", () => {
    expect(tableCells("| a | b \\| c |")).toEqual(["a", "b | c"]);
    expect(parseTable("| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |")).toEqual({
      head: ["A", "B", "C"],
      align: ["left", "center", "right"],
      rows: [["1", "2", "3"]],
    });
  });

  it("draws a table unless the caret is in it", () => {
    const doc = "Intro\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nEnd";
    const count = (s: EditorState, focused: boolean) => {
      let n = 0;
      tableDecorations(s, focused).between(0, doc.length, () => void n++);
      return n;
    };
    const s = stateOf(doc);
    expect(count(s, true)).toBe(1);
    const inTable = s.update({ selection: { anchor: doc.indexOf("| 1") } }).state;
    expect(count(inTable, true)).toBe(0);
    expect(count(inTable, false)).toBe(1);
  });
});

describe("list preview", () => {
  it("uses the title, else the first line without symbols", () => {
    expect(previewOf("# Hello\nbody")).toBe("Hello");
    expect(previewOf("\n- [ ] call **Ana**\n")).toBe("call Ana");
    expect(previewOf("> a *quote*")).toBe("a quote");
    expect(previewOf("")).toBe("");
  });
});
