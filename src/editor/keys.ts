import { indentLess, indentMore, insertTab } from "@codemirror/commands";
import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { checkboxSpec, formatSpec, type Format } from "./format";

// Typing helpers like Obsidian's editor: shortcuts for the marks, Tab to indent lists, a
// selection wrapped by typing a mark, a web address pasted over a selection becomes a link, and
// pictures pasted or dropped are saved beside the notes (Editor `attach`).

/** Typed with text selected: wraps the selection instead of replacing it. */
const PAIRS: Record<string, [string, string]> = {
  "*": ["*", "*"],
  _: ["_", "_"],
  "`": ["`", "`"],
  "=": ["=", "="],
  "~": ["~", "~"],
  $: ["$", "$"],
  "%": ["%", "%"],
  '"': ['"', '"'],
  "(": ["(", ")"],
  "[": ["[", "]"],
  "{": ["{", "}"],
};

const wrapSelection = EditorView.inputHandler.of((view, _from, _to, text) => {
  const pair = PAIRS[text];
  const sel = view.state.selection;
  if (!pair || sel.ranges.every(r => r.empty) || view.composing) return false;
  view.dispatch(
    view.state.changeByRange(r =>
      r.empty
        ? { changes: { from: r.from, insert: text }, range: EditorSelection.cursor(r.from + text.length) }
        : {
            changes: [
              { from: r.from, insert: pair[0] },
              { from: r.to, insert: pair[1] },
            ],
            range: EditorSelection.range(r.from + pair[0].length, r.to + pair[0].length),
          },
    ),
    { userEvent: "input.type" },
  );
  return true;
});

const LIST_LINE = /^\s*([-*+]|\d+[.)])\s/;

export interface KeyOptions {
  /** The text of an empty table (localized) for formats that make one. */
  table: () => string;
  /** Saves a pasted or dropped file; gives the Markdown to insert ("![[name.png]]"), or null. */
  attach?: (file: File) => Promise<string | null>;
}

export function format(view: EditorView, f: Format, table: string): boolean {
  view.dispatch({ ...formatSpec(view.state, f, table), scrollIntoView: true, userEvent: "format" });
  return true;
}

/** Saves the files and writes their embeds at `pos`, one per line. */
export async function attachFiles(view: EditorView, files: File[], attach: NonNullable<KeyOptions["attach"]>, pos?: number) {
  const out: string[] = [];
  for (const f of files) {
    const md = await attach(f);
    if (md) out.push(md);
  }
  if (!out.length) return;
  const at = pos ?? view.state.selection.main.head;
  const line = view.state.doc.lineAt(at);
  const before = at > line.from && line.text.trim() ? "\n" : "";
  const insert = before + out.join("\n");
  view.dispatch({ changes: { from: at, to: pos === undefined ? view.state.selection.main.to : at, insert }, selection: { anchor: at + insert.length }, scrollIntoView: true, userEvent: "input.paste" });
}

export function markdownKeys(o: KeyOptions): Extension {
  const f = (name: Format) => (view: EditorView) => format(view, name, o.table());
  return [
    wrapSelection,
    keymap.of([
      { key: "Mod-b", run: f("bold") },
      { key: "Mod-i", run: f("italic") },
      { key: "Mod-k", run: f("link") },
      { key: "Mod-Shift-h", run: f("highlight") },
      { key: "Mod-Shift-x", run: f("strike") },
      { key: "Mod-/", run: f("comment") },
      { key: "Mod-Shift-m", run: f("math") },
      {
        key: "Mod-l",
        run: view => {
          view.dispatch({ ...checkboxSpec(view.state), userEvent: "format" });
          return true;
        },
      },
      // Tab indents list items and selected lines; elsewhere it types a tab (tables come first).
      {
        key: "Tab",
        run: view => {
          const s = view.state;
          const multi = s.selection.ranges.some(r => !r.empty || LIST_LINE.test(s.doc.lineAt(r.head).text));
          return multi ? indentMore(view) : insertTab(view);
        },
      },
      { key: "Shift-Tab", run: indentLess },
    ]),
    EditorView.domEventHandlers({
      paste(e, view) {
        const files = [...(e.clipboardData?.files ?? [])];
        if (files.length && o.attach) {
          e.preventDefault();
          void attachFiles(view, files, o.attach);
          return true;
        }
        // A web address pasted over selected words: [words](address).
        const text = e.clipboardData?.getData("text/plain")?.trim() ?? "";
        const sel = view.state.selection.main;
        if (/^https?:\/\/\S+$/i.test(text) && !sel.empty) {
          const words = view.state.sliceDoc(sel.from, sel.to);
          if (words.includes("\n") || /^https?:/i.test(words)) return false;
          e.preventDefault();
          view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${words}](${text})` }, userEvent: "input.paste" });
          return true;
        }
        return false;
      },
      drop(e, view) {
        const files = [...(e.dataTransfer?.files ?? [])];
        if (!files.length || !o.attach) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.doc.length;
        void attachFiles(view, files, o.attach, pos);
        return true;
      },
    }),
  ];
}
