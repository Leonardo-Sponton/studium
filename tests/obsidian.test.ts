import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildDecorations, blockDecorations, closedCallouts } from "../src/editor/livePreview";
import { obsidianMarkdown } from "../src/editor/syntax";
import { checkboxSpec, footnoteSpec, formatSpec } from "../src/editor/format";
import { tableAction } from "../src/editor/tables";
import { embedTarget, sectionOf } from "../src/editor/embeds";
import { fillTemplate, formatDate, mergeProperties } from "../src/data/templates";
import { findAttachment, pastedName, saveAttachment } from "../src/data/attachments";
import { countWords, headingsOf } from "../src/ui/NoteTools";
import { findPlace } from "../src/ui/appLinks";
import { MemoryStorage } from "../src/storage/memory";

const stateOf = (doc: string, anchor = 0) =>
  EditorState.create({ doc, selection: { anchor }, extensions: [markdown({ base: markdownLanguage, extensions: obsidianMarkdown })] });

const nodes = (doc: string) => {
  const out: string[] = [];
  const s = stateOf(doc);
  syntaxTree(s).iterate({ enter: n => void (n.name !== "Document" && n.name !== "Paragraph" && out.push(`${n.name}:${doc.slice(n.from, n.to)}`)) });
  return out;
};

/** A fake view: enough for tableAction (state + dispatch). */
function fakeView(doc: string, anchor: number) {
  let state = stateOf(doc, anchor);
  return {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  };
}

describe("Obsidian syntax", () => {
  it("parses links, embeds, footnotes, math and comments", () => {
    const n = nodes("[[Note|alias]] ![[a.png|300]] [^1] ^[inline] $x^2$ %%hid%%");
    expect(n).toEqual(
      expect.arrayContaining(["WikiLink:[[Note|alias]]", "Embed:![[a.png|300]]", "FootnoteRef:[^1]", "InlineFootnote:^[inline]", "InlineMath:$x^2$", "HiddenComment:%%hid%%"]),
    );
  });

  it("does not take prices for math", () => {
    expect(nodes("costs $5 and $10").some(x => x.startsWith("InlineMath"))).toBe(false);
  });

  it("parses $$ blocks and %% blocks", () => {
    const n = nodes("$$\nE=mc^2\n$$\n\n%%\nsecret\n%%\nafter");
    expect(n).toContain("MathBlock:$$\nE=mc^2\n$$");
    expect(n).toContain("HiddenCommentBlock:%%\nsecret\n%%");
  });
});

describe("live preview of Obsidian marks", () => {
  const shown = (doc: string, raw: number[] = []) => {
    const state = stateOf(doc);
    const set = buildDecorations(state, [{ from: 0, to: doc.length }], new Set(raw));
    const hidden: [number, number, string][] = [];
    set.between(0, doc.length, (from, to, d) => {
      const spec = d.spec as { class?: string; widget?: { text?: string; label?: string; tex?: string } };
      if (!spec.class && from < to) hidden.push([from, to, spec.widget?.text ?? spec.widget?.label ?? (spec.widget?.tex !== undefined ? `<${spec.widget.tex}>` : "")]);
    });
    let out = "";
    let pos = 0;
    for (const [from, to, s] of hidden.sort((a, b) => a[0] - b[0])) {
      if (from < pos) continue;
      out += doc.slice(pos, from) + s;
      pos = to;
    }
    return out + doc.slice(pos);
  };

  it("shows a link's text (or its alias) and a footnote's number", () => {
    expect(shown("See [[Trip]] and [[Trip|the trip]][^1]")).toBe("See Trip and the trip1");
    expect(shown("See [[Trip]]", [1])).toBe("See [[Trip]]");
  });

  it("draws formulas and hides comment marks", () => {
    expect(shown("a $x$ b %%note%%")).toBe("a <x> b note");
  });

  it("draws note embeds, formulas and diagrams as blocks, unless the caret is inside", () => {
    const doc = "![[Trip]]\n\n$$\nx\n$$\n\n```mermaid\ngraph LR\nA-->B\n```\n";
    let n = 0;
    blockDecorations(stateOf(doc), false).between(0, doc.length, () => void n++);
    expect(n).toBe(3);
    n = 0;
    blockDecorations(stateOf(doc, 1), true).between(0, doc.length, () => void n++);
    expect(n).toBe(2);
  });

  it("folds callouts written closed", () => {
    expect(closedCallouts(stateOf("> [!faq]- Q\n> answer\n\n> [!tip] open\n> x")).length).toBe(1);
  });
});

describe("formatting extras", () => {
  const run = (doc: string, f: Parameters<typeof formatSpec>[1]) => {
    const at = doc.indexOf("^");
    const s = stateOf(doc.replace("^", ""), at);
    const next = s.update(formatSpec(s, f, "T")).state;
    const t = next.doc.toString();
    const h = next.selection.main.head;
    return t.slice(0, h) + "^" + t.slice(h);
  };

  it("writes callouts, code, formulas and diagrams with the caret inside", () => {
    expect(run("^", "callout")).toBe("> [!note] ^\n> \n");
    expect(run("^", "codeblock")).toBe("```^\n\n```\n");
    expect(run("^", "mathblock")).toBe("$$\n^\n$$\n");
    expect(run("^", "wiki")).toBe("[[^]]");
  });

  it("adds a footnote with the next number", () => {
    const s = stateOf("Text[^1]\n\n[^1]: one", 4);
    const next = s.update(footnoteSpec(s)).state.doc.toString();
    expect(next).toBe("Text[^2][^1]\n\n[^1]: one\n[^2]: ");
  });

  it("Ctrl+L: line → to-do → done → to-do", () => {
    let s = stateOf("buy milk");
    const step = () => (s = s.update(checkboxSpec(s)).state).doc.toString();
    expect(step()).toBe("- [ ] buy milk");
    expect(step()).toBe("- [x] buy milk");
    expect(step()).toBe("- [ ] buy milk");
  });
});

describe("tables (md-advanced-tables)", () => {
  it("Tab lines the table up and goes to the next cell", () => {
    const doc = "| a | bb |\n|-|-|\n| ccc | d |";
    const v = fakeView(doc, 1);
    tableAction(v as never, "nextCell");
    expect(v.state.doc.toString()).toBe("| a   | bb  |\n| --- | --- |\n| ccc | d   |");
  });

  it("calculates formulas", () => {
    const v = fakeView("| Item | Cost |\n| --- | --- |\n| Bus | 180 |\n| Hostel | 240 |\n| Total | |\n<!-- TBLFM: @>$2=sum(@I..@-1) -->", 3);
    tableAction(v as never, "formulas");
    expect(v.state.doc.line(5).text).toBe("| Total  | 420  |");
  });

  it("adds a row and sorts", () => {
    const v = fakeView("| n |\n| - |\n| b |\n| a |", 14);
    tableAction(v as never, "sortAsc");
    expect(v.state.doc.toString()).toBe("| n   |\n| --- |\n| a   |\n| b   |");
    tableAction(v as never, "insertRow");
    expect(v.state.doc.toString().split("\n").length).toBe(5);
  });
});

describe("embeds", () => {
  it("reads names, headings and sizes", () => {
    expect(embedTarget("pic.png|300x200")).toMatchObject({ name: "pic.png", width: 300, height: 200 });
    expect(embedTarget("Note#Part|shown")).toMatchObject({ name: "Note", heading: "Part", alias: "shown" });
  });

  it("takes one section of a note", () => {
    expect(sectionOf("# A\nx\n## B\ny\n# C\nz", "B")).toBe("## B\ny");
  });
});

describe("templates", () => {
  const now = new Date(2026, 9, 18, 9, 5);
  it("fills title, date and time", () => {
    expect(fillTemplate("# {{title}} {{date}} {{time}} {{date:DD/MM/YYYY}}", { title: "X", now })).toBe("# X 2026-10-18 09:05 18/10/2026");
    expect(formatDate(now, "YY-M-D H:mm")).toBe("26-10-18 9:05");
  });

  it("adds only the properties the note does not have", () => {
    expect(mergeProperties({ a: 1, b: "" }, { a: 2, b: 3, c: 4 })).toEqual({ b: 3, c: 4 });
  });
});

describe("attachments", () => {
  it("saves pasted pictures with a dated name and finds them by name", async () => {
    const s = new MemoryStorage();
    expect(pastedName("image/png", new Date(2026, 9, 18, 21, 45, 0))).toBe("Pasted image 20261018214500.png");
    const name = await saveAttachment(s, "image.png", "image/png", new Uint8Array([1, 2]));
    expect(name).toMatch(/^Pasted image \d{14}\.png$/);
    expect(await findAttachment(s, name, "notes/a.md")).toBe(`attachments/${name}`);
    await s.writeBinary("study/x/imgs/d.gif", new Uint8Array([1]));
    expect(await findAttachment(s, "d.gif")).toBe("study/x/imgs/d.gif");
    expect(await findAttachment(s, "imgs/d.gif", "study/x/n.md")).toBe("study/x/imgs/d.gif");
    expect(await findAttachment(s, "nothing.png")).toBeNull();
  });
});

describe("note tools", () => {
  it("lists headings outside code and counts words", () => {
    expect(headingsOf("# A\n```\n# no\n```\n## B").map(h => h.text)).toEqual(["A", "B"]);
    expect(countWords("# Title\n\nTwo **words** %%hidden%%").words).toBe(3);
  });

  it("finds link targets ignoring accents and case", () => {
    const places = [{ area: "study" as const, path: "study/geo/notes/a.md", title: "Viagem para o Litoral" }];
    expect(findPlace(places, "viagem para o litoral")?.path).toBe("study/geo/notes/a.md");
    expect(findPlace(places, "other")).toBeNull();
  });
});
