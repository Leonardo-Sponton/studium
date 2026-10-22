import { tags } from "@lezer/highlight";
import type { BlockContext, InlineContext, Line, MarkdownConfig } from "@lezer/markdown";

// Obsidian's additions to Markdown, taught to the Markdown parser (@lezer/markdown) so the live
// preview can find them in the parse tree like any other mark:
//   ==highlight==   [[link]] [[link|shown text]] [[note#heading]]   ![[embed]] ![[image.png|300]]
//   [^1] footnote   ^[inline footnote]   $math$  $$math$$   %%comment%%
// Written from the syntax described in Obsidian's help (help.obsidian.md, "Obsidian Flavored
// Markdown"); no Obsidian code is used.

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\p{P}\p{S}]/u;

// ---- ==Highlight==, parsed like GFM ~~strike~~ ----

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

export const Highlight: MarkdownConfig = {
  defineNodes: [{ name: "Highlight" }, { name: "HighlightMark", style: tags.processingInstruction }],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = PUNCT.test(before);
        const pAfter = PUNCT.test(after);
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, !sAfter && (!pAfter || sBefore || pBefore), !sBefore && (!pBefore || sAfter || pAfter));
      },
      after: "Emphasis",
    },
  ],
};

/** Where `close` (a string) starts at or after `from`, before the end of the inline text or a line break when `oneLine`. */
function find(cx: InlineContext, from: number, close: string, oneLine: boolean): number {
  const first = close.charCodeAt(0);
  for (let i = from; i < cx.end; i++) {
    const c = cx.char(i);
    if (oneLine && c === 10) return -1;
    if (c === first && cx.slice(i, i + close.length) === close) return i;
  }
  return -1;
}

// ---- [[Links]] and ![[embeds]] ----

function wiki(cx: InlineContext, pos: number, open: number, type: string): number {
  const end = find(cx, pos + open, "]]", true);
  if (end < 0 || end === pos + open) return -1;
  const inner = cx.slice(pos + open, end);
  if (/[[\]]/.test(inner)) return -1;
  return cx.addElement(cx.elt(type, pos, end + 2, [cx.elt("WikiMark", pos, pos + open), cx.elt("WikiMark", end, end + 2)]));
}

export const WikiLinks: MarkdownConfig = {
  defineNodes: [{ name: "WikiLink", style: tags.link }, { name: "Embed", style: tags.link }, { name: "WikiMark", style: tags.processingInstruction }],
  parseInline: [
    {
      name: "Embed",
      parse: (cx, next, pos) => (next === 33 /* ! */ && cx.char(pos + 1) === 91 && cx.char(pos + 2) === 91 ? wiki(cx, pos, 3, "Embed") : -1),
      before: "Image",
    },
    {
      name: "WikiLink",
      parse: (cx, next, pos) => (next === 91 /* [ */ && cx.char(pos + 1) === 91 ? wiki(cx, pos, 2, "WikiLink") : -1),
      before: "Link",
    },
  ],
};

// ---- Footnotes: [^1] (text below, "[^1]: …") and ^[inline] ----

export const Footnotes: MarkdownConfig = {
  defineNodes: [{ name: "FootnoteRef", style: tags.labelName }, { name: "InlineFootnote" }, { name: "FootnoteMark", style: tags.processingInstruction }],
  parseInline: [
    {
      name: "FootnoteRef",
      parse(cx, next, pos) {
        if (next !== 91 || cx.char(pos + 1) !== 94 /* ^ */) return -1;
        const end = find(cx, pos + 2, "]", true);
        if (end < 0 || end === pos + 2 || /[\s[]/.test(cx.slice(pos + 2, end))) return -1;
        return cx.addElement(cx.elt("FootnoteRef", pos, end + 1));
      },
      before: "Link",
    },
    {
      name: "InlineFootnote",
      parse(cx, next, pos) {
        if (next !== 94 || cx.char(pos + 1) !== 91) return -1;
        // The closing "]" that matches (brackets inside are allowed in pairs).
        let depth = 0;
        for (let i = pos + 2; i < cx.end; i++) {
          const c = cx.char(i);
          if (c === 10 && cx.char(i + 1) === 10) return -1;
          if (c === 91) depth++;
          else if (c === 93 && depth-- === 0) {
            if (i === pos + 2) return -1;
            return cx.addElement(cx.elt("InlineFootnote", pos, i + 1, [cx.elt("FootnoteMark", pos, pos + 2), cx.elt("FootnoteMark", i, i + 1)]));
          }
        }
        return -1;
      },
      before: "Link",
    },
  ],
};

// ---- Math: $inline$ and $$block$$ (KaTeX draws them) ----

const isSpace = (c: number) => c === 32 || c === 9 || c === 10;
const isDigit = (c: number) => c >= 48 && c <= 57;

/** True when the line starts a "$$" block (and does not close it on the same line). */
const mathBlockStart = (line: Line) => line.next === 36 && line.text.charCodeAt(line.pos + 1) === 36;

export const MathMarks: MarkdownConfig = {
  defineNodes: [{ name: "InlineMath" }, { name: "MathBlock", block: true }, { name: "MathMark", style: tags.processingInstruction }],
  parseInline: [
    {
      name: "InlineMath",
      parse(cx, next, pos) {
        if (next !== 36 /* $ */) return -1;
        const double = cx.char(pos + 1) === 36;
        const start = pos + (double ? 2 : 1);
        if (!double && (isSpace(cx.char(start)) || cx.char(start) === 36)) return -1;
        for (let i = start; i < cx.end; i++) {
          const c = cx.char(i);
          if (c === 92 /* \ */) {
            i++;
            continue;
          }
          if (c === 10 && cx.char(i + 1) === 10) return -1;
          if (c !== 36) continue;
          if (double) {
            if (cx.char(i + 1) !== 36 || i === start) continue;
            return cx.addElement(cx.elt("InlineMath", pos, i + 2, [cx.elt("MathMark", pos, start), cx.elt("MathMark", i, i + 2)]));
          }
          // "$5 and $10": a closing "$" needs no space before it and no digit after it.
          if (i === start || isSpace(cx.char(i - 1)) || isDigit(cx.char(i + 1))) return -1;
          return cx.addElement(cx.elt("InlineMath", pos, i + 1, [cx.elt("MathMark", pos, start), cx.elt("MathMark", i, i + 1)]));
        }
        return -1;
      },
      before: "Escape",
    },
  ],
  parseBlock: [
    {
      name: "MathBlock",
      parse(cx: BlockContext, line: Line) {
        if (!mathBlockStart(line)) return false;
        const from = cx.lineStart + line.pos;
        const rest = line.text.slice(line.pos + 2);
        const marks = [cx.elt("MathMark", from, from + 2)];
        const close = rest.indexOf("$$");
        if (close >= 0) {
          // "$$x$$" alone on a line.
          if (rest.slice(close + 2).trim()) return false;
          const at = from + 2 + close;
          marks.push(cx.elt("MathMark", at, at + 2));
          cx.nextLine();
          cx.addElement(cx.elt("MathBlock", from, at + 2, marks));
          return true;
        }
        let end = cx.lineStart + line.text.length;
        while (cx.nextLine()) {
          const at = line.text.indexOf("$$");
          end = cx.lineStart + line.text.length;
          if (at >= 0) {
            marks.push(cx.elt("MathMark", cx.lineStart + at, cx.lineStart + at + 2));
            end = cx.lineStart + at + 2;
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt("MathBlock", from, end, marks));
        return true;
      },
      endLeaf: (_cx, line) => mathBlockStart(line),
      before: "FencedCode",
    },
  ],
};

// ---- %%Comments%% (kept in the file, drawn faded) ----

const commentStart = (line: Line) => line.next === 37 && line.text.charCodeAt(line.pos + 1) === 37 && !line.text.slice(line.pos + 2).includes("%%");

export const Comments: MarkdownConfig = {
  // Own names: the parser already has "Comment" / "CommentBlock" for HTML's <!-- -->.
  defineNodes: [{ name: "HiddenComment", style: tags.comment }, { name: "HiddenCommentBlock", block: true, style: tags.comment }, { name: "HiddenCommentMark", style: tags.processingInstruction }],
  parseInline: [
    {
      name: "HiddenComment",
      parse(cx, next, pos) {
        if (next !== 37 || cx.char(pos + 1) !== 37) return -1;
        const end = find(cx, pos + 2, "%%", false);
        if (end < 0) return -1;
        return cx.addElement(cx.elt("HiddenComment", pos, end + 2, [cx.elt("HiddenCommentMark", pos, pos + 2), cx.elt("HiddenCommentMark", end, end + 2)]));
      },
      before: "Emphasis",
    },
  ],
  parseBlock: [
    {
      // "%%" on a line of its own (or starting one) up to the next line with "%%".
      name: "HiddenCommentBlock",
      parse(cx, line) {
        if (!commentStart(line)) return false;
        const from = cx.lineStart + line.pos;
        let end = cx.lineStart + line.text.length;
        while (cx.nextLine()) {
          end = cx.lineStart + line.text.length;
          const at = line.text.indexOf("%%");
          if (at >= 0) {
            end = cx.lineStart + at + 2;
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt("HiddenCommentBlock", from, end));
        return true;
      },
      endLeaf: (_cx, line) => commentStart(line),
      before: "FencedCode",
    },
  ],
};

/** Every Obsidian addition, for markdown({ extensions }). */
export const obsidianMarkdown: MarkdownConfig[] = [Highlight, WikiLinks, Footnotes, MathMarks, Comments];
