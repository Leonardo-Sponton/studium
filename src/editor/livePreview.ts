import { foldEffect, foldService, foldable, foldedRanges, HighlightStyle, syntaxHighlighting, syntaxTree, unfoldEffect } from "@codemirror/language";
import { Facet, StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";
import { DRAWING_NAME, DrawingWidget, FILE_EXT, EmbedChipWidget, embedTarget, IMAGE_EXT, ImageWidget, NoteEmbedWidget } from "./embeds";
import { cachedDiagram, drawDiagram, escapeHTML, mathHTML } from "./render";
export { Highlight } from "./syntax";

// Live preview like Obsidian's (SPEC 4.3): Markdown is shown formatted and its symbols (#, **, >,
// [..](..), ```…) are hidden, except on the lines that hold the caret, where the raw text is
// visible for editing. A code block shows its fences while the caret is anywhere inside it; a
// table, a $$formula$$, a ```mermaid diagram and a ![[note]] embed are drawn as such until the
// caret enters them. It reads the parse tree from @codemirror/lang-markdown (with the Obsidian
// additions of ./syntax), so it follows the same rules as the parser.

const hide = Decoration.replace({});
const line = (cls: string) => Decoration.line({ class: cls });
const mark = (cls: string) => Decoration.mark({ class: cls });

// ---- Colors inside code blocks (```java …): classes styled in theme.css by theme ----

export const codeStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.modifier, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.self, tags.tagName], class: "cm-tk-kw" },
  { tag: [tags.string, tags.character, tags.special(tags.string), tags.docString], class: "cm-tk-str" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit], class: "cm-tk-num" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: "cm-tk-com" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)], class: "cm-tk-type" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.function(tags.definition(tags.variableName)), tags.macroName], class: "cm-tk-fn" },
  { tag: [tags.meta, tags.annotation, tags.attributeName], class: "cm-tk-meta" },
  { tag: [tags.propertyName, tags.labelName], class: "cm-tk-prop" },
  { tag: [tags.regexp, tags.escape], class: "cm-tk-str2" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], class: "cm-tk-op" },
  { tag: tags.invalid, class: "cm-tk-err" },
]);

// ---- Widgets ----

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("span");
    box.className = `cm-hm-check${this.checked ? " done" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

/** Small text drawn in place of hidden Markdown: a list bullet, a code block's language, a callout's name. */
class TextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly cls: string,
  ) {
    super();
  }
  eq(other: TextWidget) {
    return other.text === this.text && other.cls === this.cls;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = this.cls;
    el.textContent = this.text;
    return el;
  }
}

/** A formula drawn by KaTeX; tapping it puts the caret there, which shows the source to edit. */
class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly from: number,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display && o.from === this.from;
  }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-hm-math-block" : "cm-hm-math";
    el.innerHTML = mathHTML(this.tex, this.display);
    if (this.display) caretOnTap(el, view, this.from);
    return el;
  }
  ignoreEvent() {
    return this.display;
  }
}

/** A ```mermaid block drawn as its diagram (drawn once, then kept by source). */
class DiagramWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
  ) {
    super();
  }
  eq(o: DiagramWidget) {
    return o.source === this.source && o.from === this.from;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-hm-diagram";
    const show = (d: { svg?: string; error?: string }) => {
      if (d.svg) el.innerHTML = d.svg;
      else {
        el.classList.add("cm-hm-diagram-err");
        el.innerHTML = `<pre>${escapeHTML(this.source)}</pre><span class="cm-hm-err">${escapeHTML(d.error ?? "")}</span>`;
      }
      view.requestMeasure();
    };
    const done = cachedDiagram(this.source);
    if (done) show(done);
    else {
      el.classList.add("cm-hm-diagram-wait");
      el.textContent = "…";
      void drawDiagram(this.source).then(d => {
        el.classList.remove("cm-hm-diagram-wait");
        show(d);
      });
    }
    caretOnTap(el, view, this.from);
    return el;
  }
  get estimatedHeight() {
    return 160;
  }
  ignoreEvent() {
    return true;
  }
}

/** [^1] drawn as a small raised number; a tap goes to its text ("[^1]: …"). */
class FootnoteWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(o: FootnoteWidget) {
    return o.label === this.label;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("sup");
    el.className = "cm-hm-fn";
    el.textContent = this.label;
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      const at = view.state.doc.toString().search(new RegExp(`^\\[\\^${this.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]:`, "m"));
      if (at >= 0) view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "center" }) });
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

/** The arrow of a foldable callout ("> [!tip]-"): opens and closes it. */
class FoldArrowWidget extends WidgetType {
  constructor(
    readonly open: boolean,
    readonly lineFrom: number,
  ) {
    super();
  }
  eq(o: FoldArrowWidget) {
    return o.open === this.open && o.lineFrom === this.lineFrom;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = `cm-hm-fold${this.open ? " open" : ""}`;
    el.setAttribute("role", "button");
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      toggleFoldAt(view, this.lineFrom);
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class BreakWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    return document.createElement("br");
  }
}

/** Puts the caret at `pos` when a drawn block is tapped (so its Markdown shows for editing). */
function caretOnTap(el: HTMLElement, view: EditorView, pos: number) {
  el.addEventListener("mousedown", e => {
    if (!view.state.facet(EditorView.editable) || (e.target as HTMLElement).closest("a")) return;
    e.preventDefault();
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
  });
}

// ---- Folding: headings and lists (lang-markdown) and callouts (here) ----

const CALLOUT_LINE = /^\s*>\s?\[![\w-]+\]([+-]?)/;

/** A callout folds from the end of its title line to its last line. */
const calloutFold = foldService.of((state, lineStart) => {
  const first = state.doc.lineAt(lineStart);
  if (!CALLOUT_LINE.test(first.text)) return null;
  let last = first.number;
  while (last < state.doc.lines && /^\s*>/.test(state.doc.line(last + 1).text)) last++;
  return last === first.number ? null : { from: first.to, to: state.doc.line(last).to };
});

function foldAt(state: EditorState, lineFrom: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(lineFrom, state.doc.lineAt(lineFrom).to + 1, (from, to) => {
    found = { from, to };
  });
  return found;
}

function toggleFoldAt(view: EditorView, lineFrom: number) {
  const folded = foldAt(view.state, lineFrom);
  if (folded) view.dispatch({ effects: unfoldEffect.of(folded) });
  else {
    const l = view.state.doc.lineAt(lineFrom);
    const range = foldable(view.state, l.from, l.to);
    if (range) view.dispatch({ effects: foldEffect.of(range) });
  }
}

/** Folds every callout written as closed ("> [!faq]- Question"), as Obsidian shows them. */
export function closedCallouts(state: EditorState): StateEffect<{ from: number; to: number }>[] {
  const out: StateEffect<{ from: number; to: number }>[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    if (CALLOUT_LINE.exec(l.text)?.[1] !== "-") continue;
    const range = foldable(state, l.from, l.to);
    if (range) out.push(foldEffect.of(range));
  }
  return out;
}

/** The cells of a table row: "| a | b |" → ["a", "b"] (escaped "\|" stays in the cell). */
export function tableCells(row: string): string[] {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));
}

type Align = "left" | "center" | "right" | "";

/** A Markdown table: header row, the "---" row (column alignment), body rows. */
export function parseTable(text: string): { head: string[]; align: Align[]; rows: string[][] } | null {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return null;
  const align = tableCells(lines[1]).map((c): Align => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : "";
  });
  return { head: tableCells(lines[0]), align, rows: lines.slice(2).map(tableCells) };
}

const INLINE = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|~~(.+?)~~|==(.+?)==|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)[^)]*\)/;

/** Bold, italic, strike, highlight, code and links inside a table cell, as DOM (never HTML). */
function inlineDOM(text: string, parent: HTMLElement) {
  while (text) {
    const m = INLINE.exec(text);
    if (!m) {
      parent.append(text);
      return;
    }
    if (m.index) parent.append(text.slice(0, m.index));
    const el = (tag: string, cls: string) => Object.assign(document.createElement(tag), { className: cls });
    if (m[2] !== undefined) inlineDOM(m[2], parent.appendChild(el("strong", "cm-hm-strong")));
    else if (m[4] !== undefined) inlineDOM(m[4], parent.appendChild(el("em", "cm-hm-em")));
    else if (m[5] !== undefined) inlineDOM(m[5], parent.appendChild(el("span", "cm-hm-strike")));
    else if (m[6] !== undefined) inlineDOM(m[6], parent.appendChild(el("mark", "cm-hm-hl")));
    else if (m[7] !== undefined) parent.appendChild(el("code", "cm-hm-code")).textContent = m[7];
    else {
      const a = parent.appendChild(el("span", "cm-hm-link"));
      a.dataset.href = m[9];
      inlineDOM(m[8], a);
    }
    text = text.slice(m.index + m[0].length);
  }
}

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-hm-tablewrap";
    const t = parseTable(this.source);
    if (!t) return wrap;
    const table = wrap.appendChild(document.createElement("table"));
    table.className = "cm-hm-rtable";
    const row = (cells: string[], tag: "th" | "td", parent: HTMLElement) => {
      const tr = parent.appendChild(document.createElement("tr"));
      for (let i = 0; i < Math.max(cells.length, t.head.length); i++) {
        const c = tr.appendChild(document.createElement(tag));
        if (t.align[i]) c.style.textAlign = t.align[i];
        inlineDOM(cells[i] ?? "", c);
      }
    };
    row(t.head, "th", table.appendChild(document.createElement("thead")));
    const body = table.appendChild(document.createElement("tbody"));
    for (const r of t.rows) row(r, "td", body);
    // A tap on the table (not on a link) puts the caret in it: the Markdown shows for editing.
    wrap.addEventListener("mousedown", e => {
      if ((e.target as HTMLElement).closest("[data-href]") || !view.state.facet(EditorView.editable)) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

// ---- Inline decorations (view plugin: only the visible part of long handouts) ----

/** Line numbers that show raw Markdown: every line touched by a selection, while focused. */
function caretLines(view: EditorView): Set<number> {
  const out = new Set<number>();
  if (!view.hasFocus) return out;
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

export const CALLOUT = /^\[!([A-Za-z-]+)\][+-]?/;
export const CALLOUT_ICON: Record<string, string> = { note: "ℹ", tip: "✦", warn: "⚠", danger: "✖", example: "☰", quote: "❝" };

/** "> [!tip]-": the callout's icon, its name when it has no title, and the fold arrow. */
class CalloutHeadWidget extends WidgetType {
  constructor(
    readonly kind: string,
    readonly label: string,
    readonly open: boolean | null,
    readonly lineFrom: number,
  ) {
    super();
  }
  /** What the reader sees as text (the icon aside). */
  get text() {
    return this.label;
  }
  eq(o: CalloutHeadWidget) {
    return o.kind === this.kind && o.label === this.label && o.open === this.open && o.lineFrom === this.lineFrom;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-hm-callout-label";
    el.append(Object.assign(document.createElement("span"), { className: "cm-hm-callout-icon", textContent: CALLOUT_ICON[this.kind] ?? "ℹ" }));
    if (this.label) el.append(this.label);
    if (this.open !== null) {
      el.append(new FoldArrowWidget(this.open, this.lineFrom).toDOM(view));
      el.classList.add("foldable");
    }
    return el;
  }
  ignoreEvent() {
    return this.open !== null;
  }
}
export const CALLOUT_KIND: Record<string, string> = {
  note: "note", info: "note", todo: "note", abstract: "note", summary: "note", tldr: "note",
  tip: "tip", hint: "tip", important: "tip", success: "tip", check: "tip", done: "tip",
  question: "warn", help: "warn", faq: "warn", warning: "warn", caution: "warn", attention: "warn",
  danger: "danger", error: "danger", bug: "danger", failure: "danger", fail: "danger", missing: "danger",
  example: "example", quote: "quote", cite: "quote",
};

/** "https://…", "mailto:…" or "www.…" — what a click may open. */
const openable = (url: string) => /^(https?:|mailto:|www\.)/i.test(url);

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** True when an embed is all there is on its line (then it is drawn as a block). */
function embedAlone(state: EditorState, from: number, to: number): boolean {
  const l = state.doc.lineAt(from);
  return to <= l.to && state.sliceDoc(l.from, from).trim() === "" && state.sliceDoc(to, l.to).trim() === "";
}

function embedLabel(t: { name: string; heading: string; alias: string }): string {
  const ext = /\.([a-z]\w*)$/i.exec(t.name)?.[1].toLowerCase();
  const icon = ext === "pdf" ? "📄" : ext === "excalidraw" || /\.excalidraw$/i.test(t.name) ? "✏️" : ext && ext !== "md" ? "📎" : "↪";
  return `${icon} ${t.alias || (t.heading ? `${t.name} › ${t.heading}` : t.name)}`;
}

/** Simple inline HTML that Obsidian shows formatted: <u>, <sub>, <sup>, <kbd>, <mark>, <s>, <small>, <br>. */
const HTML_TAGS = new Set(["u", "sub", "sup", "kbd", "mark", "s", "del", "ins", "small", "b", "strong", "i", "em"]);

/**
 * The decorations for `ranges` of the text. `raw` holds the line numbers shown as plain Markdown.
 * Pure (no DOM), so tests can call it.
 */
export function buildDecorations(state: EditorState, ranges: readonly { from: number; to: number }[], raw: Set<number>): DecorationSet {
  const doc = state.doc;
  const isRaw = (pos: number) => raw.has(doc.lineAt(pos).number);
  const decos: Range<Decoration>[] = [];
  const eachLine = (from: number, to: number, cls: string) => {
    for (let pos = from; pos <= to; ) {
      const l = doc.lineAt(pos);
      decos.push(line(cls).range(l.from));
      pos = l.to + 1;
    }
  };
  // Hides a symbol and the space right after it ("# ", "> ").
  const hideMark = (from: number, to: number, withSpace = false) => {
    if (isRaw(from)) return;
    if (withSpace && state.sliceDoc(to, to + 1) === " ") to++;
    if (to > from) decos.push(hide.range(from, to));
  };
  const link = (from: number, to: number, url: string) =>
    decos.push(
      (isRaw(from) || !openable(url) ? mark("cm-hm-link") : Decoration.mark({ class: "cm-hm-link", attributes: { "data-href": url } })).range(from, to),
    );

  // Pairs of <tag>…</tag> inside one paragraph: the text between gets the tag's look.
  const htmlTags = (para: SyntaxNode) => {
    const open = new Map<string, number[]>();
    for (const t of para.getChildren("HTMLTag")) {
      const m = /^<(\/?)([a-z]+)\s*(\/?)>$/i.exec(state.sliceDoc(t.from, t.to));
      if (!m) continue;
      const tag = m[2].toLowerCase();
      if (tag === "br") {
        if (!isRaw(t.from)) decos.push(Decoration.replace({ widget: new BreakWidget() }).range(t.from, t.to));
        continue;
      }
      if (!HTML_TAGS.has(tag)) continue;
      if (!m[1]) {
        (open.get(tag) ?? open.set(tag, []).get(tag)!).push(t.from, t.to);
        continue;
      }
      const stack = open.get(tag);
      if (!stack?.length) continue;
      const startTo = stack.pop()!;
      const startFrom = stack.pop()!;
      if (t.from > startTo) decos.push(mark(`cm-hm-html-${tag}`).range(startTo, t.from));
      hideMark(startFrom, startTo);
      hideMark(t.from, t.to);
    }
  };

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: node => {
        const name = node.name;
        const h = /^ATXHeading(\d)$/.exec(name) ?? /^SetextHeading(\d)$/.exec(name);
        if (h) {
          decos.push(line(`cm-hm-h${h[1]}`).range(doc.lineAt(node.from).from));
          return;
        }
        switch (name) {
          case "HeaderMark": {
            if (node.node.parent?.name.startsWith("Setext")) {
              // The "===" / "---" line under a Setext heading.
              if (!isRaw(node.from)) decos.push(hide.range(node.from, node.to));
              break;
            }
            // Opening "# " at the start, or optional closing " #" at the end.
            const atStart = node.from === doc.lineAt(node.from).from;
            if (atStart) hideMark(node.from, node.to, true);
            else hideMark(state.sliceDoc(node.from - 1, node.from) === " " ? node.from - 1 : node.from, node.to);
            break;
          }
          case "Blockquote": {
            // "> [!tip] Title": an Obsidian callout, colored by its kind.
            const first = doc.lineAt(node.from);
            const m = CALLOUT.exec(first.text.replace(/^\s*>\s?/, ""));
            const kind = m ? (CALLOUT_KIND[m[1].toLowerCase()] ?? "note") : "";
            eachLine(node.from, node.to, kind ? `cm-hm-callout cm-hm-callout-${kind}` : "cm-hm-quote");
            if (m) {
              const at = first.from + first.text.indexOf("[!");
              const end = at + m[0].length;
              const foldMark = m[0].slice(-1);
              const foldable = foldMark === "+" || foldMark === "-";
              if (!isRaw(at)) {
                const titled = first.text.slice(end - first.from).trim() !== "";
                const label = titled ? "" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
                const head = new CalloutHeadWidget(kind, label, foldable ? !foldAt(state, first.from) : null, first.from);
                decos.push(Decoration.replace({ widget: head }).range(at, titled && state.sliceDoc(end, end + 1) === " " ? end + 1 : end));
              }
              decos.push(mark("cm-hm-callout-title").range(at, first.to));
            }
            break;
          }
          case "QuoteMark":
            hideMark(node.from, node.to, true);
            break;
          case "Paragraph": {
            // #tags (Notes filters by them).
            const text = state.sliceDoc(node.from, node.to);
            for (const m of text.matchAll(/(^|[\s(])#(\p{L}[\p{L}\p{N}_/-]*)/gu)) {
              const at = node.from + m.index + m[1].length;
              decos.push(mark("cm-hm-tag").range(at, at + m[2].length + 1));
            }
            // "text ^block-id": the id Obsidian links to ([[note#^block-id]]), faded.
            for (const m of text.matchAll(/ \^([A-Za-z0-9-]+)[ \t]*$/gm)) {
              const at = node.from + m.index + 1;
              decos.push(mark("cm-hm-blockid").range(at, at + m[1].length + 1));
            }
            // "[^1]: text" (a footnote's text): a small number in place of the label.
            const def = /^\[\^([^\]\s]+)\]:[ \t]?/.exec(text);
            if (def) {
              eachLine(node.from, node.to, "cm-hm-fndef");
              if (!isRaw(node.from)) decos.push(Decoration.replace({ widget: new TextWidget(def[1], "cm-hm-fnlabel") }).range(node.from, node.from + def[0].length));
              return false;
            }
            htmlTags(node.node);
            break;
          }
          case "WikiLink": {
            // [[Note]] shows "Note"; [[Note|other words]] shows "other words".
            const inner = state.sliceDoc(node.from + 2, node.to - 2);
            if (isRaw(node.from)) {
              decos.push(mark("cm-hm-wiki").range(node.from, node.to));
              return false;
            }
            const bar = inner.indexOf("|");
            const textFrom = bar < 0 ? node.from + 2 : node.from + 3 + bar;
            decos.push(hide.range(node.from, textFrom));
            if (node.to - 2 > textFrom) decos.push(mark("cm-hm-wiki").range(textFrom, node.to - 2));
            // [[Note#Part]] reads "Note › Part".
            const hash = bar < 0 ? inner.indexOf("#") : -1;
            if (hash > 0) decos.push(Decoration.replace({ widget: new TextWidget(" › ", "cm-hm-wiki") }).range(node.from + 2 + hash, node.from + 3 + hash));
            decos.push(hide.range(node.to - 2, node.to));
            return false;
          }
          case "Embed": {
            const target = embedTarget(state.sliceDoc(node.from + 3, node.to - 2));
            if (isRaw(node.from)) {
              decos.push(mark("cm-hm-wiki").range(node.from, node.to));
              return false;
            }
            if (IMAGE_EXT.test(target.name)) {
              decos.push(Decoration.replace({ widget: new ImageWidget(target.name, target.name, target.width, target.height) }).range(node.from, node.to));
            } else if (DRAWING_NAME.test(target.name) && embedAlone(state, node.from, node.to)) {
              // Drawn by the block field.
            } else if (!embedAlone(state, node.from, node.to) || FILE_EXT.test(target.name) && !/\.md$/i.test(target.name)) {
              // A note inside a sentence, a PDF, a drawing…: a chip that opens it.
              decos.push(Decoration.replace({ widget: new EmbedChipWidget(target, embedLabel(target)) }).range(node.from, node.to));
            }
            // A note on a line of its own is drawn by the block field (blockDecorations).
            return false;
          }
          case "FootnoteRef":
            if (isRaw(node.from)) decos.push(mark("cm-hm-fn-raw").range(node.from, node.to));
            else decos.push(Decoration.replace({ widget: new FootnoteWidget(state.sliceDoc(node.from + 2, node.to - 1)) }).range(node.from, node.to));
            return false;
          case "InlineFootnote":
            decos.push(mark("cm-hm-fn-inline").range(node.from, node.to));
            break;
          case "FootnoteMark":
            hideMark(node.from, node.to);
            break;
          case "InlineMath":
            if (isRaw(node.from)) decos.push(mark("cm-hm-math-raw").range(node.from, node.to));
            else {
              const open = state.sliceDoc(node.from, node.from + 2) === "$$" ? 2 : 1;
              const tex = state.sliceDoc(node.from + open, node.to - open);
              decos.push(Decoration.replace({ widget: new MathWidget(tex, false, node.from) }).range(node.from, node.to));
            }
            return false;
          case "MathBlock":
            // Drawn by the block field; with the caret inside, the source in a box.
            eachLine(node.from, node.to, "cm-hm-math-src");
            return false;
          case "HiddenComment":
            // %%note to self%%: faded, the %% shown only on the caret line.
            decos.push(mark("cm-hm-comment").range(node.from, node.to));
            hideMark(node.from, node.from + 2);
            hideMark(node.to - 2, node.to);
            return false;
          case "HiddenCommentBlock":
            eachLine(node.from, node.to, "cm-hm-comment");
            return false;
          case "CommentBlock":
          case "Comment":
            // HTML <!-- comments --> (the formulas line under a table, for one): faded too.
            decos.push(mark("cm-hm-comment").range(node.from, node.to));
            return false;
          case "StrongEmphasis":
            decos.push(mark("cm-hm-strong").range(node.from, node.to));
            break;
          case "Emphasis":
            decos.push(mark("cm-hm-em").range(node.from, node.to));
            break;
          case "Strikethrough":
            decos.push(mark("cm-hm-strike").range(node.from, node.to));
            break;
          case "Highlight":
            decos.push(mark("cm-hm-hl").range(node.from, node.to));
            break;
          case "InlineCode":
            decos.push(mark("cm-hm-code").range(node.from, node.to));
            break;
          case "EmphasisMark":
          case "StrikethroughMark":
          case "HighlightMark":
            hideMark(node.from, node.to);
            break;
          case "Escape":
            // "\*" shows "*".
            hideMark(node.from, node.from + 1);
            break;
          case "CodeMark":
            if (node.node.parent?.name === "InlineCode") hideMark(node.from, node.to);
            break;
          case "FencedCode": {
            const first = doc.lineAt(node.from);
            const last = doc.lineAt(node.to);
            let rawBlock = false;
            for (let n = first.number; n <= last.number && !rawBlock; n++) rawBlock = raw.has(n);
            const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
            for (let n = first.number; n <= last.number; n++) {
              const l = doc.line(n);
              const edge = n === first.number ? " cm-hm-cb-first" : n === last.number ? " cm-hm-cb-last" : "";
              decos.push(line(`cm-hm-codeblock${edge}`).range(l.from));
            }
            if (!rawBlock) {
              // The fences give way to a small label with the language.
              const lang = /^\s*(?:`{3,}|~{3,})\s*([^\s`]*)/.exec(first.text)?.[1] ?? "";
              decos.push(Decoration.replace({ widget: new TextWidget(lang, "cm-hm-cb-lang") }).range(first.from, first.to));
              if (closed && last.to > last.from) decos.push(hide.range(last.from, last.to));
            }
            return false;
          }
          case "CodeBlock":
            eachLine(node.from, node.to, "cm-hm-codeblock cm-hm-cb-indented");
            return false;
          case "Table":
            eachLine(node.from, node.to, "cm-hm-table");
            break;
          case "TableDelimiter":
            decos.push(mark("cm-hm-pipe").range(node.from, node.to));
            break;
          case "Link":
          case "Image": {
            const marks = node.node.getChildren("LinkMark");
            const url = node.node.getChild("URL");
            const href = url ? state.sliceDoc(url.from, url.to).replace(/^<|>$/g, "") : "";
            // [text](url): only "text" stays. [text][ref] and [text] are left as they are.
            if (marks.length >= 4 && url && marks[1].to <= url.from) {
              const textFrom = marks[0].to;
              const textTo = marks[1].from;
              if (name === "Image") {
                // ![alt](url) or ![alt|300](attachments/a.png): web pictures and pictures in the data folder.
                if (!isRaw(node.from) && (/^(https?:|data:image\/)/i.test(href) || (!/^\w+:/.test(href) && IMAGE_EXT.test(href)))) {
                  const alt = state.sliceDoc(textFrom, textTo);
                  const size = /\|(\d+)(?:x(\d+))?$/.exec(alt);
                  const src = /^\w+:/.test(href) ? href : safeDecode(href);
                  decos.push(Decoration.replace({ widget: new ImageWidget(src, size ? alt.slice(0, size.index) : alt, size ? Number(size[1]) : undefined, size?.[2] ? Number(size[2]) : undefined) }).range(node.from, node.to));
                } else link(node.from, node.to, href);
                return false;
              }
              if (textTo > textFrom) link(textFrom, textTo, href);
              hideMark(marks[0].from, marks[0].to);
              hideMark(marks[1].from, node.to);
            } else if (name === "Link" && marks.length === 2 && url) {
              // <https://…>
              link(url.from, url.to, href);
              hideMark(marks[0].from, marks[0].to);
              hideMark(marks[1].from, marks[1].to);
            } else decos.push(mark("cm-hm-link").range(node.from, node.to));
            break;
          }
          case "URL":
            // A bare https://… (GFM autolink); URLs inside [..](..) are handled above.
            if (!/^(Link|Image)$/.test(node.node.parent?.name ?? "")) {
              const href = state.sliceDoc(node.from, node.to);
              link(node.from, node.to, /^www\./i.test(href) ? `https://${href}` : href);
            }
            break;
          case "HorizontalRule":
            if (!isRaw(node.from)) {
              decos.push(line("cm-hm-hr").range(doc.lineAt(node.from).from));
              decos.push(hide.range(node.from, node.to));
            }
            break;
          case "ListMark": {
            // "- [ ] task": the "- " is hidden and the box is drawn instead; "- item" gets a bullet.
            const next = node.node.nextSibling;
            const bullet = node.node.parent?.parent?.name === "BulletList";
            if (next?.name === "Task") hideMark(node.from, node.to, true);
            else if (bullet && !isRaw(node.from)) decos.push(Decoration.replace({ widget: new TextWidget("•", "cm-hm-bullet") }).range(node.from, node.to));
            else decos.push(mark(bullet ? "cm-hm-bullet" : "cm-hm-number").range(node.from, node.to));
            break;
          }
          case "TaskMarker": {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            decos.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to));
            const task = node.node.parent;
            if (checked && task && task.to > node.to) decos.push(mark("cm-hm-done").range(node.to, task.to));
            break;
          }
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

/** Flips "[ ]" ↔ "[x]" for the task box that starts at `pos`. */
export function toggleTask(state: EditorState, pos: number) {
  const box = state.sliceDoc(pos, pos + 3);
  if (!/^\[[ xX]\]$/.test(box)) return null;
  return { from: pos + 1, to: pos + 2, insert: box[1] === " " ? "x" : " " };
}

// ---- Blocks drawn as such: tables, $$formulas$$, ```mermaid, ![[note]] (block widgets must come from a state field) ----

const setFocus = StateEffect.define<boolean>();

/**
 * Every table, formula block, diagram and note embed the caret is not in, drawn. Pure, so tests
 * can call it.
 */
export function blockDecorations(state: EditorState, focused: boolean): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  const span = (node: { from: number; to: number }) => {
    const from = state.doc.lineAt(node.from).from;
    const to = state.doc.lineAt(node.to).to;
    return { from, to, inside: focused && sel.some(r => r.to >= from && r.from <= to) };
  };
  const block = (from: number, to: number, widget: WidgetType) => decos.push(Decoration.replace({ widget, block: true }).range(from, to));
  syntaxTree(state).iterate({
    enter: node => {
      switch (node.name) {
        case "Table": {
          const { from, to, inside } = span(node);
          if (!inside) block(from, to, new TableWidget(state.sliceDoc(from, to), from));
          return false;
        }
        case "MathBlock": {
          const { from, to, inside } = span(node);
          if (!inside) {
            const src = state.sliceDoc(node.from, node.to).replace(/^\s*\$\$/, "").replace(/\$\$\s*$/, "");
            block(from, to, new MathWidget(src.trim(), true, from));
          }
          return false;
        }
        case "FencedCode": {
          const first = state.doc.lineAt(node.from);
          if (/^\s*(`{3,}|~{3,})\s*mermaid\s*$/i.test(first.text)) {
            const { from, to, inside } = span(node);
            const last = state.doc.lineAt(node.to);
            const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
            if (!inside && closed) block(from, to, new DiagramWidget(state.sliceDoc(first.to + 1, last.from).replace(/\n$/, ""), from));
          }
          return false;
        }
        case "Paragraph": {
          // ![[Note]] alone on its line: the note's text in a box.
          for (const e of node.node.getChildren("Embed")) {
            if (!embedAlone(state, e.from, e.to)) continue;
            const target = embedTarget(state.sliceDoc(e.from + 3, e.to - 2));
            if (DRAWING_NAME.test(target.name)) {
              const { from, to, inside } = span(e);
              if (!inside) block(from, to, new DrawingWidget(target.name));
              continue;
            }
            if (IMAGE_EXT.test(target.name) || (FILE_EXT.test(target.name) && !/\.md$/i.test(target.name))) continue;
            const { from, to, inside } = span(e);
            if (!inside) block(from, to, new NoteEmbedWidget({ ...target, name: target.name.replace(/\.md$/i, "") }, from));
          }
          return false;
        }
      }
      // These are blocks: only look inside the blocks that can hold them.
      return node.name === "Document" || node.name === "Blockquote" || node.name === "BulletList" || node.name === "OrderedList" || node.name === "ListItem";
    },
  });
  return Decoration.set(decos, true);
}

/** Old name, kept for the tests. */
export const tableDecorations = blockDecorations;

const blocks = StateField.define<{ focused: boolean; decos: DecorationSet }>({
  create: state => ({ focused: false, decos: blockDecorations(state, false) }),
  update(v, tr) {
    let focused = v.focused;
    for (const e of tr.effects) if (e.is(setFocus)) focused = e.value;
    if (!tr.docChanged && !tr.selection && focused === v.focused && syntaxTree(tr.startState) === syntaxTree(tr.state)) return v;
    return { focused, decos: blockDecorations(tr.state, focused) };
  },
  provide: f => EditorView.decorations.from(f, v => v.decos),
});

const folding = (u: ViewUpdate) => u.transactions.some(tr => tr.effects.some(e => e.is(foldEffect) || e.is(unfoldEffect)));

const inline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state, view.visibleRanges, caretLines(view));
    }
    update(u: ViewUpdate) {
      // A code block's language arrives a moment later (loaded on demand): its tree changes then.
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged || folding(u) || syntaxTree(u.startState) !== syntaxTree(u.state))
        this.decorations = buildDecorations(u.state, u.view.visibleRanges, caretLines(u.view));
    }
  },
  {
    decorations: v => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const el = e.target as HTMLElement;
        // Tapping a box toggles it without moving the caret or opening the Android keyboard.
        if (el.classList?.contains("cm-hm-check")) {
          if (!view.state.facet(EditorView.editable)) return false;
          const change = toggleTask(view.state, view.posAtDOM(el));
          if (!change) return false;
          e.preventDefault();
          view.dispatch({ changes: change, userEvent: "input.toggle" });
          return true;
        }
        // A link opens (in the browser); with the caret on its line it is plain text to edit.
        const href = el.closest?.("[data-href]")?.getAttribute("data-href");
        if (href && e.button === 0) {
          e.preventDefault();
          view.state.facet(linkOpener)[0]?.(/^www\./i.test(href) ? `https://${href}` : href);
          return true;
        }
        return false;
      },
    },
  },
);

/** What opens a link that was clicked (the platform's browser). */
export const linkOpener = Facet.define<(url: string) => void>();

export function livePreview(openLink?: (url: string) => void): Extension {
  return [
    inline,
    blocks,
    calloutFold,
    syntaxHighlighting(codeStyle),
    EditorView.focusChangeEffect.of((_s, focusing) => setFocus.of(focusing)),
    openLink ? linkOpener.of(openLink) : [],
  ];
}
