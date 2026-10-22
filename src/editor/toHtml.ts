import { markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { highlightCode } from "@lezer/highlight";
import type { MarkdownParser } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";
import { obsidianMarkdown } from "./syntax";
import { drawDiagram, escapeHTML as esc, mathHTML } from "./render";
import { CALLOUT, CALLOUT_ICON, CALLOUT_KIND, codeStyle } from "./livePreview";
import { DRAWING_NAME, embedTarget, FILE_EXT, IMAGE_EXT, sectionOf } from "./embeds";

// A note's Markdown as static HTML, for PDF export. It reads the text with the editor's own
// parser (lang-markdown + ./syntax), so it knows the same marks: callouts, ==highlight==,
// [[links]], ![[embeds]] (pictures, notes, Excalidraw drawings), footnotes, $math$, Mermaid,
// tables, tasks and colored code. Raw HTML is shown as text, apart from a few harmless tags.

export interface HtmlSources {
  /** A picture by name, as a URL the page can show. */
  image?(name: string): Promise<string | null>;
  /** An embedded note's Markdown by its name. */
  note?(name: string): Promise<string | null>;
  /** An Excalidraw drawing as SVG text. */
  drawing?(name: string): Promise<string | null>;
  /** Diagrams and drawings for a dark page (default: light, for paper). */
  dark?: boolean;
}

const parser = (markdownLanguage.parser as unknown as MarkdownParser).configure(obsidianMarkdown);

const SAFE_TAGS = new Set(["u", "sub", "sup", "kbd", "mark", "s", "del", "ins", "small", "b", "strong", "i", "em", "br"]);
const SAFE_URL = /^(https?:|mailto:)/i;

interface Ctx {
  src: HtmlSources;
  notes: { label: string; html: string }[];
  defs: Map<string, string>;
  depth: number;
}

/** Turns Markdown (without its YAML header) into HTML. */
export async function markdownToHtml(md: string, src: HtmlSources = {}): Promise<string> {
  const ctx: Ctx = { src, notes: [], defs: new Map(), depth: 0 };
  const body = await render(takeFootnotes(md, ctx), ctx);
  if (!ctx.notes.length) return body;
  const items = ctx.notes.map((n, i) => `<li id="fn-${i + 1}">${n.html}</li>`).join("");
  return `${body}<section class="footnotes"><hr><ol>${items}</ol></section>`;
}

/** "[^1]: text" lines (with indented lines after them) leave the text; they are listed at the end. */
function takeFootnotes(md: string, ctx: Ctx): string {
  const lines = md.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[\^([^\]\s]+)\]:\s?(.*)$/.exec(lines[i]);
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const body = [m[2]];
    while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1])) body.push(lines[++i].trim());
    ctx.defs.set(m[1], body.join("\n"));
  }
  return out.join("\n");
}

async function render(md: string, ctx: Ctx): Promise<string> {
  const tree = parser.parse(md);
  const r = new Renderer(md, ctx);
  return r.blocks(tree.topNode);
}

class Renderer {
  constructor(
    readonly doc: string,
    readonly ctx: Ctx,
  ) {}

  text(from: number, to: number) {
    return this.doc.slice(from, to);
  }

  async blocks(node: SyntaxNode): Promise<string> {
    let out = "";
    for (let c = node.firstChild; c; c = c.nextSibling) out += await this.block(c);
    return out;
  }

  async block(n: SyntaxNode): Promise<string> {
    const name = n.name;
    const h = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
    if (h) return `<h${h[1]}>${(await this.inline(n)).trim()}</h${h[1]}>`;
    switch (name) {
      case "Paragraph": {
        // ![[x]] alone in its paragraph: shown as a block (picture, drawing, note).
        const only = n.firstChild;
        if (only && only.name === "Embed" && !only.nextSibling && this.text(n.from, n.to).trim() === this.text(only.from, only.to))
          return this.embed(only, true);
        return `<p>${await this.inline(n)}</p>`;
      }
      case "HorizontalRule":
        return "<hr>";
      case "Blockquote":
        return this.quote(n);
      case "BulletList":
        return `<ul>${await this.blocks(n)}</ul>`;
      case "OrderedList": {
        const start = parseInt(this.text(n.firstChild?.getChild("ListMark")?.from ?? n.from, n.to), 10);
        return `<ol${start > 1 ? ` start="${start}"` : ""}>${await this.blocks(n)}</ol>`;
      }
      case "ListItem": {
        let inner = "";
        let task = "";
        for (let c = n.firstChild; c; c = c.nextSibling) {
          if (c.name === "ListMark") continue;
          if (c.name === "Task") {
            const marker = c.getChild("TaskMarker");
            const state = marker ? this.text(marker.from + 1, marker.to - 1) : " ";
            task = state === " " ? "open" : state.toLowerCase() === "x" ? "done" : "other";
            inner += `<p><span class="task-box">${task === "done" ? "☑" : task === "other" ? "◪" : "☐"}</span> ${(await this.inline(c, marker?.to)).trim()}</p>`;
          } else inner += await this.block(c);
        }
        return `<li${task ? ` class="task ${task}"` : ""}>${inner}</li>`;
      }
      case "FencedCode":
      case "CodeBlock":
        return this.code(n);
      case "Table":
        return this.table(n);
      case "MathBlock":
        return `<div class="math-block">${mathHTML(this.text(n.from, n.to).trim().replace(/^\$\$/, "").replace(/\$\$$/, "").trim(), true)}</div>`;
      case "HTMLBlock":
        return `<p>${esc(this.text(n.from, n.to))}</p>`;
      case "HiddenCommentBlock":
      case "CommentBlock":
      case "LinkReference":
      case "ProcessingInstructionBlock":
        return "";
      default:
        return n.firstChild ? this.blocks(n) : `<p>${esc(this.text(n.from, n.to))}</p>`;
    }
  }

  /** A quote or an Obsidian callout ("> [!tip] Title"): its lines without "> ", drawn again. */
  async quote(n: SyntaxNode): Promise<string> {
    const lines = this.text(n.from, n.to)
      .split("\n")
      .map(l => l.replace(/^\s*>\s?/, ""));
    const m = CALLOUT.exec(lines[0]);
    const sub = { ...this.ctx, depth: this.ctx.depth };
    if (!m) return `<blockquote>${await render(lines.join("\n"), sub)}</blockquote>`;
    const kind = CALLOUT_KIND[m[1].toLowerCase()] ?? "note";
    const title = lines[0].slice(m[0].length).trim() || m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    const titleHtml = (await render(title, sub)).replace(/^<p>|<\/p>$/g, "");
    return `<div class="callout callout-${kind}"><div class="callout-title"><span class="callout-icon">${CALLOUT_ICON[kind] ?? "ℹ"}</span> ${titleHtml}</div>${await render(lines.slice(1).join("\n"), sub)}</div>`;
  }

  async code(n: SyntaxNode): Promise<string> {
    const info = n.getChild("CodeInfo");
    const lang = info ? this.text(info.from, info.to).trim() : "";
    const body = n.getChild("CodeText");
    let code = body ? this.text(body.from, body.to) : "";
    if (n.name === "CodeBlock") code = code.replace(/^( {4}|\t)/gm, "");
    else code = code.replace(new RegExp(`^ {0,${this.indentOf(n)}}`, "gm"), "");
    if (/^mermaid$/i.test(lang)) {
      const d = await drawDiagram(code, !!this.ctx.src.dark);
      if (d.svg) return `<div class="diagram">${d.svg}</div>`;
    }
    return `<pre class="code"><code>${await highlight(code, lang)}</code></pre>`;
  }

  indentOf(n: SyntaxNode) {
    const start = this.doc.lastIndexOf("\n", n.from - 1) + 1;
    return n.from - start;
  }

  async table(n: SyntaxNode): Promise<string> {
    const delim = n.getChild("TableDelimiter");
    const aligns = delim
      ? this.text(delim.from, delim.to)
          .replace(/^\s*\||\|\s*$/g, "")
          .split("|")
          .map(c => {
            const s = c.trim();
            return s.startsWith(":") && s.endsWith(":") ? "center" : s.endsWith(":") ? "right" : s.startsWith(":") ? "left" : "";
          })
      : [];
    const row = async (r: SyntaxNode, tag: string) => {
      let cells = "";
      let i = 0;
      for (let c = r.firstChild; c; c = c.nextSibling) {
        if (c.name !== "TableCell") continue;
        const a = aligns[i++];
        cells += `<${tag}${a ? ` style="text-align:${a}"` : ""}>${await this.inline(c)}</${tag}>`;
      }
      return `<tr>${cells}</tr>`;
    };
    let head = "";
    let rows = "";
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name === "TableHeader") head += await row(c, "th");
      else if (c.name === "TableRow") rows += await row(c, "td");
    }
    return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  /** The inline content of `n` (from `from`), marks left out. */
  async inline(n: SyntaxNode, from = n.from, to = n.to): Promise<string> {
    let out = "";
    let pos = from;
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.to <= from || c.from >= to) continue;
      if (c.from > pos) out += plain(this.text(pos, c.from));
      out += await this.inlineNode(c);
      pos = Math.max(pos, c.to);
    }
    if (pos < to) out += plain(this.text(pos, to));
    return out;
  }

  /** Content between the first and last mark of `n` ("**x**" → x). */
  async between(n: SyntaxNode, tag: string) {
    const marks = n.getChildren(n.firstChild?.name ?? "");
    const a = marks[0]?.to ?? n.from;
    const b = marks.length > 1 ? marks[marks.length - 1].from : n.to;
    return `<${tag}>${await this.inline(n, a, b)}</${tag}>`;
  }

  async inlineNode(c: SyntaxNode): Promise<string> {
    const s = this.text(c.from, c.to);
    switch (c.name) {
      case "Emphasis":
        return this.between(c, "em");
      case "StrongEmphasis":
        return this.between(c, "strong");
      case "Strikethrough":
        return this.between(c, "s");
      case "Highlight":
        return this.between(c, "mark");
      case "Subscript":
        return this.between(c, "sub");
      case "Superscript":
        return this.between(c, "sup");
      case "InlineCode":
        return `<code>${esc(s.replace(/^`+\s?|\s?`+$/g, ""))}</code>`;
      case "Escape":
        return esc(s.slice(1));
      case "Entity":
        return s;
      case "HardBreak":
        return "<br>";
      case "Comment":
      case "HiddenComment":
      case "ProcessingInstruction":
        return "";
      case "HTMLTag": {
        const m = /^<(\/?)([a-z]+)\s*\/?>$/i.exec(s);
        return m && SAFE_TAGS.has(m[2].toLowerCase()) ? `<${m[1]}${m[2].toLowerCase()}>` : esc(s);
      }
      case "InlineMath":
        return mathHTML(s.replace(/^\$|\$$/g, ""), false);
      case "URL":
      case "Autolink": {
        const url = s.replace(/^<|>$/g, "");
        const href = /^www\./i.test(url) ? `https://${url}` : url;
        return SAFE_URL.test(href) ? `<a href="${esc(href)}">${esc(url)}</a>` : esc(s);
      }
      case "Link": {
        const marks = c.getChildren("LinkMark");
        const url = c.getChild("URL");
        const label = await this.inline(c, marks[0]?.to ?? c.from, marks[1]?.from ?? c.to);
        const href = url ? this.text(url.from, url.to) : "";
        return SAFE_URL.test(href) ? `<a href="${esc(href)}">${label}</a>` : label;
      }
      case "Image": {
        const marks = c.getChildren("LinkMark");
        const url = c.getChild("URL");
        const alt = this.text(marks[0]?.to ?? c.from, marks[1]?.from ?? c.to);
        const href = url ? this.text(url.from, url.to) : "";
        return this.img(href, alt);
      }
      case "WikiLink": {
        const t = embedTarget(s.slice(2, -2));
        return `<span class="wikilink">${esc(t.alias || (t.heading ? `${t.name} › ${t.heading}` : t.name))}</span>`;
      }
      case "Embed":
        return this.embed(c, false);
      case "FootnoteRef":
        return this.footnote(s.slice(2, -1), null);
      case "InlineFootnote":
        return this.footnote(null, s.slice(2, -1));
      default:
        if (/Mark(er)?$/.test(c.name)) return "";
        return c.firstChild ? this.inline(c) : plain(s);
    }
  }

  async img(href: string, alt: string, w?: number, h?: number) {
    const size = `${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""}`;
    let url: string | null = null;
    if (/^(https?:|data:image\/)/i.test(href)) url = href;
    else if (href) url = (await this.ctx.src.image?.(decodeURI(href))) ?? null;
    return url ? `<img src="${esc(url)}" alt="${esc(alt)}"${size}>` : `<span class="missing">${esc(alt || href)}</span>`;
  }

  async embed(c: SyntaxNode, alone: boolean): Promise<string> {
    const t = embedTarget(this.text(c.from + 3, c.to - 2));
    const label = esc(t.alias || t.name);
    if (IMAGE_EXT.test(t.name)) {
      const img = await this.img(t.name, t.name, t.width, t.height);
      return alone ? `<p class="embed-img">${img}</p>` : img;
    }
    if (DRAWING_NAME.test(t.name) || !FILE_EXT.test(t.name)) {
      const svg = DRAWING_NAME.test(t.name) || !(await this.ctx.src.note?.(t.name)) ? await this.ctx.src.drawing?.(t.name) : null;
      if (svg) return alone ? `<div class="drawing">${svg}</div>` : `<span class="drawing">${svg}</span>`;
    }
    if (!FILE_EXT.test(t.name) || /\.md$/i.test(t.name)) {
      const text = this.ctx.depth < 2 ? await this.ctx.src.note?.(t.name.replace(/\.md$/i, "")) : null;
      if (text != null && alone) {
        const inner = await render(sectionOf(text, t.heading).trim(), { ...this.ctx, depth: this.ctx.depth + 1 });
        return `<div class="embed"><div class="embed-title">${esc(t.heading ? `${t.name} › ${t.heading}` : t.name)}</div>${inner}</div>`;
      }
    }
    return alone ? `<p><span class="wikilink">${label}</span></p>` : `<span class="wikilink">${label}</span>`;
  }

  async footnote(label: string | null, text: string | null): Promise<string> {
    const notes = this.ctx.notes;
    let i = label ? notes.findIndex(n => n.label === label) : -1;
    if (i < 0) {
      const body = text ?? this.ctx.defs.get(label!) ?? "";
      notes.push({ label: label ?? `inline-${notes.length}`, html: (await render(body, this.ctx)).replace(/^<p>|<\/p>$/g, "") });
      i = notes.length - 1;
    }
    return `<sup class="fn"><a href="#fn-${i + 1}">${i + 1}</a></sup>`;
  }
}

/** Plain text: escaped, #tags marked, ^block-ids dropped. */
function plain(s: string) {
  return esc(s.replace(/\s\^[\w-]+(?=\s*$)/g, "")).replace(/(^|\s)(#[\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu, '$1<span class="tag">$2</span>');
}

/** Code colored as in the editor (classes cm-tk-*), when its language is known. */
async function highlight(code: string, lang: string): Promise<string> {
  const desc = lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null;
  if (!desc) return esc(code);
  try {
    const support = await desc.load();
    let out = "";
    highlightCode(
      code,
      support.language.parser.parse(code),
      codeStyle,
      (text, classes) => (out += classes ? `<span class="${classes}">${esc(text)}</span>` : esc(text)),
      () => (out += "\n"),
    );
    return out;
  } catch {
    return esc(code);
  }
}
