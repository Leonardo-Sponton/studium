import { Facet } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";

// ![[Embeds]] and pictures stored in the data folder. The editor only knows names; the app tells
// it where they are (Editor → embedSource): pictures become object URLs, notes their text.

export interface EmbedSource {
  /** A picture by name or path ("Pasted image 2026….png", "attachments/a.png"), as a URL, or null. */
  image(name: string): Promise<string | null>;
  /** A note's text by its title (for ![[Note]]), or null when there is none. */
  note?(name: string): Promise<string | null>;
  /** Opens what a ![[name]] points to (a note, a PDF…). */
  open?(name: string): void;
  /** An Excalidraw drawing as SVG text ("" when it is empty), or null when there is none. */
  drawing?(name: string): Promise<string | null>;
  /** Calls back when a drawing is saved (shown drawings redraw). Returns a function that stops it. */
  onDrawingSaved?(cb: () => void): () => void;
}

export const embedSource = Facet.define<EmbedSource, EmbedSource | null>({ combine: v => v[0] ?? null });

/** Draws an embedded note as Markdown (the editor sets it: a read-only editor inside the widget). */
export const embedRenderer = Facet.define<(parent: HTMLElement, text: string) => () => void, ((parent: HTMLElement, text: string) => () => void) | null>({
  combine: v => v[0] ?? null,
});

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
/** "x.pdf", "a.tar" — not "Drawing 2026-10-18 18.28.45" (an extension starts with a letter). */
export const FILE_EXT = /\.[a-z]\w*$/i;
/** ![[Drawing.excalidraw]] / ![[Drawing.excalidraw.md]]: an Excalidraw drawing. */
export const DRAWING_NAME = /\.excalidraw(\.md)?$/i;

export interface EmbedTarget {
  name: string;
  /** "#Heading" part, without "#". */
  heading: string;
  /** Text after "|": "300" / "300x200" sizes a picture, anything else is shown text. */
  alias: string;
  width?: number;
  height?: number;
}

/** "Note#Part|300x200" → its pieces. */
export function embedTarget(inner: string): EmbedTarget {
  const bar = inner.indexOf("|");
  const left = bar < 0 ? inner : inner.slice(0, bar);
  const alias = bar < 0 ? "" : inner.slice(bar + 1).trim();
  const hash = left.indexOf("#");
  const name = (hash < 0 ? left : left.slice(0, hash)).trim();
  const heading = hash < 0 ? "" : left.slice(hash + 1).trim();
  const size = /^(\d+)(?:x(\d+))?$/.exec(alias);
  return { name, heading, alias, width: size ? Number(size[1]) : undefined, height: size?.[2] ? Number(size[2]) : undefined };
}

/** The part of a note under "# heading" (up to the next heading of the same or a higher level). */
export function sectionOf(text: string, heading: string): string {
  if (!heading) return text;
  const lines = text.split("\n");
  const want = heading.toLowerCase();
  const at = lines.findIndex(l => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, "").trim().toLowerCase() === want);
  if (at < 0) return text;
  const level = /^#+/.exec(lines[at])![0].length;
  let end = at + 1;
  while (end < lines.length && !(/^#{1,6}\s/.test(lines[end]) && /^#+/.exec(lines[end])![0].length <= level)) end++;
  return lines.slice(at, end).join("\n");
}

/** A picture: from the web/data URL directly, from the data folder through embedSource. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width?: number,
    readonly height?: number,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt && o.width === this.width && o.height === this.height;
  }
  toDOM(view: EditorView) {
    const img = document.createElement("img");
    img.className = "cm-hm-img";
    img.alt = this.alt;
    if (this.width) img.style.width = `${this.width}px`;
    if (this.height) img.style.height = `${this.height}px`;
    // Offline (Android has no internet access) or missing: the name instead of a broken picture.
    const fail = () => img.replaceWith(Object.assign(document.createElement("span"), { className: "cm-hm-wiki cm-hm-missing", textContent: this.alt || this.src }));
    img.onerror = fail;
    img.onload = () => view.requestMeasure();
    if (/^(https?:|data:image\/|blob:)/i.test(this.src)) img.src = this.src;
    else {
      const source = view.state.facet(embedSource);
      if (!source) queueMicrotask(fail);
      else
        source.image(this.src).then(
          url => (url ? (img.src = url) : fail()),
          fail,
        );
    }
    return img;
  }
  ignoreEvent() {
    return false;
  }
}

/** ![[Note]] on a line of its own: the note's text in a box, with its name to open it. */
export class NoteEmbedWidget extends WidgetType {
  private stop?: () => void;
  constructor(
    readonly target: EmbedTarget,
    readonly from: number,
  ) {
    super();
  }
  eq(o: NoteEmbedWidget) {
    return o.target.name === this.target.name && o.target.heading === this.target.heading && o.from === this.from;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("div");
    box.className = "cm-hm-embed";
    const head = box.appendChild(document.createElement("div"));
    head.className = "cm-hm-embed-head";
    const name = head.appendChild(document.createElement("span"));
    name.className = "cm-hm-wiki";
    name.textContent = this.target.heading ? `${this.target.name} › ${this.target.heading}` : this.target.name;
    const body = box.appendChild(document.createElement("div"));
    body.className = "cm-hm-embed-body";
    const source = view.state.facet(embedSource);
    const render = view.state.facet(embedRenderer);
    name.addEventListener("mousedown", e => {
      e.preventDefault();
      source?.open?.(this.target.name);
    });
    // A tap beside the name puts the caret on the line, to edit the ![[…]] itself.
    head.addEventListener("mousedown", e => {
      if (e.target === name || !view.state.facet(EditorView.editable)) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    if (!source?.note) {
      box.classList.add("cm-hm-missing");
      return box;
    }
    source.note(this.target.name).then(async text => {
      // ![[Excalidraw/Plan]]: no note by that name, but maybe a drawing.
      if (text === null && source.drawing) {
        const drawn = new DrawingWidget(this.target.name);
        box.className = "cm-hm-embed-drawing";
        box.replaceChildren(drawn.toDOM(view));
        this.stop = () => drawn.destroy();
        return;
      }
      if (text === null) {
        box.classList.add("cm-hm-missing");
        return;
      }
      if (render) this.stop = render(body, sectionOf(text, this.target.heading).trim());
      else body.textContent = text;
      view.requestMeasure();
    });
    return box;
  }
  destroy() {
    this.stop?.();
  }
  ignoreEvent() {
    return true;
  }
}

/** ![[Drawing.excalidraw]] on a line of its own: the drawing as a picture; a tap opens it. */
export class DrawingWidget extends WidgetType {
  private stop?: () => void;
  constructor(readonly name: string) {
    super();
  }
  eq(o: DrawingWidget) {
    return o.name === this.name;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("div");
    box.className = "cm-hm-drawing";
    box.title = this.name;
    const source = view.state.facet(embedSource);
    box.addEventListener("mousedown", e => {
      e.preventDefault();
      source?.open?.(this.name);
    });
    const draw = () =>
      source?.drawing?.(this.name).then(
        svg => {
          box.classList.toggle("empty", svg === "");
          box.classList.toggle("cm-hm-missing", svg === null);
          if (svg) box.innerHTML = svg;
          else box.textContent = svg === "" ? `✏️ ${this.name}` : this.name;
          view.requestMeasure();
        },
        () => {
          box.classList.add("cm-hm-missing");
          box.textContent = this.name;
        },
      );
    box.textContent = `✏️ ${this.name}`;
    void draw();
    this.stop = source?.onDrawingSaved?.(() => void draw());
    return box;
  }
  destroy() {
    this.stop?.();
  }
  ignoreEvent() {
    return true;
  }
}

/** ![[x.pdf]], ![[Drawing.excalidraw]] or an embed inside a sentence: a small labeled chip. */
export class EmbedChipWidget extends WidgetType {
  constructor(
    readonly target: EmbedTarget,
    readonly label: string,
  ) {
    super();
  }
  eq(o: EmbedChipWidget) {
    return o.target.name === this.target.name && o.label === this.label;
  }
  toDOM(view: EditorView) {
    const chip = document.createElement("span");
    chip.className = "cm-hm-chip";
    chip.textContent = this.label;
    chip.addEventListener("mousedown", e => {
      e.preventDefault();
      view.state.facet(embedSource)?.open?.(this.target.name);
    });
    return chip;
  }
  ignoreEvent() {
    return true;
  }
}
