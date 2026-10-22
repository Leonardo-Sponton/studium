import type { EditorView } from "@codemirror/view";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpNarrowWide,
  Bold,
  Code,
  FileInput,
  FileSymlink,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  LogOut,
  MessageSquareDashed,
  Minus,
  Quote,
  Sigma,
  SquareCode,
  SquareSigma,
  StickyNote,
  Strikethrough,
  Superscript,
  Table,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { CARET, formatSpec, type Format } from "../editor/format";
import { pickAttachment } from "../editor/Editor";
import { tableAction, type TableAction } from "../editor/tables";
import { useApp } from "./context";
import { t } from "../i18n";

// The quick formatting strip under the note bar: one tap writes the Markdown for the user
// (the long version is the MarkdownGuide). Scrolls sideways on the phone. With the caret in a
// table it shows the table tools instead (Advanced Tables).

const BUTTONS: ([Format, LucideIcon] | "|" | "image")[] = [
  ["h1", Heading1],
  ["h2", Heading2],
  ["h3", Heading3],
  "|",
  ["bold", Bold],
  ["italic", Italic],
  ["strike", Strikethrough],
  ["highlight", Highlighter],
  "|",
  ["list", List],
  ["numbered", ListOrdered],
  ["todo", ListTodo],
  "|",
  ["quote", Quote],
  ["callout", StickyNote],
  ["code", Code],
  ["codeblock", SquareCode],
  "|",
  ["link", Link],
  ["wiki", FileSymlink],
  ["embed", FileInput],
  "image",
  "|",
  ["table", Table],
  ["line", Minus],
  "|",
  ["math", Sigma],
  ["mathblock", SquareSigma],
  ["mermaid", Workflow],
  ["footnote", Superscript],
  ["comment", MessageSquareDashed],
];

/** Table tools: an icon, or a short text (t.tableBar.short) where an icon would not be clear. */
type BarAction = Exclude<TableAction, "nextCell" | "previousCell" | "nextRow">;

const TABLE: [BarAction, LucideIcon | string][] = [
  ["format", WandSparkles],
  ["insertRow", "insertRow"],
  ["deleteRow", "deleteRow"],
  ["insertColumn", "insertColumn"],
  ["deleteColumn", "deleteColumn"],
  ["rowUp", ArrowUp],
  ["rowDown", ArrowDown],
  ["columnLeft", ArrowLeft],
  ["columnRight", ArrowRight],
  ["alignLeft", AlignLeft],
  ["alignCenter", AlignCenter],
  ["alignRight", AlignRight],
  ["sortAsc", ArrowUpNarrowWide],
  ["sortDesc", ArrowDownWideNarrow],
  ["formulas", "Σ="],
  ["transpose", "⇄"],
  ["escape", LogOut],
];

// Keep the focus (and the Android keyboard) in the editor.
const keepFocus = {
  onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
};

export function FormatBar({ view, inTable }: { view: { current: EditorView | null }; inTable?: boolean }) {
  const { toast } = useApp();
  const fb = t.formatBar;
  const apply = (f: Format) => {
    const v = view.current;
    if (!v) return;
    const c = fb.column;
    const table = `| ${CARET}${c} 1${CARET} | ${c} 2 |\n| --- | --- |\n|  |  |`;
    v.dispatch({ ...formatSpec(v.state, f, table), scrollIntoView: true, userEvent: "format" });
    v.focus();
  };
  const tableDo = (a: TableAction) => {
    const v = view.current;
    if (!v) return;
    const r = tableAction(v, a);
    if (r instanceof Error) toast({ text: t.tableBar.formulaError(r.message), error: true });
    v.focus();
  };

  if (inTable) {
    return (
      <div className="format-bar table-bar" role="toolbar" aria-label={t.tableBar.label}>
        {TABLE.map(([a, Icon]) => (
          <button key={a} className="btn ghost icon" title={t.tableBar[a]} aria-label={t.tableBar[a]} {...keepFocus} onClick={() => tableDo(a)}>
            {typeof Icon === "string" ? <span className="tb-text">{t.tableBar.short[Icon] ?? Icon}</span> : <Icon size={18} />}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="format-bar" role="toolbar" aria-label={fb.label}>
      {BUTTONS.map((b, i) =>
        b === "|" ? (
          <span key={i} className="fb-sep" aria-hidden />
        ) : b === "image" ? (
          <button key="image" className="btn ghost icon" title={t.editor.image} aria-label={t.editor.image} {...keepFocus} onClick={() => view.current && pickAttachment(view.current, "*/*")}>
            <Image size={18} />
          </button>
        ) : (
          <button key={b[0]} className="btn ghost icon" title={fb.names[b[0]]} aria-label={fb.names[b[0]]} {...keepFocus} onClick={() => apply(b[0])}>
            {(() => {
              const Icon = b[1];
              return <Icon size={18} />;
            })()}
          </button>
        ),
      )}
    </div>
  );
}
