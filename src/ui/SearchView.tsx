import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pencil, Search, X } from "lucide-react";
import { loadDocs, search, type Doc, type Since } from "../data/search";
import { NoteEditor } from "./NoteEditor";
import { useApp } from "./context";
import { drawingSvg, onDrawingSaved } from "./drawing/excalidraw";
import { drawingTitle } from "../data/drawings";
import { t } from "../i18n";

// Global search (SPEC 4.4): every area, ignores accents and case, filters by area and date.
// Study files open in the Study screen; other files open here (templates as text, drawings as
// the picture, with a button to the drawing editor).

export interface SearchState {
  text: string;
  area: string;
  since: Since;
}

const AREAS = ["study"];

export const areaLabel = (a: string) => (a === "drawings" ? t.drawings.title : AREAS.includes(a) ? t.area[a as keyof typeof t.area] : a);

const SINCE: Since[] = ["any", "week", "month", "year"];

const MAX_SHOWN = 100;

interface Props {
  state: SearchState;
  setState(s: SearchState): void;
  /** Changes on Ctrl+F: puts the caret back in the field. */
  focusKey: number;
  /** Opens a study file in the Study screen. Returns false for other files (they open here). */
  openElsewhere(doc: Doc): boolean;
}

export function SearchView({ state, setState, focusKey, openElsewhere }: Props) {
  const { notes, version } = useApp();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState(state.text);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadDocs(notes).then(d => alive && setDocs(d));
    return () => {
      alive = false;
    };
  }, [notes, version]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusKey]);

  // Search a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => text !== state.text && setState({ ...state, text }), 150);
    return () => clearTimeout(t);
  }, [text, state, setState]);

  const hits = useMemo(() => (docs ? search(docs, state.text, state) : []), [docs, state]);
  const areas = useMemo(() => [...new Set((docs ?? []).map(d => d.area))].sort(), [docs]);

  const pick = (d: Doc) => {
    if (!openElsewhere(d)) setOpen(d.path);
  };

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>{t.search.title}</h1>
        </div>
        <div className="search-box">
          <Search size={18} className="muted" />
          <input
            ref={input}
            className="search-input"
            value={text}
            placeholder={t.search.placeholder}
            aria-label={t.search.title}
            autoFocus
            enterKeyHint="search"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && hits[0] && pick(hits[0].doc)}
          />
          {text && (
            <button className="btn ghost icon" aria-label={t.common.clear} onClick={() => (setText(""), input.current?.focus())}>
              <X size={18} />
            </button>
          )}
        </div>
        <nav className="search-filters" aria-label={t.search.area}>
          {["", ...areas].map(a => (
            <button key={a} className={`chip${state.area === a ? " active" : ""}`} onClick={() => setState({ ...state, area: a })}>
              {a ? areaLabel(a) : t.common.all}
            </button>
          ))}
        </nav>
        <nav className="search-filters" aria-label={t.search.date}>
          {SINCE.map(s => (
            <button
              key={s}
              className={`chip${state.since === s ? " active" : ""}`}
              onClick={() => setState({ ...state, since: s })}
            >
              {t.search.since[s]}
            </button>
          ))}
        </nav>
        {!docs ? (
          <p className="muted empty-note">{t.search.reading}</p>
        ) : !state.text.trim() ? (
          <p className="muted empty-note">{t.search.typeTo(docs.length)}</p>
        ) : hits.length === 0 ? (
          <p className="muted empty-note">{t.search.nothing}</p>
        ) : (
          <>
            <p className="muted small empty-note">
              {t.search.results(hits.length)}
              {hits.length > MAX_SHOWN && t.search.showingFirst(MAX_SHOWN)}
            </p>
            <ul className="list">
              {hits.slice(0, MAX_SHOWN).map(({ doc, snippet }) => (
                <li key={doc.path}>
                  <button className={`list-item${open === doc.path ? " active" : ""}`} onClick={() => pick(doc)}>
                    <span className="list-title">{doc.title || <span className="muted">{t.common.empty}</span>}</span>
                    {snippet && (
                      <span className="search-snippet">
                        {snippet.before}
                        <mark>{snippet.match}</mark>
                        {snippet.after}
                      </span>
                    )}
                    <span className="list-meta mono">
                      {areaLabel(doc.area)}
                      {doc.date && ` · ${doc.date.replace("T", " ")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="detail-pane">
        {open && docs?.find(d => d.path === open)?.drawing ? (
          <DrawingPreview key={open} path={open} onBack={() => setOpen(null)} />
        ) : open ? (
          <NoteEditor key={open} path={open} onBack={() => setOpen(null)} />
        ) : (
          <div className="detail-empty muted">{t.search.opensHere}</div>
        )}
      </div>
    </div>
  );
}

/** A drawing found by search: the picture, redrawn when it is saved, and Edit. */
function DrawingPreview(props: { path: string; onBack(): void }) {
  const { notes, openDrawing } = useApp();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(0);
  useEffect(() => onDrawingSaved(p => p === props.path && setSaved(n => n + 1)), [props.path]);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    drawingSvg(notes.storage, props.path).then(
      x => alive && setSvg(x),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [notes, props.path, saved]);
  const edit = () => openDrawing(props.path);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={props.onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="list-title one-line drawing-preview-title">{drawingTitle(props.path)}</span>
        <button className="btn" onClick={edit}>
          <Pencil size={16} /> {t.common.edit}
        </button>
      </div>
      <div className="drawing-preview">
        {failed ? (
          <p className="err">{t.common.couldNotRead(props.path)}</p>
        ) : svg === null ? (
          <p className="muted">{t.search.reading}</p>
        ) : svg ? (
          <button className="drawing-preview-pic" onClick={edit} title={t.common.edit} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <button className="btn ghost" onClick={edit}>
            {t.drawings.emptyDrawing}
          </button>
        )}
      </div>
    </div>
  );
}
