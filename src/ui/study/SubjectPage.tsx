import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CirclePlay,
  File,
  FileText,
  GraduationCap,
  Hammer,
  Layers,
  LayoutDashboard,
  Library,
  Newspaper,
  NotebookPen,
  Plus,
  Quote,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
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
  type Material,
  type MaterialKind,
  type StudyNote,
  type StudyNoteOnly,
  type StudyNoteSort,
  type Subject,
} from "../../data/study";
import { Dialog } from "../Dialog";
import { useBack } from "../useBack";
import { Cover } from "./Covers";
import { LinksBox } from "./LinksBox";
import { PdfBox } from "./PdfBox";
import { ExercisesBox } from "./Exercises";
import { WorkbenchBox } from "./Workbench";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { Progress } from "./MaterialReader";
import { usePref } from "./prefs";
import { t } from "../../i18n";

// A personal subject's page: a banner with its group's cover, its name and where it sits
// (group › parent), four tiles (reading, flashcards, notes, workbench) and a tab for each:
//   Overview    what to do next: review, the chapter where reading stopped, "in my own words",
//               the sub-subjects and the latest notes
//   Flashcards  the cards to review, how far they are learned, the notes they come from
//   Notes       the notes as cards, with the filter, the chips and the order
//   Materials   the references it is studied from: .md materials, PDFs, exercises, links
//   Workbench   the projects
// The parent, the group and delete sit in the settings dialog (the gear).

export type MaterialBox = "md" | "pdf" | "exercises" | "links";
export type SubjectTab = "overview" | "cards" | "notes" | "materials" | "workbench";
export const SUBJECT_TABS: SubjectTab[] = ["overview", "cards", "notes", "materials", "workbench"];

interface Props {
  subject: Subject;
  all: Subject[];
  /** Personal groups in their order (Study → Groups). */
  groups?: string[];
  /** The cover of the subject's group (of its root, for a sub-subject). */
  cover?: string;
  tab: SubjectTab;
  box: MaterialBox;
  onTab(tab: SubjectTab, box?: MaterialBox): void;
  onBack(): void;
  /** Opens the page of a group (from the banner's path). */
  onGroup(group: string): void;
  onSubject(s: Subject): void;
  onSummary(): void;
  onMaterial(path: string, chapter?: number | null): void;
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
}

export const daysTo = (day: string, today = isoDate()) => Math.round((Date.parse(day) - Date.parse(today)) / 86400000);

/** "Today", "Yesterday", "5 days ago" for a yyyy-mm-dd… date (when a subject was last studied). */
export const relativeDay = (when: string, today = isoDate()) => (when ? t.study.studiedAgo(-daysTo(when.slice(0, 10), today)) : "");

/** The subject and its parents, from the top of the tree down. */
function lineOf(all: Subject[], s: Subject): Subject[] {
  const out = [s];
  for (let at = s; at.parent; ) {
    const up = all.find(x => x.slug === at.parent && !isSchool(x));
    if (!up || out.includes(up)) break;
    out.unshift((at = up));
  }
  return out;
}

/** The group a subject shows under: its own, or its root's. */
export const groupOf = (all: Subject[], s: Subject) => lineOf(all, s)[0].group;

const TAB_ICONS: Record<SubjectTab, React.ReactNode> = {
  overview: <LayoutDashboard size={16} />,
  cards: <Layers size={16} />,
  notes: <NotebookPen size={16} />,
  materials: <Library size={16} />,
  workbench: <Hammer size={16} />,
};

const KIND_ICONS: Record<MaterialKind, React.ReactNode> = {
  handout: <FileText size={18} />,
  book: <BookOpen size={18} />,
  course: <GraduationCap size={18} />,
  video: <CirclePlay size={18} />,
  article: <Newspaper size={18} />,
  other: <File size={18} />,
};

/** Cards by how far they are learned: never seen, being learned, known (21 days or more apart). */
function cardStages(s: Subject): { fresh: number; learning: number; known: number } {
  const out = { fresh: 0, learning: 0, known: 0 };
  for (const n of s.notes)
    for (const c of n.cards) {
      const st = n.states.get(c.id);
      if (!st) out.fresh++;
      else if (st.interval >= 21) out.known++;
      else out.learning++;
    }
  return out;
}

/** The material read last that still has chapters to read, and where it stopped. */
function readingAt(s: Subject): { m: Material; chapter: number; title: string } | null {
  let best: { m: Material; chapter: number; title: string } | null = null;
  for (const m of s.materials) {
    const p = progress(m);
    const ch = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
    if (!ch || p.read === p.total) continue;
    if (!best || m.modified > best.m.modified) best = { m, chapter: ch.n, title: ch.title || (ch.n === 0 ? t.study.intro : t.study.chapter(ch.n)) };
  }
  return best;
}

export function SubjectPage(props: Props) {
  const s = props.subject;
  const f = useNoteFile(s.path);
  useBack(true, props.onBack);
  const [title, setTitle] = useState(s.title);
  const [settings, setSettings] = useState(false);
  const line = lineOf(props.all, s);
  const group = line[0].group;
  const due = dueCards([s]).length;
  const cards = cardCount(s);
  const p = subjectProgress(s);
  const notes = s.notes.length;
  const withCards = s.notes.filter(n => n.cards.length > 0).length;
  const active = s.workbench.filter(x => x.status === "active").length;
  const tab = (x: SubjectTab, box?: MaterialBox) => () => props.onTab(x, box);
  const tabCount = (x: SubjectTab) =>
    x === "cards" ? cards : x === "notes" ? notes : x === "materials" ? s.materials.length + s.pdfs.length + s.exercises.docs.length + s.exercises.pdfs.length + s.links.length : x === "workbench" ? s.workbench.length : 0;

  return (
    <div className="note-editor subj">
      <div className="page subj-page">
        <header className="subj-hero">
          <Cover url={props.cover} name={group || s.title} className="subj-hero-pic" />
          <div className="subj-hero-bar">
            <button className="btn icon subj-hero-btn" onClick={props.onBack} aria-label={t.common.back} title={t.common.back}>
              <ArrowLeft size={20} />
            </button>
            <span className={`subj-hero-status mono${f.status === "error" ? " err" : ""}`}>{f.note && f.status !== "saved" ? t.note.status[f.status] : ""}</span>
            <button className="btn icon subj-hero-btn" onClick={() => setSettings(true)} aria-label={t.study.subjectSettings} title={t.study.subjectSettings}>
              <Settings2 size={18} />
            </button>
          </div>
          <div className="subj-hero-body">
            {(group || line.length > 1) && (
              <nav className="subj-crumbs" aria-label={t.study.fParent}>
                {group && <button onClick={() => props.onGroup(group)}>{group}</button>}
                {line.slice(0, -1).map(x => (
                  <span key={x.path} className="row" style={{ gap: 4 }}>
                    {group || x !== line[0] ? <ChevronRight size={14} /> : null}
                    <button onClick={() => props.onSubject(x)}>{x.title}</button>
                  </span>
                ))}
              </nav>
            )}
            <textarea
              className="subj-title"
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
            {s.modified && <span className="subj-hero-meta">{relativeDay(s.modified)}</span>}
          </div>
        </header>

        <div className="subj-inner">
          <div className="subj-tiles">
            <button className="subj-tile" onClick={tab("materials", "md")}>
              <span className="subj-tile-k">
                <BookOpen size={13} /> <span>{t.study.reading}</span>
              </span>
              <span className="subj-tile-v">{p.total ? `${Math.round((p.read / p.total) * 100)}%` : "—"}</span>
              {p.total > 0 ? <Progress read={p.read} total={p.total} /> : <span className="subj-tile-s">{t.study.materialsCount(s.materials.length)}</span>}
            </button>
            <button className={`subj-tile${due ? " hot" : ""}`} onClick={tab("cards")}>
              <span className="subj-tile-k">
                <Layers size={13} /> <span>{t.study.cardsWord}</span>
              </span>
              <span className="subj-tile-v">{due}</span>
              <span className="subj-tile-s">{cards ? t.study.dueOf(cards) : t.study.noCardsShort}</span>
            </button>
            <button className="subj-tile" onClick={tab("notes")}>
              <span className="subj-tile-k">
                <NotebookPen size={13} /> <span>{t.study.notes}</span>
              </span>
              <span className="subj-tile-v">{notes}</span>
              <span className="subj-tile-s">{withCards ? t.study.withCardsCount(withCards) : t.study.notesCount(notes)}</span>
            </button>
            <button className="subj-tile" onClick={tab("workbench")}>
              <span className="subj-tile-k">
                <Hammer size={13} /> <span>{t.study.workbench}</span>
              </span>
              <span className="subj-tile-v">{s.workbench.length}</span>
              <span className="subj-tile-s">{active ? t.study.projectsActive(active) : t.study.projectsCount(s.workbench.length)}</span>
            </button>
          </div>

          <div className="subj-tabs" role="tablist" aria-label={t.study.sections}>
            {SUBJECT_TABS.map(x => (
              <button key={x} role="tab" aria-selected={props.tab === x} aria-label={t.study.subjectTabs[x]} className={props.tab === x ? "active" : ""} onClick={tab(x)}>
                {TAB_ICONS[x]}
                <span className="subj-tab-label">{t.study.subjectTabs[x]}</span>
                {tabCount(x) > 0 && <span className="subj-tab-n mono">{tabCount(x)}</span>}
              </button>
            ))}
          </div>

          <div className="subj-body stack">
            {props.tab === "overview" && <Overview {...props} due={due} />}
            {props.tab === "cards" && <Cards {...props} due={due} cards={cards} />}
            {props.tab === "notes" && <Notes {...props} />}
            {props.tab === "materials" && <Materials {...props} />}
            {props.tab === "workbench" && <WorkbenchBox subject={s} onOpen={props.onProject} onNew={props.onNewProject} />}
          </div>
        </div>
      </div>
      {settings && f.note && <Settings {...props} f={f} onClose={() => setSettings(false)} />}
      {f.dialog}
    </div>
  );
}

// ---- Tabs ----

type TabProps = Props & { due?: number; cards?: number };

function Overview(props: TabProps) {
  const s = props.subject;
  const at = readingAt(s);
  const kids = props.all.filter(x => !isSchool(x) && x.parent === s.slug);
  const recent = [...s.notes].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 4);
  const empty = !s.materials.length && !s.notes.length && !s.pdfs.length && !s.links.length;
  return (
    <>
      {props.due ? (
        <button className="subj-review" onClick={props.onReview}>
          <Layers size={22} />
          <span className="stack" style={{ gap: 0 }}>
            <strong>{t.study.reviewAll(props.due)}</strong>
            <span className="small">{t.study.reviewHint}</span>
          </span>
          <ChevronRight size={20} />
        </button>
      ) : null}
      {at && (
        <button className="subj-panel subj-continue" onClick={() => props.onMaterial(at.m.path, at.chapter)}>
          <span className="subj-panel-icon">{KIND_ICONS[at.m.kind]}</span>
          <span className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
            <span className="subj-kicker">{t.study.continueReading}</span>
            <span className="list-title">{at.title}</span>
            <span className="list-meta">{at.m.title}</span>
            <Progress {...progress(at.m)} />
          </span>
          <ChevronRight size={20} className="muted" />
        </button>
      )}
      <button className="subj-panel subj-summary" onClick={props.onSummary}>
        <span className="subj-panel-icon">
          <Quote size={18} />
        </span>
        <span className="stack" style={{ gap: 4, flex: 1 }}>
          <span className="subj-kicker">{t.study.summary}</span>
          <span className="small">{t.study.summaryHint}</span>
          {!s.hasSummary && <span className="list-meta here-tag">{t.study.summaryEmpty}</span>}
        </span>
        <ChevronRight size={20} className="muted" />
      </button>
      {kids.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="subj-h">{t.study.subSubjects}</h2>
          <div className="subj-kids">
            {kids.map(k => (
              <button key={k.path} className="subj-kid" onClick={() => props.onSubject(k)}>
                <span className="list-title">{k.title}</span>
                <span className="list-meta">
                  {[k.notes.length ? t.study.notesCount(k.notes.length) : "", k.materials.length ? t.study.materialsCount(k.materials.length) : ""].filter(Boolean).join(" · ") ||
                    relativeDay(k.modified)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <div className="subj-h-row">
            <h2 className="subj-h">{t.study.recentNotes}</h2>
            <button className="btn ghost small-btn" onClick={() => props.onTab("notes")}>
              {t.study.seeAll} <ChevronRight size={16} />
            </button>
          </div>
          <ul className="subj-notes">
            {recent.map(n => (
              <li key={n.path}>
                <NoteCard s={s} n={n} onOpen={props.onNote} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {empty && (
        <div className="subj-empty">
          <p className="muted">{t.study.subjectStart}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn primary" onClick={props.onAddMaterial}>
              <Plus size={16} /> {t.study.addMaterial}
            </button>
            <button className="btn" onClick={props.onNewNote}>
              <NotebookPen size={16} /> {t.study.newNote}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Cards(props: TabProps) {
  const s = props.subject;
  const due = props.due ?? 0;
  const total = props.cards ?? 0;
  const st = cardStages(s);
  const decks = s.notes.filter(n => n.cards.length > 0);
  const dueIn = (n: StudyNote) => dueCards([{ ...s, notes: [n] }]).length;
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <>
      <div className="subj-deck-hero">
        <div className="stack" style={{ gap: 2 }}>
          <span className="subj-big mono">{due}</span>
          <span className="muted">{due ? t.study.dueToday : t.study.nothingDue}</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary" disabled={!due} onClick={props.onReview}>
            <Layers size={16} /> {t.study.reviewNow}
          </button>
          <button className="btn" onClick={props.onAddCard}>
            <Plus size={16} /> {t.study.addCard}
          </button>
        </div>
      </div>
      {total > 0 ? (
        <>
          <section className="stack" style={{ gap: 8 }}>
            <h2 className="subj-h">{t.study.cards(total)}</h2>
            <div className="subj-stages" aria-hidden>
              <span className="fresh" style={{ width: pct(st.fresh) }} />
              <span className="learning" style={{ width: pct(st.learning) }} />
              <span className="known" style={{ width: pct(st.known) }} />
            </div>
            <div className="subj-stage-keys">
              <span className="fresh">{t.study.stages.fresh(st.fresh)}</span>
              <span className="learning">{t.study.stages.learning(st.learning)}</span>
              <span className="known">{t.study.stages.known(st.known)}</span>
            </div>
          </section>
          <section className="stack" style={{ gap: 8 }}>
            <h2 className="subj-h">{t.study.decks}</h2>
            <ul className="subj-decks">
              {decks.map(n => {
                const d = dueIn(n);
                return (
                  <li key={n.path}>
                    <button className="subj-deck" onClick={() => props.onNote(n.path)}>
                      <span className="subj-deck-stack" aria-hidden>
                        <Layers size={18} />
                      </span>
                      <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                        <span className="list-title">{n.title || t.common.untitled}</span>
                        <span className="list-meta">{t.study.cards(n.cards.length)}</span>
                      </span>
                      {d > 0 && <span className="subj-due-pill mono">{d}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <p className="muted small">{t.study.noCards}</p>
      )}
    </>
  );
}

function Notes(props: TabProps) {
  const s = props.subject;
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<StudyNoteOnly>("");
  const [sort, setSort] = usePref<StudyNoteSort>("studium.study.noteSort", "chapter");
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
    <>
      <div className="subj-toolbar">
        {s.notes.length > 1 && (
          <div className="note-filter subj-search">
            <Search size={16} className="muted" />
            <input className="field" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.study.filterNotes} aria-label={t.study.filterNotes} />
          </div>
        )}
        <button className="btn primary" onClick={props.onNewNote}>
          <NotebookPen size={16} /> {t.study.newNote}
        </button>
      </div>
      {s.notes.length > 1 && (
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
      )}
      {s.notes.length === 0 ? (
        <p className="muted small">{t.study.noNotes}</p>
      ) : shown.length === 0 ? (
        <p className="muted small">{t.study.noNoteMatch}</p>
      ) : (
        <ul className="subj-notes" aria-label={t.study.notes}>
          {shown.map(n => (
            <li key={n.path}>
              <NoteCard s={s} n={n} onOpen={props.onNote} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A note as a card: its tag (free, material, PDF) as the top edge, title, a few lines, where from. */
function NoteCard(props: { s: Subject; n: StudyNote; onOpen(path: string): void }) {
  const { s, n } = props;
  const m = n.material ? s.materials.find(x => x.name === n.material) : undefined;
  const ch = m && n.chapter !== null ? m.chapters.find(c => c.n === n.chapter) : undefined;
  const pdf = n.pdf ? s.pdfs.find(x => x.name === n.pdf) : undefined;
  const from = m ? [m.title, ch?.title].filter(Boolean).join(" › ") : n.pdf ? (pdf?.title ?? n.pdf.replace(/\.pdf$/i, "")) : "";
  const tag = n.material ? "material" : n.pdf ? "pdf" : "free";
  return (
    <button className={`subj-note ${tag}`} onClick={() => props.onOpen(n.path)}>
      <span className="subj-note-head">
        <span className={`note-tag ${tag}`}>{t.study.noteTags[tag]}</span>
        {n.cards.length > 0 && (
          <span className="subj-note-cards mono" title={t.study.cards(n.cards.length)}>
            <Layers size={12} /> {n.cards.length}
          </span>
        )}
      </span>
      <span className="list-title">{n.title || <span className="muted">{t.common.untitled}</span>}</span>
      {n.preview && <span className="subj-note-preview">{n.preview}</span>}
      <span className="list-meta subj-note-foot">{[from, relativeDay(n.modified)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

function Materials(props: TabProps) {
  const s = props.subject;
  const box = props.box;
  const boxes: { id: MaterialBox; label: string; n: number; icon: React.ReactNode }[] = [
    { id: "md", label: t.study.mdMaterialsLong, n: s.materials.length, icon: <BookOpen size={15} /> },
    { id: "pdf", label: t.study.pdfs, n: s.pdfs.length, icon: <FileText size={15} /> },
    { id: "exercises", label: t.study.exercises, n: s.exercises.docs.length + s.exercises.pdfs.length, icon: <NotebookPen size={15} /> },
    { id: "links", label: t.study.links, n: s.links.length, icon: <Library size={15} /> },
  ];
  return (
    <>
      <div className="subj-toolbar subj-boxes-row">
        <div className="chips subj-boxes" role="tablist" aria-label={t.study.references}>
          {boxes.map(b => (
            <button key={b.id} role="tab" aria-selected={box === b.id} className={`chip${box === b.id ? " active" : ""}`} onClick={() => props.onTab("materials", b.id)}>
              {b.icon} {b.label}
              {b.n > 0 && <span className="muted mono small">{b.n}</span>}
            </button>
          ))}
        </div>
        {box === "md" && (
          <button className="btn primary" onClick={props.onAddMaterial}>
            <Plus size={16} /> <span className="hide-narrow">{t.study.addMaterial}</span>
          </button>
        )}
      </div>
      {box === "links" ? (
        <LinksBox dir={s.dir} links={s.links} heading={false} />
      ) : box === "exercises" ? (
        <ExercisesBox subject={s} onOpen={props.onExercise} onNew={props.onNewExercise} />
      ) : box === "pdf" ? (
        <PdfBox subject={s} onNote={props.onPdfNote} />
      ) : (
        <>
          {s.materials.length === 0 ? (
            <p className="muted small">{t.study.noMaterials}</p>
          ) : (
            <ul className="subj-materials">
              {s.materials.map(m => {
                const mp = progress(m);
                const pct = mp.total ? Math.round((mp.read / mp.total) * 100) : 0;
                const at = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
                return (
                  <li key={m.path}>
                    <button className={`subj-material k-${m.kind}`} onClick={() => props.onMaterial(m.path)}>
                      <span className="subj-material-icon">{KIND_ICONS[m.kind]}</span>
                      <span className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                        <span className="list-title">{m.title}</span>
                        <span className="list-meta">{[t.study.kinds[m.kind], m.source].filter(Boolean).join(" · ")}</span>
                        <span className="row" style={{ gap: 8 }}>
                          <Progress read={mp.read} total={mp.total} />
                          <span className="list-meta mono">{mp.total ? `${pct}%` : "—"}</span>
                        </span>
                        {at && pct < 100 && <span className="list-meta">{t.study.stoppedAt(at.title || t.study.chapter(at.n))}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** The parent, the group and delete: set once, so out of the way behind the gear. */
function Settings(props: Props & { f: NoteFile; onClose(): void }) {
  const { subject: s, f } = props;
  const d = f.data();
  const [group, setGroup] = useState(s.group);
  const blocked = descendantsOf(props.all, s.slug);
  const parents = props.all.filter(x => !isSchool(x) && !blocked.has(x.slug)).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Dialog title={t.study.subjectSettings} onClose={props.onClose}>
      <div className="task-fields">
        <span className="fl">{t.study.fParent}</span>
        <select className="field" value={String(d.parent ?? "")} onChange={e => f.setData({ parent: e.target.value || undefined })}>
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
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button
          className="btn danger-text"
          onClick={() => {
            props.onClose();
            props.onDelete();
          }}
        >
          <Trash2 size={16} /> {t.study.deleteSubject}
        </button>
        <button className="btn" onClick={props.onClose}>
          {t.common.close}
        </button>
      </div>
    </Dialog>
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
