import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Circle, CircleCheck, List, NotebookPen, Pencil, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { webLink } from "../../data/weblink";
import { chaptersOf, donePatch, toMaterial, type Chapter } from "../../data/study";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useNoteFile } from "../useNoteFile";
import { t } from "../../i18n";

// A material (data/study): its contents with read marks and "you stopped here", and one chapter at
// a time for reading. Reading shows the text formatted with no caret, so the phone keyboard stays
// away; the pencil makes the chapter (or the whole text, from the contents) editable. Edits to a
// chapter are put back in place in the whole file.

interface Props {
  path: string;
  /** Open straight at this chapter (Continue). */
  chapter?: number | null;
  onBack(): void;
  onNote(about: { material: string; chapter: number; title: string }): void;
  onDelete(): void;
}

const chapterName = (c: Chapter) => c.title || (c.n === 0 ? t.study.intro : t.study.chapter(c.n));

export function MaterialReader(props: Props) {
  const f = useNoteFile(props.path);
  const { platform } = useApp();
  // null = contents; a number = that chapter; "all" = the whole text, being edited.
  const [at, setAt] = useState<number | "all" | null>(props.chapter ?? null);
  const [editing, setEditing] = useState(false);
  // The text around the chapter being edited, taken when it was opened.
  const around = useRef({ key: "", text: "", before: "", after: "" });
  useBack(true, () => (at !== null ? close() : props.onBack()));

  const close = () => {
    setAt(null);
    setEditing(false);
  };

  const note = f.note;
  const m = note ? toMaterial({ ...note, data: f.data(), body: f.body() }) : null;
  const chapters = m ? chaptersOf(f.body()) : [];
  const ch = typeof at === "number" ? chapters.find(c => c.n === at) : undefined;
  const idx = ch ? chapters.indexOf(ch) : -1;

  // Opening a chapter remembers it as the place where reading stopped.
  useEffect(() => {
    if (typeof at === "number" && m && m.at !== at && chapters.some(c => c.n === at)) f.setData({ at });
  }, [at, !!note]);

  if (!note || !m) return <div className="note-editor">{f.gone && <p className="err page">{f.gone}</p>}</div>;

  const open = (n: number | "all", edit = false) => {
    setAt(n);
    setEditing(edit);
  };
  const toggle = (n: number, on: boolean) => f.setData(donePatch(m.done, n, on));
  const isRead = (n: number) => m.done.includes(n);
  const readAndNext = () => {
    if (!ch) return;
    toggle(ch.n, true);
    const next = chapters[idx + 1];
    if (next) open(next.n);
    else close();
  };

  // Text shown in the editor and the text around it, taken once when the chapter is opened (the
  // editor owns its text after that, and headings typed meanwhile must not move the cut).
  const key = `${at}-${editing}-${f.rev}`;
  if (around.current.key !== key) {
    const body = f.body();
    if (at === "all") around.current = { key, text: body, before: "", after: "" };
    else if (ch) around.current = { key, text: body.slice(ch.from, ch.to), before: body.slice(0, ch.from), after: body.slice(ch.to) };
  }
  const text = around.current.text;
  const change = (s: string) => f.setBody(around.current.before + s + around.current.after);

  const link = m.url ? webLink(m.url) : null;
  const last = m.at !== null ? chapters.find(c => c.n === m.at) : undefined;

  if (at === null)
    return (
      <div className="note-editor">
        <div className="note-bar">
          <button className="btn ghost icon" onClick={props.onBack} aria-label={t.common.back}>
            <ArrowLeft size={20} />
          </button>
          <span className={`note-status mono${f.status === "error" ? " err" : ""}`}>{t.note.status[f.status]}</span>
          <button className="btn ghost icon" title={t.study.editText} aria-label={t.study.editText} onClick={() => open("all", true)}>
            <Pencil size={18} />
          </button>
          <button className="btn ghost icon" title={t.study.deleteMaterial} aria-label={t.study.deleteMaterial} onClick={props.onDelete}>
            <Trash2 size={18} />
          </button>
        </div>
        <div className="page">
          <div className="page-inner">
            <div>
              <h1 className="material-title">{m.title}</h1>
              <div className="muted small">
                {[t.study.kinds[m.kind], m.source].filter(Boolean).join(" · ")}
                {link && (
                  <>
                    {" · "}
                    <a href={link} onClick={e => (e.preventDefault(), void platform.openLink?.(link))}>
                      {m.url}
                    </a>
                  </>
                )}
              </div>
            </div>
            {last && (
              <button className="btn primary continue-btn" onClick={() => open(last.n)}>
                <ChevronRight size={18} /> {t.study.continueAt(chapterName(last))}
              </button>
            )}
            {chapters.length === 0 ? (
              <p className="muted">{t.study.noChapters}</p>
            ) : (
              <ol className="chapters" aria-label={t.study.contents}>
                {chapters.map(c => (
                  <li key={c.n} className={`chapter${isRead(c.n) ? " read" : ""}${m.at === c.n ? " here" : ""}`}>
                    <button
                      className="btn ghost icon"
                      role="checkbox"
                      aria-checked={isRead(c.n)}
                      aria-label={t.study.markRead}
                      onClick={() => toggle(c.n, !isRead(c.n))}
                    >
                      {isRead(c.n) ? <CircleCheck size={20} /> : <Circle size={20} />}
                    </button>
                    <button className="chapter-name" onClick={() => open(c.n)}>
                      <span>{chapterName(c)}</span>
                      {m.at === c.n && <span className="small here-tag">{t.study.stoppedHere}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        {f.dialog}
      </div>
    );

  return (
    <div className="note-editor reader">
      <div className="note-bar">
        <button className="btn ghost icon" onClick={props.onBack} aria-label={t.common.back} title={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <button className="btn ghost icon" onClick={close} aria-label={t.study.contents} title={t.study.contents}>
          <List size={20} />
        </button>
        <span className="note-status one-line reader-title">{at === "all" ? m.title : ch ? chapterName(ch) : ""}</span>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`}>{editing ? t.note.status[f.status] : ""}</span>
        {ch && (
          <button
            className="btn ghost icon"
            title={t.study.noteOnChapter}
            aria-label={t.study.noteOnChapter}
            onClick={() => props.onNote({ material: m.name, chapter: ch.n, title: chapterName(ch) })}
          >
            <NotebookPen size={18} />
          </button>
        )}
        {at !== "all" && (
          <button
            className={`btn ghost icon${editing ? " on" : ""}`}
            title={editing ? t.study.readMode : t.study.editText}
            aria-label={editing ? t.study.readMode : t.study.editText}
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            <Pencil size={18} />
          </button>
        )}
      </div>
      <Editor
        key={key}
        text={text}
        onChange={change}
        onSaveNow={f.saveNow}
        readOnly={!editing}
        autoFocus={editing && at === "all" && !text}
        placeholder={t.study.emptyHint}
      />
      {ch && (
        <div className="reader-foot">
          <button className="btn ghost icon" disabled={idx <= 0} aria-label={t.common.previous} onClick={() => open(chapters[idx - 1].n)}>
            <ChevronLeft size={20} />
          </button>
          <span className="small muted one-line reader-foot-ch">{chapterName(ch)}</span>
          {isRead(ch.n) ? (
            <button className="btn ghost" onClick={() => toggle(ch.n, false)}>
              <Check size={16} /> {t.study.read}
            </button>
          ) : (
            <button className="btn primary" onClick={readAndNext}>
              <Check size={16} /> {t.study.readNext}
            </button>
          )}
          <button className="btn ghost icon" disabled={idx >= chapters.length - 1} aria-label={t.common.next} onClick={() => open(chapters[idx + 1].n)}>
            <ChevronRight size={20} />
          </button>
        </div>
      )}
      {f.dialog}
    </div>
  );
}

export function Progress({ read, total }: { read: number; total: number }) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return (
    <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={read}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
