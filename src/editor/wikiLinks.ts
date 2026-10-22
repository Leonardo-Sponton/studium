import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// [[Links]] between notes, as in Obsidian: "[[Title]]" is drawn as a link by the live preview and
// a click (or tap) opens it; typing "[[" lists the titles that can be linked. What a name opens
// is up to the caller (the app's link resolver, or data/study resolveLink in Study).
// [[#Heading]] jumps to a heading of the same note.

export interface WikiLinks {
  open(name: string): void;
  /** Titles offered after "[[" (notes, materials, subjects…). */
  names(): string[];
  /** A note's text by its title, for ![[Note]] embeds. */
  read?(name: string): Promise<string | null>;
}

const LINK = /!?\[\[([^[\]\n]+)\]\]/g;

/** The [[…]] around a document position: its target ("Note", "#Heading") or null. */
function linkAt(view: EditorView, pos: number): { name: string; heading: string } | null {
  const line = view.state.doc.lineAt(pos);
  for (const m of line.text.matchAll(LINK)) {
    const from = line.from + m.index;
    if (pos < from || pos > from + m[0].length) continue;
    const target = m[1].split("|")[0];
    const hash = target.indexOf("#");
    return { name: (hash < 0 ? target : target.slice(0, hash)).trim(), heading: hash < 0 ? "" : target.slice(hash + 1).trim() };
  }
  return null;
}

/** Puts the caret on the heading called `heading` in this note. */
function goToHeading(view: EditorView, heading: string): boolean {
  const want = heading.replace(/^\^/, "").toLowerCase();
  const doc = view.state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text);
    // A heading, or a "^block-id" at the end of a line.
    if ((h && h[1].toLowerCase() === want) || text.endsWith(` ^${want}`)) {
      const at = doc.line(n).from;
      view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "start", yMargin: 24 }) });
      return true;
    }
  }
  return false;
}

/** "[[" autocomplete: the titles the links can open. */
export function wikiCompletion(names: () => string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.matchBefore(/\[\[[^[\]\n|#]*$/);
    if (!before) return null;
    const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
    return {
      from: before.from + 2,
      options: [...new Set(names())].map(label => ({ label, apply: after === "]]" ? label : `${label}]]` })),
      validFor: /^[^[\]\n|#]*$/,
    };
  };
}

export function wikiLinks(links: { current: WikiLinks | undefined }): Extension {
  return EditorView.domEventHandlers({
    // Click on a link opens it; Ctrl/Alt+click puts the caret there to edit it.
    mousedown(e, view) {
      if (e.button !== 0 || e.ctrlKey || e.altKey || e.metaKey) return false;
      if (!(e.target as HTMLElement).closest(".cm-hm-wiki")) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      const target = pos === null ? null : linkAt(view, pos);
      if (!target) return false;
      if (!target.name) {
        if (!target.heading) return false;
        e.preventDefault();
        return goToHeading(view, target.heading);
      }
      if (!links.current) return false;
      e.preventDefault();
      links.current.open(target.name);
      return true;
    },
  });
}
