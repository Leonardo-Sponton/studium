import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

// The "/" menu: typing "/" at the start of a line or after a space lists what can be inserted
// (headings, lists, a callout, a table, a formula, a diagram, a template…); typing more letters
// narrows it. Picking one removes the "/…" and runs it.

export interface SlashItem {
  id: string;
  label: string;
  /** Other words it is found by (English and Portuguese names). */
  keywords?: string;
  /** Shown at the right: the shortcut or the Markdown it writes. */
  detail?: string;
  run(view: EditorView): void;
}

export function slashCompletion(items: () => SlashItem[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/(?:^|\s)\/[\p{L}\p{N}-]*$/u);
    if (!m) return null;
    const slash = m.from + m.text.lastIndexOf("/");
    // Not inside code or formulas, where "/" is just a character.
    const at = syntaxTree(ctx.state).resolveInner(ctx.pos, -1).name;
    if (/Code|Math|Comment|URL|Link/.test(at)) return null; // HiddenComment and HTML comments too
    const list = items();
    const text = list.map(it => `${it.label} ${it.keywords ?? ""} ${it.id}`);
    // All padded to one length: CodeMirror takes the length off a case-folded match ("/ponto"
    // for "Ponto…"), which would put short names first instead of the menu's own order.
    const width = Math.max(...text.map(x => x.length));
    const options: Completion[] = list.map((it, i) => ({
      label: text[i].padEnd(width),
      displayLabel: it.label,
      detail: it.detail,
      boost: -i / 100,
      apply: (view: EditorView, _c: Completion, _from: number, to: number) => {
        view.dispatch({ changes: { from: slash, to }, userEvent: "delete" });
        it.run(view);
      },
    }));
    return { from: slash + 1, options, validFor: /^[\p{L}\p{N}-]*$/u, filter: true };
  };
}

class HintWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: HintWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-slash-hint";
    span.setAttribute("aria-hidden", "true");
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

/** "Type / for commands", faint, on the empty line the caret is on (like Notion), so every note
 *  shows that the "/" menu exists. An empty note shows it under its placeholder instead. */
export function slashHint(text: string): Extension {
  const hint = (view: EditorView) => {
    const { state } = view;
    const sel = state.selection.main;
    if (!view.hasFocus || !sel.empty || state.readOnly || state.doc.length === 0) return Decoration.none;
    const line = state.doc.lineAt(sel.head);
    if (line.length) return Decoration.none;
    return Decoration.set([Decoration.widget({ widget: new HintWidget(text), side: 1 }).range(line.from)]);
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = hint(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.focusChanged || u.transactions.some(t => t.reconfigured)) this.decorations = hint(u.view);
      }
    },
    { decorations: v => v.decorations },
  );
}

/** The placeholder of an empty note, with the "/" hint on a line below it. */
export function placeholderWithHint(text: string, hint: string): HTMLElement {
  const box = document.createElement("span");
  if (text) box.append(text, document.createElement("br"));
  const h = document.createElement("span");
  h.className = "cm-slash-hint";
  h.textContent = hint;
  box.append(h);
  return box;
}
