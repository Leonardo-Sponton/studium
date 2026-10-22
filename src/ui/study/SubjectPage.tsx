import { useState } from "react";
import { ArrowLeft, Layers, Library, NotebookPen, Plus, Search, Trash2 } from "lucide-react";
import { isoDate } from "../../data/dates";
import {
  cardCount,
  descendantsOf,
  dueCards,
  filterStudyNotes,
  groupsOf,
  isFreeNote,
  isSchool,
  progress,
  STUDY_NOTE_SORTS,
  subjectProgress,
  type StudyNoteOnly,
  type StudyNoteSort,
  type Subject,
} from "../../data/study";
import { useBack } from "../useBack";
import { LinksBox } from "./LinksBox";
import { PdfBox } from "./PdfBox";
import { ExercisesBox } from "./Exercises";
import { WorkbenchBox } from "./Workbench";
import { useNoteFile } from "../useNoteFile";
import { Progress } from "./MaterialReader";
import { usePref } from "./prefs";
import { t } from "../../i18n";

// A subject's page: its header fields, "in my own words", the references it is studied from
// (materials .md with their progress, PDFs, exercises, links), the notes (in a box of their own that scrolls; each tagged
// "standalone" or with what it was made from) and the workbench projects. Opened from the Study
// list; each row opens one level deeper.

export type MaterialBox = "md" | "pdf" | "exercises" | "links";

interface Props {
  subject: Subject;
  all: Subject[];
  /** Personal groups in their order (Study → Groups). */
  groups?: string[];
  onBack(): void;
  onSummary(): void;
  onMaterial(path: string): void;
  onAddMaterial(): void;
  onNote(path: string): void;
  onNewNote(): void;
  /** Opens the note about a PDF (made on first use). */
  onPdfNote(pdf: string): void;
  onProject(path: string): void;
  onExercise(path: string): void;
  onNewExercise(title: string): void;
  onNewProject(): void;
  onReview(): void;
  onAddCard(): void;
  onDelete(): void;
  /** Which list the materials box opens on. */
  tab?: MaterialBox;
}

export const daysTo = (day: string, today = isoDate()) => Math.round((Date.parse(day) - Date.parse(today)) / 86400000);

/** "Today", "Yesterday", "5 days ago" for a yyyy-mm-dd… date (when a subject was last studied). */
export const relativeDay = (when: string, today = isoDate()) => (when ? t.study.studiedAgo(-daysTo(when.slice(0, 10), today)) : "");

export function SubjectPage(props: Props) {
  const s = props.subject;
  const f = useNoteFile(s.path);
  useBack(true, props.onBack);
  const [title, setTitle] = useState(s.title);
  const [group, setGroup] = useState(s.group);
  const [box, setBox] = useState<MaterialBox>(props.tab ?? "md");
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<StudyNoteOnly>("");
  const [sort, setSort] = usePref<StudyNoteSort>("studium.study.noteSort", "chapter");
  const d = f.note ? f.data() : {};
  const parent = String(d.parent ?? "");
  const blocked = descendantsOf(props.all, s.slug);
  const parents = props.all.filter(x => !isSchool(x) && !blocked.has(x.slug)).sort((a, b) => a.title.localeCompare(b.title));
  const due = dueCards([s]).length;
  const cards = cardCount(s);
  const p = subjectProgress(s);
  /** "SQL handout › 3. JOIN" for a note about a chapter. */
  const fromOf = (name: string, chapter: number | null) => {
    const m = s.materials.find(x => x.name === name);
    const ch = chapter === null ? undefined : m?.chapters.find(c => c.n === chapter);
    return m && [m.title, ch?.title].filter(Boolean).join(" › ");
  };
  // Filter chips: each material or PDF that has notes, the free notes, the notes with cards.
  const noteMaterials = [
    ...s.materials.map(m => ({ key: `m:${m.name}` as StudyNoteOnly, title: m.title, count: s.notes.filter(n => n.material === m.name).length })),
    ...s.pdfs.map(p => ({ key: `p:${p.name}` as StudyNoteOnly, title: p.title, count: s.notes.filter(n => n.pdf === p.name).length })),
  ].filter(x => x.count > 0);
  const free = s.notes.filter(isFreeNote).length;
  const withCards = s.notes.filter(n => n.cards.length > 0).length;
  // Material chips only help when the notes are spread over more than one place.
  const byPlace = noteMaterials.length + (free > 0 ? 1 : 0) > 1;
  // A chip whose notes are gone stops filtering.
  const live =
    only === "" ||
    (only === "cards" ? withCards > 0 : byPlace && (only === "free" ? free > 0 : noteMaterials.some(x => x.key === only)));
  const shown = filterStudyNotes(s, query, live ? only : "", STUDY_NOTE_SORTS.includes(sort) ? sort : "chapter");
  const chip = (key: StudyNoteOnly, label: string, count: number, title?: string) => (
    <button
      key={key}
      role="tab"
      aria-selected={only === key}
      className={`chip${only === key || (!live && key === "") ? " active" : ""}`}
      title={title}
      onClick={() => setOnly(only === key ? "" : key)}
    >
      <span className="chip-label">{label}</span> {count > 0 && <span className="muted mono small">{count}</span>}
    </button>
  );

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={props.onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`}>{f.note ? t.note.status[f.status] : ""}</span>
        <button className="btn ghost icon" title={t.study.deleteSubject} aria-label={t.study.deleteSubject} onClick={props.onDelete}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <textarea
            className="task-title-input"
            rows={1}
            value={title}
            placeholder={t.study.subjectName}
            aria-label={t.study.subjectName2}
            onChange={e => {
              const v = e.target.value.replace(/\n/g, " ");
              setTitle(v);
              f.editData({ title: v.trim() || undefined });
            }}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
          />
          {f.note && (
            <div className="task-fields">
              <span className="fl">{t.study.fParent}</span>
              <select className="field" value={parent} onChange={e => f.setData({ parent: e.target.value || undefined })}>
                <option value="">{t.study.noParent}</option>
                {parents.map(x => (
                  <option key={x.slug} value={x.slug}>
                    {x.title}
                  </option>
                ))}
              </select>
              <span className="fl">{t.study.fGroup}</span>
              <input
                className="field"
                list="study-groups"
                value={group}
                placeholder={t.study.noGroup}
                onChange={e => {
                  setGroup(e.target.value);
                  f.editData({ group: e.target.value.trim() || undefined });
                }}
              />
              <datalist id="study-groups">
                {(props.groups ?? groupsOf(props.all)).map(g => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          )}

          {p.total > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <Progress read={p.read} total={p.total} />
              <span className="muted small">{t.study.chaptersRead(p.read, p.total)}</span>
            </div>
          )}

          <CardsBox cards={cards} due={due} onReview={props.onReview} onAdd={props.onAddCard} />

          <button className="list-item summary-row" onClick={props.onSummary}>
            <span className="list-title">{t.study.summary}</span>
            <span className="list-meta">{t.study.summaryHint}</span>
            {!s.hasSummary && <span className="list-meta here-tag">{t.study.summaryEmpty}</span>}
          </button>

          <div className="task-notes-head study-refs-head">
            <h2>
              <Library size={18} className="muted" /> {t.study.references}
            </h2>
          </div>
          <div className="segmented material-tabs" role="tablist" aria-label={t.study.references}>
            <button role="tab" aria-pressed={box === "md"} onClick={() => setBox("md")}>
              {t.study.mdMaterials}
              {s.materials.length > 0 && <span className="muted mono small"> {s.materials.length}</span>}
            </button>
            <button role="tab" aria-pressed={box === "pdf"} onClick={() => setBox("pdf")}>
              {t.study.pdfs}
              {s.pdfs.length > 0 && <span className="muted mono small"> {s.pdfs.length}</span>}
            </button>
            <button role="tab" aria-pressed={box === "exercises"} onClick={() => setBox("exercises")}>
              {t.study.exercises}
              {s.exercises.docs.length + s.exercises.pdfs.length > 0 && (
                <span className="muted mono small"> {s.exercises.docs.length + s.exercises.pdfs.length}</span>
              )}
            </button>
            <button role="tab" aria-pressed={box === "links"} onClick={() => setBox("links")}>
              {t.study.links}
              {s.links.length > 0 && <span className="muted mono small"> {s.links.length}</span>}
            </button>
          </div>
          {box === "links" ? (
            <LinksBox dir={s.dir} links={s.links} heading={false} />
          ) : box === "exercises" ? (
            <ExercisesBox subject={s} onOpen={props.onExercise} onNew={props.onNewExercise} />
          ) : box === "pdf" ? (
            <PdfBox subject={s} onNote={props.onPdfNote} />
          ) : (
          <>
          <div className="task-notes-head row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={props.onAddMaterial}>
              <Plus size={16} /> {t.study.addMaterial}
            </button>
          </div>
          {s.materials.length === 0 ? (
            <p className="muted small">{t.study.noMaterials}</p>
          ) : (
            <ul className="list">
              {s.materials.map(m => {
                const mp = progress(m);
                return (
                  <li key={m.path}>
                    <button className="list-item material-row" onClick={() => props.onMaterial(m.path)}>
                      <span className="list-title">{m.title}</span>
                      <span className="row" style={{ gap: 8 }}>
                        <Progress read={mp.read} total={mp.total} />
                        <span className="list-meta mono">{t.study.progressOf(mp.read, mp.total)}</span>
                      </span>
                      <span className="list-meta">{[t.study.kinds[m.kind], m.source].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </>
          )}

          <div className="task-notes-head row" style={{ justifyContent: "space-between" }}>
            <h2>{t.study.notes}</h2>
            <button className="btn ghost" onClick={props.onNewNote}>
              <NotebookPen size={16} /> {t.study.newNote}
            </button>
          </div>
          {s.notes.length > 1 && (
            <>
              <div className="note-filter study-note-filter">
                <Search size={16} className="muted" />
                <input
                  className="field"
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t.study.filterNotes}
                  aria-label={t.study.filterNotes}
                />
              </div>
              <div className="chips note-chips study-note-chips" role="tablist" aria-label={t.study.show}>
                <select className="field note-sort" value={sort} aria-label={t.study.sortBy} title={t.study.sortBy} onChange={e => setSort(e.target.value as StudyNoteSort)}>
                  {STUDY_NOTE_SORTS.map(x => (
                    <option key={x} value={x}>
                      {t.study.noteSorts[x]}
                    </option>
                  ))}
                </select>
                {chip("", t.study.allNotes, 0)}
                {byPlace && noteMaterials.map(x => chip(x.key, x.title, x.count, x.title))}
                {byPlace && free > 0 && chip("free", t.study.notesFree, free)}
                {withCards > 0 && withCards < s.notes.length && chip("cards", t.study.notesWithCards, withCards)}
              </div>
            </>
          )}
          {s.notes.length === 0 ? (
            <p className="muted small">{t.study.noNotes}</p>
          ) : shown.length === 0 ? (
            <p className="muted small">{t.study.noNoteMatch}</p>
          ) : (
            <ul className="list study-notes-box" aria-label={t.study.notes}>
              {shown.map(n => {
                const pdf = n.pdf ? s.pdfs.find(x => x.name === n.pdf) : undefined;
                const from = n.material ? fromOf(n.material, n.chapter) : n.pdf ? (pdf?.title ?? n.pdf.replace(/\.pdf$/i, "")) : "";
                const tag = n.material ? "material" : n.pdf ? "pdf" : "free";
                return (
                  <li key={n.path}>
                    <button className="list-item" onClick={() => props.onNote(n.path)}>
                      <span className="list-title">
                        <span className={`note-tag ${tag}`}>{t.study.noteTags[tag]}</span>
                        {n.title || <span className="muted">{t.common.untitled}</span>}
                      </span>
                      {n.preview && <span className="note-preview">{n.preview}</span>}
                      {(from || n.cards.length > 0) && (
                        <span className="list-meta">{[from, n.cards.length ? t.study.cards(n.cards.length) : ""].filter(Boolean).join(" · ")}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <WorkbenchBox subject={s} onOpen={props.onProject} onNew={props.onNewProject} />
        </div>
      </div>
      {f.dialog}
    </div>
  );
}

/** Flashcards of a subject: review, add one by hand. */
export function CardsBox(props: { cards: number; due: number; onReview(): void; onAdd(): void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {props.cards > 0 && (
        <button className="today-card" style={{ marginTop: 0 }} onClick={props.onReview} disabled={!props.due}>
          <Layers size={18} />
          <span>{props.due ? t.study.reviewAll(props.due) : t.study.nothingDue}</span>
          <span className="count">{t.study.cards(props.cards)}</span>
        </button>
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn ghost" onClick={props.onAdd}>
          <Plus size={16} /> {t.study.addCard}
        </button>
      </div>
    </div>
  );
}
