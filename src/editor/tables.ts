import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Alignment, FormatType, optionsWithDefaults, Point, SortOrder, TableEditor, type ITextEditor, type Range } from "@tgrosinger/md-advanced-tables";

// Table editing like the Advanced Tables plugin for Obsidian: Tab / Shift+Tab go to the next /
// previous cell, Enter to the next row (a new one at the end), and every move lines the columns
// up again. The table bar (ui/FormatBar) adds rows, columns, alignment, sorting and formulas.
// The work is done by md-advanced-tables (MIT, © Susisu, © Tony Grosinger), the library the plugin
// itself is built on; the plugin's own code (GPL) is not used.

const OPTIONS = optionsWithDefaults({ formatType: FormatType.NORMAL, smartCursor: false });

/** The document as lines the library can edit; the result goes back as one change. */
class Lines implements ITextEditor {
  lines: string[];
  cursor: Point;
  selection: Range | null = null;
  constructor(readonly state: EditorState) {
    this.lines = state.doc.toString().split("\n");
    const head = state.selection.main.head;
    const l = state.doc.lineAt(head);
    this.cursor = new Point(l.number - 1, head - l.from);
  }
  getCursorPosition() {
    return this.cursor;
  }
  setCursorPosition(pos: Point) {
    this.cursor = pos;
    this.selection = null;
  }
  setSelectionRange(range: Range) {
    this.selection = range;
    this.cursor = range.end;
  }
  getLastRow() {
    return this.lines.length - 1;
  }
  acceptsTableEdit(row: number) {
    // Not inside code blocks ("| a |" in a code sample stays as it is).
    if (row >= this.state.doc.lines) return true;
    const name = syntaxTree(this.state).resolveInner(this.state.doc.line(row + 1).from, 1).name;
    return !/Code|Math|HiddenComment/.test(name);
  }
  getLine(row: number) {
    return this.lines[row] ?? "";
  }
  insertLine(row: number, line: string) {
    this.lines.splice(row, 0, line);
  }
  deleteLine(row: number) {
    this.lines.splice(row, 1);
  }
  replaceLines(startRow: number, endRow: number, lines: string[]) {
    this.lines.splice(startRow, endRow - startRow, ...lines);
  }
  transact(func: () => void) {
    func();
  }
}

/** Writes what changed (only the lines between the first and last difference) and moves the caret. */
function apply(view: EditorView, ed: Lines) {
  const old = view.state.doc;
  const next = ed.lines;
  let first = 0;
  while (first < next.length && first < old.lines && old.line(first + 1).text === next[first]) first++;
  let endOld = old.lines;
  let endNew = next.length;
  while (endOld > first && endNew > first && old.line(endOld).text === next[endNew - 1]) {
    endOld--;
    endNew--;
  }
  const offset = (p: Point) => {
    let pos = 0;
    for (let i = 0; i < p.row && i < next.length; i++) pos += next[i].length + 1;
    return pos + Math.min(p.column, next[p.row]?.length ?? 0);
  };
  const changes = lineChange(old, first, endOld, next.slice(first, endNew));
  const sel = ed.selection ? EditorSelection.range(offset(ed.selection.start), offset(ed.selection.end)) : EditorSelection.cursor(offset(ed.cursor));
  view.dispatch({ changes, selection: sel, scrollIntoView: true, userEvent: "input.table" });
}

/** Old lines first+1..endOld (1-based) become `lines`, as one change with the line breaks right. */
function lineChange(old: EditorState["doc"], first: number, endOld: number, lines: string[]) {
  if (endOld === first && !lines.length) return [];
  const from = first < old.lines ? old.line(first + 1).from : old.length;
  if (endOld === first) {
    // Only new lines: before old line first+1, or after the last line.
    return first < old.lines ? { from, insert: `${lines.join("\n")}\n` } : { from, insert: `\n${lines.join("\n")}` };
  }
  const to = old.line(endOld).to;
  if (!lines.length) {
    // Only removed lines: take one line break with them.
    return endOld < old.lines ? { from, to: to + 1 } : { from: Math.max(0, from - 1), to };
  }
  return { from, to, insert: lines.join("\n") };
}

export type TableAction =
  | "format"
  | "nextCell"
  | "previousCell"
  | "nextRow"
  | "escape"
  | "insertRow"
  | "deleteRow"
  | "insertColumn"
  | "deleteColumn"
  | "rowUp"
  | "rowDown"
  | "columnLeft"
  | "columnRight"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "sortAsc"
  | "sortDesc"
  | "formulas"
  | "transpose";

/** Runs a table action at the caret. False when the caret is not in a table. Errors (formulas) are returned. */
export function tableAction(view: EditorView, action: TableAction): boolean | Error {
  const ed = new Lines(view.state);
  const te = new TableEditor(ed);
  if (!te.cursorIsInTable(OPTIONS)) return false;
  let error: Error | undefined;
  const o = OPTIONS;
  switch (action) {
    case "format":
      te.format(o);
      break;
    case "nextCell":
      te.nextCell(o);
      break;
    case "previousCell":
      te.previousCell(o);
      break;
    case "nextRow":
      te.nextRow(o);
      break;
    case "escape":
      te.escape(o);
      break;
    case "insertRow":
      te.insertRow(o);
      break;
    case "deleteRow":
      te.deleteRow(o);
      break;
    case "insertColumn":
      te.insertColumn(o);
      break;
    case "deleteColumn":
      te.deleteColumn(o);
      break;
    case "rowUp":
      te.moveRow(-1, o);
      break;
    case "rowDown":
      te.moveRow(1, o);
      break;
    case "columnLeft":
      te.moveColumn(-1, o);
      break;
    case "columnRight":
      te.moveColumn(1, o);
      break;
    case "alignLeft":
      te.alignColumn(Alignment.LEFT, o);
      break;
    case "alignCenter":
      te.alignColumn(Alignment.CENTER, o);
      break;
    case "alignRight":
      te.alignColumn(Alignment.RIGHT, o);
      break;
    case "sortAsc":
      te.sortRows(SortOrder.Ascending, o);
      break;
    case "sortDesc":
      te.sortRows(SortOrder.Descending, o);
      break;
    case "formulas":
      error = te.evaluateFormulas(o);
      break;
    case "transpose":
      te.transpose(o);
      break;
  }
  apply(view, ed);
  return error ?? true;
}

/** True when the caret's line is a table row ("| … |"), outside code. */
export function caretInTable(state: EditorState): boolean {
  const l = state.doc.lineAt(state.selection.main.head);
  if (!l.text.trimStart().startsWith("|")) return false;
  return !/Code|Math|HiddenComment/.test(syntaxTree(state).resolveInner(l.from, 1).name);
}

// After a move the library selects the cell's text, so a selection does not stop the next Tab.
const run = (action: TableAction) => (view: EditorView) => caretInTable(view.state) && tableAction(view, action) !== false;

/** Keys inside tables (before the editor's own Tab and Enter). */
export function advancedTables(): Extension {
  return Prec.high(
    keymap.of([
      { key: "Tab", run: run("nextCell") },
      { key: "Shift-Tab", run: run("previousCell") },
      { key: "Enter", run: run("nextRow") },
      { key: "Escape", run: run("escape") },
      { key: "Mod-Alt-f", run: run("format") },
    ]),
  );
}
