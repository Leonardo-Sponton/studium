import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

// The quick format bar (ui/FormatBar): one tap writes the Markdown symbols for the user.
// Pure: returns a transaction for the state, so it can be tested without a view.

export type Format =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strike"
  | "list"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "link"
  | "line"
  | "table"
  | "highlight"
  | "comment"
  | "math"
  | "wiki"
  | "embed"
  | "callout"
  | "codeblock"
  | "mathblock"
  | "mermaid"
  | "footnote";

const WRAP: Partial<Record<Format, string>> = { bold: "**", italic: "*", strike: "~~", code: "`", highlight: "==", comment: "%%", math: "$" };
const PREFIX: Partial<Record<Format, string>> = { h1: "# ", h2: "## ", h3: "### ", list: "- ", numbered: "1. ", todo: "- [ ] ", quote: "> " };
/** Where the caret goes in a block (a character that is never typed); two of them select the text between. */
export const CARET = "\u0000";

/** Blocks written after the caret line; CARET is where the caret goes (at the end when none). */
const BLOCKS: Partial<Record<Format, string>> = {
  line: "---",
  callout: `> [!note] ${CARET}\n> `,
  codeblock: `\`\`\`${CARET}\n\n\`\`\``,
  mathblock: `$$\n${CARET}\n$$`,
  mermaid: `\`\`\`mermaid\nflowchart LR\n    A[${CARET}Start] --> B[End]\n\`\`\``,
};
/** A block marker a line may already start with: a new one replaces it instead of piling up. */
const BLOCK = /^(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )/;

/** `table` is the text of an empty table (localized header), used by the "table" format. */
export function formatSpec(state: EditorState, f: Format, table: string): TransactionSpec {
  const wrap = WRAP[f];
  if (wrap) return wrapSpec(state, wrap);
  const prefix = PREFIX[f];
  if (prefix) return prefixSpec(state, f, prefix);
  if (f === "link") return linkSpec(state);
  if (f === "wiki" || f === "embed") return insertAround(state, f === "wiki" ? "[[" : "![[", "]]");
  if (f === "footnote") return footnoteSpec(state);
  return blockSpec(state, BLOCKS[f] ?? table);
}

/** "[[" + selection or caret + "]]" (the "[[" list of titles opens after it). */
function insertAround(state: EditorState, open: string, close: string): TransactionSpec {
  return state.changeByRange(r => ({
    changes: [
      { from: r.from, insert: open },
      { from: r.to, insert: close },
    ],
    range: EditorSelection.range(r.from + open.length, r.to + open.length),
  }));
}

/** [^n] at the caret (the next free number) and its "[^n]: " line at the end, caret there. */
export function footnoteSpec(state: EditorState): TransactionSpec {
  const text = state.doc.toString();
  let n = 1;
  for (const m of text.matchAll(/\[\^(\d+)\]/g)) n = Math.max(n, Number(m[1]) + 1);
  const at = state.selection.main.head;
  const ref = `[^${n}]`;
  const tail = text.endsWith("\n") ? "" : "\n";
  const sep = /\n\[\^[^\]]+\]:[^\n]*\n?$/.test(text) ? "" : "\n";
  const def = `${tail}${sep}[^${n}]: `;
  return {
    changes: [
      { from: at, insert: ref },
      { from: text.length, insert: def },
    ],
    selection: EditorSelection.cursor(text.length + ref.length + def.length),
    scrollIntoView: true,
  };
}

/**
 * Ctrl+L: a line becomes a to-do, a to-do is checked, a checked one is unchecked (like
 * Obsidian's "Toggle checkbox status").
 */
export function checkboxSpec(state: EditorState): TransactionSpec {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  const changes = [...lines].map(n => {
    const l = state.doc.line(n);
    const m = /^(\s*)(?:([-*+]) (\[([ xX])\] )?)?/.exec(l.text)!;
    const from = l.from + m[1].length;
    if (m[3]) return { from: from + 3, to: from + 4, insert: m[4] === " " ? "x" : " " };
    if (m[2]) return { from: from + 2, insert: "[ ] " };
    return { from, insert: "- [ ] " };
  });
  const set = state.changes(changes);
  return { changes: set, selection: state.selection.map(set, 1) };
}

/**
 * Selected text: put the marks around it. Nothing selected: the marks with the caret between.
 * Tapping again takes them off: marks right outside the selection, or at both ends inside it.
 */
function wrapSpec(state: EditorState, m: string): TransactionSpec {
  return state.changeByRange(r => {
    const text = state.sliceDoc(r.from, r.to);
    const before = run(state.sliceDoc(Math.max(0, r.from - 3), r.from), m[0], -1);
    const after = run(state.sliceDoc(r.to, r.to + 3), m[0], 1);
    if (hasMark(Math.min(before, after), m)) {
      return {
        changes: [
          { from: r.from - m.length, to: r.from },
          { from: r.to, to: r.to + m.length },
        ],
        range: EditorSelection.range(r.from - m.length, r.to - m.length),
      };
    }
    const start = run(text.slice(0, 3), m[0], 1);
    const end = run(text.slice(-3), m[0], -1);
    if (text.length >= 2 * m.length && hasMark(Math.min(start, end), m)) {
      return {
        changes: [
          { from: r.from, to: r.from + m.length },
          { from: r.to - m.length, to: r.to },
        ],
        range: EditorSelection.range(r.from, r.to - 2 * m.length),
      };
    }
    return {
      changes: [
        { from: r.from, insert: m },
        { from: r.to, insert: m },
      ],
      range: EditorSelection.range(r.from + m.length, r.to + m.length),
    };
  });
}

/** How many `c` in a row `s` has at its end (dir -1) or its start (dir 1). */
function run(s: string, c: string, dir: 1 | -1): number {
  let n = 0;
  while (n < s.length && s[dir === 1 ? n : s.length - 1 - n] === c) n++;
  return n;
}

/**
 * `n` marker characters in a row hold the mark `m`. "*" and "**" share the star: one or three
 * stars are italic, two or more are bold (so un-italic does not eat half of a bold).
 */
function hasMark(n: number, m: string): boolean {
  if (m === "*") return n % 2 === 1;
  return n >= m.length;
}

/** Every line touched by the selection gets the marker; tapping the same one again removes it. */
function prefixSpec(state: EditorState, f: Format, prefix: string): TransactionSpec {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const nums = [...lines].sort((a, b) => a - b);
  const off = nums.every(n => isSame(markerOf(state, n), f));
  const changes = nums.map((n, i) => {
    const { indent, mark } = markerOf(state, n);
    const from = state.doc.line(n).from + indent.length;
    const insert = off ? "" : f === "numbered" ? `${i + 1}. ` : prefix;
    return { from, to: from + mark.length, insert };
  });
  const set = state.changes(changes);
  return { changes: set, selection: state.selection.map(set, 1) };
}

/** The line's indentation and its block marker ("" when none). */
function markerOf(state: EditorState, n: number): { indent: string; mark: string } {
  const text = state.doc.line(n).text;
  const indent = /^\s*/.exec(text)![0];
  return { indent, mark: BLOCK.exec(text.slice(indent.length))?.[0] ?? "" };
}

/** The line already has this format's marker (any number counts as "numbered"). */
function isSame({ mark }: { mark: string }, f: Format): boolean {
  return f === "numbered" ? /^\d/.test(mark) : mark !== "" && mark === PREFIX[f];
}

/** Selected text becomes the link text and the address is selected, ready to be typed over. */
function linkSpec(state: EditorState): TransactionSpec {
  const url = "https://";
  return state.changeByRange(r => {
    const text = state.sliceDoc(r.from, r.to);
    const insert = `[${text}](${url})`;
    const range = text
      ? EditorSelection.range(r.from + text.length + 3, r.from + text.length + 3 + url.length)
      : EditorSelection.cursor(r.from + 1);
    return { changes: { from: r.from, to: r.to, insert }, range };
  });
}

/**
 * A block (a line across, a table) goes after the caret's line, with an empty line before it:
 * a "---" right under text would turn that text into a subtitle instead.
 */
function blockSpec(state: EditorState, block: string): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.head);
  const prev = line.number > 1 ? state.doc.line(line.number - 1).text : "";
  const before = line.text.trim() ? "\n\n" : prev.trim() ? "\n" : "";
  const caret = block.includes(CARET) ? block.indexOf(CARET) : block.length;
  const end = block.indexOf(CARET, caret + 1);
  const body = block.replaceAll(CARET, "");
  const insert = `${before}${body}\n`;
  // A line: the caret goes below it. Others: inside, where CARET was.
  const at = line.to + before.length;
  return {
    changes: { from: line.to, insert },
    selection:
      caret === body.length
        ? EditorSelection.cursor(line.to + insert.length)
        : end > 0
          ? EditorSelection.range(at + caret, at + end - 1)
          : EditorSelection.cursor(at + caret),
  };
}
