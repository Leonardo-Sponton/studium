import { useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { BookOpenText, FileDown, LayoutTemplate, ListTree, Pencil, Plus, SlidersHorizontal, TextSearch, Trash2, X } from "lucide-react";
import { openFind } from "../editor/Editor";
import { createTemplate, listTemplates, mergeProperties, readTemplate, type Template } from "../data/templates";
import type { Data } from "../data/frontmatter";
import { Editor } from "../editor/Editor";
import { AskText, Dialog } from "./Dialog";
import { useApp } from "./context";
import { PdfExport } from "./PdfExport";
import { t } from "../i18n";

// The note's "⋯" menu (Obsidian's core tools): outline, find & replace, reading view, templates,
// word count.

/** Headings of the text (outside code blocks), with where they start. */
export function headingsOf(text: string): { level: number; text: string; pos: number }[] {
  const out: { level: number; text: string; pos: number }[] = [];
  let pos = 0;
  let fence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    const h = !fence && /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h && h[2]) out.push({ level: h[1].length, text: h[2], pos });
    pos += line.length + 1;
  }
  return out;
}

/** Words and characters (Markdown marks left out of the word count). */
export function countWords(text: string): { words: number; chars: number } {
  const plain = text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/%%[\s\S]*?%%/g, " ")
    .replace(/[#>*_=~`|[\]()!-]+/g, " ");
  const words = plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)?.length ?? 0;
  return { words, chars: text.length };
}

export function NoteMenu(props: {
  view: EditorView | null;
  reading: boolean;
  setReading(on: boolean): void;
  onTemplate?(): void;
  /** The note's header, to edit its properties. */
  properties?: { data: Data; save(patch: Data): void };
  /** The note as a PDF (where the platform can print). */
  pdf?: { title: string; path?: string };
  onClose(): void;
}) {
  const { platform } = useApp();
  const [outline, setOutline] = useState(false);
  const [props2, setProps2] = useState(false);
  const [pdf, setPdf] = useState(false);
  const text = props.view?.state.doc.toString() ?? "";
  const { words, chars } = countWords(text);
  const close = props.onClose;
  if (outline) return <Outline view={props.view} onClose={close} />;
  if (props2 && props.properties) return <Properties {...props.properties} onClose={close} />;
  if (pdf && props.pdf) return <PdfExport note={{ ...props.pdf, body: text }} onClose={close} />;
  return (
    <Dialog title={t.editor.more} onClose={close}>
      <div className="stack" style={{ gap: 2 }}>
        <button className="menu-item" onClick={() => setOutline(true)}>
          <ListTree size={18} /> {t.editor.outline}
        </button>
        {!props.reading && (
          <button
            className="menu-item"
            onClick={() => {
              close();
              const v = props.view;
              if (v) requestAnimationFrame(() => openFind(v));
            }}
          >
            <TextSearch size={18} /> {t.editor.find}
          </button>
        )}
        <button
          className="menu-item"
          onClick={() => {
            props.setReading(!props.reading);
            close();
          }}
        >
          {props.reading ? <Pencil size={18} /> : <BookOpenText size={18} />} {props.reading ? t.editor.editing : t.editor.reading}
        </button>
        {props.properties && (
          <button className="menu-item" onClick={() => setProps2(true)}>
            <SlidersHorizontal size={18} /> {t.editor.properties}
          </button>
        )}
        {props.pdf && platform.printPdf && (
          <button className="menu-item" onClick={() => setPdf(true)}>
            <FileDown size={18} /> {t.pdf.export}
          </button>
        )}
        {props.onTemplate && !props.reading && (
          <button
            className="menu-item"
            onClick={() => {
              close();
              props.onTemplate?.();
            }}
          >
            <LayoutTemplate size={18} /> {t.editor.template}
          </button>
        )}
      </div>
      <p className="muted small mono">{t.editor.stats(words, chars)}</p>
    </Dialog>
  );
}

/** Header keys the app manages itself: not shown as properties. */
const INTERNAL = new Set(["type", "created", "modified"]);

const asText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** "a, b" → ["a", "b"] for keys that were lists; numbers and true/false stay what they were. */
function fromText(text: string, old: unknown): unknown {
  const v = text.trim();
  if (Array.isArray(old) || (old === undefined && v.includes(","))) return v ? v.split(",").map(x => x.trim()).filter(Boolean) : [];
  if (typeof old === "number" && v !== "" && !isNaN(Number(v))) return Number(v);
  if (typeof old === "boolean" && /^(true|false)$/i.test(v)) return /^true$/i.test(v);
  return v;
}

/** Obsidian's properties: the note's header as name → value fields (lists as "a, b"). */
function Properties({ data, save, onClose }: { data: Data; save(patch: Data): void; onClose(): void }) {
  const keys = Object.keys(data).filter(k => !INTERNAL.has(k));
  const [rows, setRows] = useState(keys.map(k => ({ key: k, text: asText(data[k]), orig: k })));
  const done = () => {
    const patch: Data = {};
    const kept = new Set<string>();
    for (const r of rows) {
      const k = r.key.trim();
      if (!k || INTERNAL.has(k)) continue;
      kept.add(k);
      const old = data[r.orig ?? ""];
      if (typeof old === "object" && old !== null && !Array.isArray(old) && r.text === asText(old)) continue;
      patch[k] = fromText(r.text, r.orig ? old : undefined);
    }
    for (const k of keys) if (!kept.has(k)) patch[k] = undefined;
    save(patch);
    onClose();
  };
  return (
    <Dialog title={t.editor.properties} onClose={done}>
      {!rows.length && <p className="muted">{t.editor.noProperties}</p>}
      <div className="stack props-list">
        {rows.map((r, i) => (
          <div key={i} className="row props-row">
            <input className="field props-key mono" value={r.key} aria-label={t.editor.propName} placeholder={t.editor.propName} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
            <input className="field grow" value={r.text} aria-label={t.editor.propValue} placeholder={t.editor.propValue} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            <button className="btn ghost icon" aria-label={t.common.delete} title={t.common.delete} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <p className="muted small">{t.editor.propHelp}</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn" onClick={() => setRows([...rows, { key: "", text: "", orig: "" }])}>
          <Plus size={16} /> {t.editor.addProperty}
        </button>
        <button className="btn primary" onClick={done}>
          {t.common.done}
        </button>
      </div>
    </Dialog>
  );
}

function Outline({ view, onClose }: { view: EditorView | null; onClose(): void }) {
  const heads = headingsOf(view?.state.doc.toString() ?? "");
  const min = Math.min(...heads.map(h => h.level));
  const go = (pos: number) => {
    onClose();
    if (!view) return;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 24 }) });
    view.focus();
  };
  return (
    <Dialog title={t.editor.outline} onClose={onClose}>
      {heads.length ? (
        <div className="stack outline" style={{ gap: 0 }}>
          {heads.map((h, i) => (
            <button key={i} className={`menu-item outline-h${h.level}`} style={{ paddingLeft: 8 + (h.level - min) * 16 }} onClick={() => go(h.pos)}>
              {h.text}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{t.editor.noHeadings}</p>
      )}
    </Dialog>
  );
}

/**
 * Lists the templates; picking one inserts it at the caret (its properties go to the header
 * through `addProperties`). New / edit / delete templates here too.
 */
export function TemplatePicker(props: { view: EditorView | null; title: string; header?: Data; addProperties?(d: Data): void; onClose(): void }) {
  const { platform, toast, confirmDelete } = useApp();
  const s = platform.storage;
  const [list, setList] = useState<Template[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const reload = () => listTemplates(s).then(setList, () => setList([]));
  useEffect(() => void reload(), []);
  const err = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const insert = async (tpl: Template) => {
    try {
      const { data, body } = await readTemplate(s, tpl.path, { title: props.title });
      const v = props.view;
      if (v) {
        v.dispatch(v.state.replaceSelection(body));
        v.focus();
      }
      const add = mergeProperties(props.header ?? {}, data);
      if (Object.keys(add).length) props.addProperties?.(add);
      props.onClose();
    } catch (e) {
      err(e);
    }
  };

  if (editing) return <TemplateEditor path={editing} onClose={() => setEditing(null)} />;
  return (
    <Dialog title={t.templates.title} onClose={props.onClose}>
      <p className="muted small">{t.templates.help}</p>
      {list && !list.length && <p className="muted">{t.templates.empty}</p>}
      <div className="stack" style={{ gap: 2 }}>
        {list?.map(tpl => (
          <div key={tpl.path} className="row tpl-row">
            <button className="menu-item grow" onClick={() => void insert(tpl)}>
              <LayoutTemplate size={18} /> {tpl.name}
            </button>
            <button className="btn ghost icon" title={t.templates.edit} aria-label={t.templates.edit} onClick={() => setEditing(tpl.path)}>
              <Pencil size={16} />
            </button>
            <button
              className="btn ghost icon"
              title={t.common.delete}
              aria-label={t.common.delete}
              onClick={async () => {
                if (!(await confirmDelete(tpl.name))) return;
                s.remove(tpl.path).then(reload, err);
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => setAsking(true)}>
        <Plus size={16} /> {t.templates.new}
      </button>
      {asking && (
        <AskText
          title={t.templates.new}
          placeholder={t.templates.name}
          onClose={() => setAsking(false)}
          onOk={name => {
            setAsking(false);
            createTemplate(s, name).then(p => {
              void reload();
              setEditing(p);
            }, err);
          }}
        />
      )}
    </Dialog>
  );
}

/** A template is edited as raw text, header included (properties are what templates are often for). */
function TemplateEditor({ path, onClose }: { path: string; onClose(): void }) {
  const { platform, toast } = useApp();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    platform.storage.read(path).then(setText, () => setText(""));
  }, [path]);
  const save = (v: string) => platform.storage.write(path, v).catch(e => toast({ text: e instanceof Error ? e.message : String(e), error: true }));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<string | null>(null);
  return (
    <Dialog
      title={path.replace(/^templates\//, "").replace(/\.md$/, "")}
      onClose={() => {
        clearTimeout(timer.current);
        if (latest.current !== null) void save(latest.current).then(onClose);
        else onClose();
      }}
    >
      <div className="tpl-editor">
        {text !== null && (
          <Editor
            text={text}
            onChange={v => {
              latest.current = v;
              clearTimeout(timer.current);
              timer.current = setTimeout(() => void save(v), 600);
            }}
            onSaveNow={() => latest.current !== null && void save(latest.current)}
            autoFocus
          />
        )}
      </div>
    </Dialog>
  );
}
