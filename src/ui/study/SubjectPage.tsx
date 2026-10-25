import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Circle,
  CircleCheck,
  CirclePlay,
  File,
  FileText,
  FolderPlus,
  GraduationCap,
  ImageMinus,
  ImagePlus,
  Crop,
  Hammer,
  Layers,
  Link2,
  LayoutDashboard,
  Lock,
  Library,
  Newspaper,
  Pencil,
  NotebookPen,
  Plus,
  Quote,
  Search,
  Settings2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { isoDate } from "../../data/dates";
import {
  cardCount,
  descendantsOf,
  dueCards,
  filterStudyNotes,
  groupsOf,
  isFreeNote,
  isNotebookNote,
  isSchool,
  progress,
  removeSubjectCover,
  setSubjectCover,
  frameText,
  type CoverFrame,
  STUDY_NOTE_SORTS,
  type Material,
  type MaterialKind,
  type StudyNote,
  type StudyNoteOnly,
  type StudyNoteSort,
  type Subject,
  type SubjectKind,
} from "../../data/study";
import { AskText, Confirm, Dialog } from "../Dialog";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { useApp } from "../context";
import { useHold } from "../useHold";
import { flushAll } from "../../data/pending";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useBack } from "../useBack";
import { Cover, CoverAdjust, coverData, useImage } from "./Covers";
import { LinksBox } from "./LinksBox";
import { PdfBox } from "./PdfBox";
import { ExercisesBox } from "./Exercises";
import { WorkbenchBox } from "./Workbench";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { usePref } from "./prefs";
import { notebookAt, todayPicks, type Pick } from "../../data/notebook";
import { NotebookBox, TodayPicks } from "./Notebook";
import { pointsOf } from "./Recall";
import { t } from "../../i18n";

// A personal subject's page: a banner with its cover (its own or its group's), its name and where it sits
// (group › parent). It is one of two types, chosen once when it is made and never changed:
// a Hub only gathers sub-subjects and shows them as an index (with search, filters and order);
// a study folder has a section for each:
//   Overview    up to three things for today (where reading stopped, a note to try to recall,
//               the next chapter to write), My notebook (ui/study/Notebook), "in my own words",
//               the review points (ui/study/Recall) and the sub-subjects
//   Flashcards  the cards to review, how far they are learned, the notes they come from
//   Notes       the notes as cards, with the filter, the chips and the order
//   Materials   the references it is studied from: .md materials, PDFs, exercises, links
//   Workbench   the projects
// The cover, the type, the parent, the group and delete sit in the settings dialog (the gear).

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
  /** A note's menu (the same as its row in the tree), at the pointer. */
  onNoteMenu(n: StudyNote, at: { x: number; y: number }): void;
  /** A sub-subject's menu. */
  onSubjectMenu(s: Subject, at: { x: number; y: number }): void;
  /** A new subject inside this one. */
  onNewChild(): void;
  /** The subject's review points. */
  onPoints(): void;
  /** One of the suggestions for today. */
  onPick(p: Pick): void;
  /** A new note with this title (a notebook chapter). */
  onNewTitled(title: string): void;
}

export const daysTo = (day: string, today = isoDate()) => Math.round((Date.parse(day) - Date.parse(today)) / 86400000);

/** "Today", "Yesterday", "5 days ago" for a yyyy-mm-dd… date (when a subject was last studied). */
export const relativeDay = (when: string, today = isoDate()) => (when ? t.study.studiedAgo(-daysTo(when.slice(0, 10), today)) : "");

/** The subject and its parents, from the top of the tree down. */
export function lineOf(all: Subject[], s: Subject): Subject[] {
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

const SEC_ICONS: Record<SubjectTab, React.ReactNode> = {
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
export function readingAt(s: Subject): { m: Material; chapter: number; title: string } | null {
  let best: { m: Material; chapter: number; title: string } | null = null;
  for (const m of s.materials) {
    const p = progress(m);
    const ch = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
    if (!ch || p.read === p.total) continue;
    if (!best || m.modified > best.m.modified) best = { m, chapter: ch.n, title: ch.title || (ch.n === 0 ? t.study.intro : t.study.chapter(ch.n)) };
  }
  return best;
}

/** Where reading stopped: the material chapter or the notebook chapter opened last. */
export function stoppedAt(s: Subject): string | null {
  const m = readingAt(s);
  const n = notebookAt(s);
  if (n && (!m || s.notebookWhen > m.m.modified)) return n.title;
  return m?.title ?? null;
}

/** Where each subject's page was scrolled to, so coming back from a note lands in the same place. */
const scrolled = new Map<string, { at: string; top: number }>();

export function SubjectPage(props: Props) {
  const s = props.subject;
  const f = useNoteFile(s.path);
  useBack(true, props.onBack);
  const [title, setTitle] = useState(s.title);
  const [settings, setSettings] = useState(false);
  // Its own cover, or the nearest one above it (JDBC shows the Java hub's), or its group's.
  const coverFrom = lineOf(props.all, s).reverse().find(x => x.cover);
  const ownCover = useImage(coverFrom?.cover ?? "", coverFrom?.coverFrame);
  const page = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SubjectTab>(props.tab);
  // The section picked in the bar: it stays lit while the page scrolls to it (a short last
  // section can't reach the top), until the user scrolls by hand.
  const picked = useRef<SubjectTab | null>(null);
  const line = lineOf(props.all, s);
  const group = line[0].group;
  const due = dueCards([s]).length;
  const cards = cardCount(s);
  const notes = s.notes.length;
  const active2 = s.workbench.filter(x => x.status === "active").length;
  const tabCount = (x: SubjectTab) =>
    x === "cards" ? cards : x === "notes" ? notes : x === "materials" ? s.materials.length + s.pdfs.length + s.exercises.docs.length + s.exercises.pdfs.length + s.links.length : x === "workbench" ? s.workbench.length : 0;

  const hub = isHub(props.all, s);

  const target = (x: SubjectTab, box?: MaterialBox) =>
    (x === "materials" && box && box !== "md" ? page.current?.querySelector<HTMLElement>(`[data-box="${box}"]`) : null) ??
    page.current?.querySelector<HTMLElement>(`[data-sec="${x}"]`);
  const go = (x: SubjectTab, box?: MaterialBox) => () => {
    picked.current = x;
    setActive(x);
    target(x, box)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Opening: back where it was (coming back from something opened here), or at the section asked for.
  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return;
    const was = scrolled.get(s.path);
    if (was && was.at === `${props.tab}:${props.box}`) el.scrollTop = was.top;
    else if (props.tab !== "overview" || props.box !== "md") target(props.tab, props.box)?.scrollIntoView({ block: "start" });
  }, [s.path]);

  // The bar lights the section being read; the pane keeps it, to come back to it.
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const spy = () => {
      let at: SubjectTab = "overview";
      const line = el.getBoundingClientRect().top + (el.querySelector(".subj-tabs")?.getBoundingClientRect().height ?? 0) + 32;
      for (const x of SUBJECT_TABS) {
        const sec = el.querySelector(`[data-sec="${x}"]`);
        if (sec && sec.getBoundingClientRect().top <= line) at = x;
      }
      if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) at = SUBJECT_TABS[SUBJECT_TABS.length - 1];
      if (picked.current) at = picked.current;
      setActive(at);
      scrolled.set(s.path, { at: `${at}:md`, top: el.scrollTop });
    };
    const byHand = () => (picked.current = null);
    el.addEventListener("scroll", spy, { passive: true });
    el.addEventListener("wheel", byHand, { passive: true });
    el.addEventListener("touchstart", byHand, { passive: true });
    el.addEventListener("keydown", byHand);
    return () => {
      el.removeEventListener("scroll", spy);
      el.removeEventListener("wheel", byHand);
      el.removeEventListener("touchstart", byHand);
      el.removeEventListener("keydown", byHand);
    };
  }, [s.path]);
  useEffect(() => {
    if (active !== props.tab || props.box !== "md") props.onTab(active, "md");
  }, [active]);

  const section = (x: SubjectTab, sub: string, actions: React.ReactNode, body: React.ReactNode) => (
    <section className={`subj-sec sec-${x}`} data-sec={x} aria-labelledby={`sec-${x}`}>
      <header className="subj-sec-head">
        <span className="subj-sec-icon">{SEC_ICONS[x]}</span>
        <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <h2 id={`sec-${x}`} className="subj-sec-title">
            {t.study.subjectTabs[x]}
          </h2>
          {sub && <span className="subj-sec-sub">{sub}</span>}
        </span>
        {actions && <span className="subj-sec-actions">{actions}</span>}
      </header>
      <div className="subj-sec-body stack">{body}</div>
    </section>
  );

  return (
    <div className="note-editor subj">
      <div className="page subj-page" ref={page}>
        <header className="subj-hero">
          <Cover url={ownCover || props.cover} name={group || s.title} className="subj-hero-pic" />
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

        {hub ? (
          <Hub {...props} />
        ) : (
          <div className="subj-inner">
            <nav className="subj-tabs" aria-label={t.study.sections}>
              {SUBJECT_TABS.map(x => (
                <button key={x} aria-current={active === x ? "location" : undefined} aria-label={t.study.subjectTabs[x]} className={active === x ? "active" : ""} onClick={go(x)}>
                  {SEC_ICONS[x]}
                  <span className="subj-tab-label">{t.study.subjectTabs[x]}</span>
                  {tabCount(x) > 0 && <span className="subj-tab-n mono">{tabCount(x)}</span>}
                </button>
              ))}
            </nav>

            <div className="subj-sections">
              {section("overview", "", null, <Overview {...props} due={due} />)}
              {section(
                "cards",
                cards ? t.study.cards(cards) : "",
                <button className="btn ghost" onClick={props.onAddCard}>
                  <Plus size={16} /> <span className="hide-narrow">{t.study.addCard}</span>
                </button>,
                <Cards {...props} due={due} cards={cards} />,
              )}
              {section(
                "notes",
                notes ? t.study.notesCount(notes) : "",
                <button className="btn ghost" onClick={props.onNewNote}>
                  <Plus size={16} /> <span className="hide-narrow">{t.study.newNote}</span>
                </button>,
                <Notes {...props} />,
              )}
              {section(
                "materials",
                "",
                <button className="btn ghost" onClick={props.onAddMaterial}>
                  <Plus size={16} /> <span className="hide-narrow">{t.study.addMaterial}</span>
                </button>,
                <Materials {...props} />,
              )}
              {section(
                "workbench",
                active2 ? t.study.projectsActive(active2) : "",
                <button className="btn ghost" onClick={props.onNewProject}>
                  <Plus size={16} /> <span className="hide-narrow">{t.study.newProject}</span>
                </button>,
                <WorkbenchBox subject={s} onOpen={props.onProject} onNew={props.onNewProject} head={false} />,
              )}
            </div>
          </div>
        )}
      </div>
      {settings && f.note && <Settings {...props} cover={ownCover || props.cover} f={f} onClose={() => setSettings(false)} />}
      {f.dialog}
    </div>
  );
}

// ---- A subject that only holds others ----

/**
 * Is the subject a Hub (Java with JDBC, Collections…)? Its `kind` says so when chosen. One made before
 * there was a choice is a Hub when it has sub-subjects and nothing of its own.
 */
export function isHub(all: Subject[], s: Subject): boolean {
  if (s.kind) return s.kind === "hub";
  const own = s.notes.length + s.materials.length + s.pdfs.length + s.links.length + s.workbench.length + s.exercises.docs.length + s.exercises.pdfs.length;
  return !own && all.some(x => !isSchool(x) && x.parent === s.slug);
}

/** A Hub's page: what to do today in any of its subjects, then the subjects inside. */
function Hub(props: Props) {
  const s = props.subject;
  const family = props.all.filter(x => descendantsOf(props.all, s.slug).has(x.slug) && !isSchool(x));
  return (
    <div className="subj-inner stack subj-hub">
      <TodayPicks picks={todayPicks(family)} onPick={props.onPick} showSubject />
      <Kids {...props} />
      {s.notes.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="subj-h">{t.study.hubOwnNotes}</h2>
          <ul className="subj-notes" aria-label={t.study.hubOwnNotes}>
            {s.notes.map(n => (
              <li key={n.path}>
                <NoteCard s={s} n={n} onOpen={props.onNote} onMenu={props.onNoteMenu} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">{t.study.hubHint}</p>
    </div>
  );
}

type KidsSort = "title" | "recent" | "notes";
const KIDS_SORTS: KidsSort[] = ["title", "recent", "notes"];
type KidsOnly = "all" | "going" | "review" | "empty" | "hubs";

const foldText = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The sub-subjects of a subject, as cards. With more than one: a quick search (their names, the
 * subjects inside them and their notes' titles), filters (in progress, to review, still empty,
 * hubs; each shown only when it would keep some) and an order, remembered on this device.
 */
function Kids(props: Props) {
  const s = props.subject;
  const kids = props.all.filter(x => !isSchool(x) && x.parent === s.slug);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<KidsOnly>("all");
  const [sort, setSort] = usePref<KidsSort>("studium.study.kidsSort", "title");
  const familyOf = (k: Subject) => props.all.filter(x => !isSchool(x) && descendantsOf(props.all, k.slug).has(x.slug));
  const test: Record<KidsOnly, (k: Subject) => boolean> = {
    all: () => true,
    going: k => stoppedAt(k) !== null,
    review: k => dueCards(familyOf(k)).length > 0,
    empty: k => familyOf(k).every(x => !x.notes.length && !x.materials.length && !x.pdfs.length),
    hubs: k => isHub(props.all, k),
  };
  const filters = (["going", "review", "empty", "hubs"] as KidsOnly[]).filter(x => kids.some(test[x]) && !kids.every(test[x]));
  const live = only === "all" || filters.includes(only) ? only : "all";
  const words = foldText(query).split(/\s+/).filter(Boolean);
  // What a search found inside a card (a subject or a note in it), to say why the card is there.
  const found = (k: Subject): string | null => {
    if (!words.length) return "";
    const has = (x: string) => words.every(w => foldText(x).includes(w));
    if (has(k.title)) return "";
    for (const x of familyOf(k)) {
      if (x !== k && has(x.title)) return x.title;
      const n = x.notes.find(n => has(n.title));
      if (n) return n.title;
    }
    return null;
  };
  const notesIn = (k: Subject) => familyOf(k).reduce((sum, x) => sum + x.notes.length, 0);
  const cmp: Record<KidsSort, (a: Subject, b: Subject) => number> = {
    title: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
    recent: (a, b) => b.modified.localeCompare(a.modified),
    notes: (a, b) => notesIn(b) - notesIn(a),
  };
  const shown = kids
    .filter(test[live])
    .map(k => ({ k, why: found(k) }))
    .filter(x => x.why !== null)
    .sort((a, b) => cmp[KIDS_SORTS.includes(sort) ? sort : "title"](a.k, b.k) || cmp.title(a.k, b.k));
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
        <h2 className="subj-h" style={{ flex: 1 }}>
          {t.study.subSubjects}
        </h2>
        <button className="btn ghost" onClick={props.onNewChild}>
          <FolderPlus size={16} /> <span className="hide-narrow">{t.explorer.newSubjectInside}</span>
        </button>
      </div>
      {kids.length > 1 && (
        <div className="subj-toolbar kids-toolbar">
          <div className="note-filter subj-search">
            <Search size={16} className="muted" />
            <input className="field" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.study.kidsFilter} aria-label={t.study.kidsFilter} />
          </div>
          <select className="field note-sort" value={sort} aria-label={t.study.sortBy} title={t.study.sortBy} onChange={e => setSort(e.target.value as KidsSort)}>
            {KIDS_SORTS.map(x => (
              <option key={x} value={x}>
                {t.study.kidsSorts[x]}
              </option>
            ))}
          </select>
        </div>
      )}
      {filters.length > 0 && (
        <div className="chips" role="tablist" aria-label={t.study.show}>
          {(["all", ...filters] as KidsOnly[]).map(x => (
            <button
              key={x}
              role="tab"
              aria-selected={live === x}
              className={`chip${live === x ? " active" : ""}`}
              title={t.study.kidsOnlyHints[x]}
              onClick={() => setOnly(live === x ? "all" : x)}
            >
              <span className="chip-label">{t.study.kidsOnly[x]}</span> {x !== "all" && <span className="muted mono small">{kids.filter(test[x]).length}</span>}
            </button>
          ))}
        </div>
      )}
      {kids.length > 0 && shown.length === 0 ? (
        <p className="muted small">{t.study.kidsNone}</p>
      ) : (
        <div className={`subj-kids${isHub(props.all, s) ? " hub-kids" : ""}`}>
          {shown.map(({ k, why }) => (
            <KidCard key={k.path} k={k} all={props.all} why={why || undefined} onOpen={props.onSubject} onMenu={props.onSubjectMenu} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A sub-subject: where it stopped and what is inside; right-click or hold for its menu. */
function KidCard(props: { k: Subject; all: Subject[]; why?: string; onOpen(s: Subject): void; onMenu(s: Subject, at: { x: number; y: number }): void }) {
  const { k } = props;
  const hold = useHold((_, at) => props.onMenu(k, at));
  const at = stoppedAt(k);
  const inner = props.all.filter(x => !isSchool(x) && x.parent === k.slug).length;
  const cover = useImage(k.cover, k.coverFrame);
  return (
    <button className="subj-kid" {...hold.handlers} onClick={() => !hold.eaten() && props.onOpen(k)}>
      {cover && <Cover url={cover} name={k.title} className="subj-kid-pic" />}
      <span className="list-title">
        {isHub(props.all, k) && <span className="note-tag hub">{t.study.subjectKinds.hub}</span>}
        {k.title}
      </span>
      {props.why && <span className="list-meta kid-why">{t.study.kidsMatched(props.why)}</span>}
      {at && <span className="list-meta">{t.study.stoppedAt(at)}</span>}
      <span className="list-meta">
        {[inner ? t.study.subjectsCount(inner) : "", k.notes.length ? t.study.notesCount(k.notes.length) : "", k.materials.length ? t.study.materialsCount(k.materials.length) : ""]
          .filter(Boolean)
          .join(" · ") || relativeDay(k.modified)}
      </span>
    </button>
  );
}

// ---- Sections ----

type TabProps = Props & { due?: number; cards?: number };

function Overview(props: TabProps) {
  const s = props.subject;
  const family = props.all.filter(x => descendantsOf(props.all, s.slug).has(x.slug) && !isSchool(x));
  const points = pointsOf(family).length;
  const kids = props.all.filter(x => !isSchool(x) && x.parent === s.slug);
  const empty = !s.materials.length && !s.notes.length && !s.pdfs.length && !s.links.length;
  return (
    <>
      <TodayPicks picks={todayPicks([s])} onPick={props.onPick} />
      {props.due ? (
        <button className="subj-review-quiet" onClick={props.onReview}>
          <Layers size={16} />
          <span>{t.study.reviewWhenever(props.due)}</span>
          <ChevronRight size={16} className="muted" />
        </button>
      ) : null}
      <NotebookBox subject={s} all={props.all} onNote={props.onNote} onNewNote={props.onNewTitled} onMenu={props.onNoteMenu} />
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
      {points > 0 && (
        <button className="subj-panel subj-points" onClick={props.onPoints}>
          <span className="subj-panel-icon">
            <TriangleAlert size={18} />
          </span>
          <span className="stack" style={{ gap: 4, flex: 1 }}>
            <span className="subj-kicker">{t.recall.pointsTitle}</span>
            <span className="small">{t.recall.pointsPanel}</span>
          </span>
          <ChevronRight size={20} className="muted" />
        </button>
      )}
      {kids.length > 0 && <Kids {...props} />}
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
  const notebook = s.notes.filter(isNotebookNote).length;
  const withCards = s.notes.filter(n => n.cards.length > 0).length;
  // Material chips only help when the notes are spread over more than one place.
  const byPlace = noteMaterials.length + (free > 0 ? 1 : 0) + (notebook > 0 ? 1 : 0) > 1;
  // A chip whose notes are gone stops filtering.
  const live =
    only === "" ||
    (only === "cards"
      ? withCards > 0
      : byPlace && (only === "free" ? free > 0 : only === "notebook" ? notebook > 0 : noteMaterials.some(x => x.key === only)));
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
      {s.notes.length > 1 && (
        <div className="subj-toolbar">
          <div className="note-filter subj-search">
            <Search size={16} className="muted" />
            <input className="field" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.study.filterNotes} aria-label={t.study.filterNotes} />
          </div>
        </div>
      )}
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
          {byPlace && notebook > 0 && chip("notebook", t.study.notesNotebook, notebook)}
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
              <NoteCard s={s} n={n} onOpen={props.onNote} onMenu={props.onNoteMenu} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A note as a card: its tag (notebook, material, PDF, free) as the top edge, title, a few lines, where from. */
function NoteCard(props: { s: Subject; n: StudyNote; onOpen(path: string): void; onMenu(n: StudyNote, at: { x: number; y: number }): void }) {
  const { s, n } = props;
  const hold = useHold((_, at) => props.onMenu(n, at));
  const m = n.material ? s.materials.find(x => x.name === n.material) : undefined;
  const ch = m && n.chapter !== null ? m.chapters.find(c => c.n === n.chapter) : undefined;
  const pdf = n.pdf ? s.pdfs.find(x => x.name === n.pdf) : undefined;
  const from = m ? [m.title, ch?.title].filter(Boolean).join(" › ") : n.pdf ? (pdf?.title ?? n.pdf.replace(/\.pdf$/i, "")) : "";
  const tag = n.material ? "material" : n.pdf ? "pdf" : isNotebookNote(n) ? "notebook" : "free";
  return (
    <button className={`subj-note ${tag}`} {...hold.handlers} onClick={() => !hold.eaten() && props.onOpen(n.path)}>
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

/** The references, one under the other: .md materials, PDFs, exercises, links. */
function Materials(props: TabProps) {
  const s = props.subject;
  const sub = (icon: React.ReactNode, label: string, n: number) => (
    <h3 className="subj-sub-title">
      {icon} {label}
      {n > 0 && <span className="subj-tab-n mono">{n}</span>}
    </h3>
  );
  return (
    <>
      <div className="subj-sub" data-box="md">
        <div className="subj-sub-head">{sub(<BookOpen size={15} />, t.study.mdMaterialsLong, s.materials.length)}</div>
        {s.materials.length === 0 ? (
          <p className="muted small">{t.study.noMaterials}</p>
        ) : (
          <ul className="subj-materials">
            {s.materials.map(m => (
              <li key={m.path}>
                <MaterialCard m={m} onOpen={props.onMaterial} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="subj-sub" data-box="pdf">
        <PdfBox subject={s} onNote={props.onPdfNote} heading={sub(<FileText size={15} />, t.study.pdfs, s.pdfs.length)} />
      </div>
      <div className="subj-sub" data-box="exercises">
        <ExercisesBox
          subject={s}
          onOpen={props.onExercise}
          onNew={props.onNewExercise}
          heading={sub(<NotebookPen size={15} />, t.study.exercises, s.exercises.docs.length + s.exercises.pdfs.length)}
        />
      </div>
      <div className="subj-sub" data-box="links">
        <LinksBox dir={s.dir} links={s.links} heading={sub(<Link2 size={15} />, t.study.links, s.links.length)} />
      </div>
    </>
  );
}

/** A .md material: a tap opens it; right-click (PC) or hold (phone) shows what else can be done. */
function MaterialCard(props: { m: Material; onOpen(path: string, chapter?: number | null): void }) {
  const { m } = props;
  const { notes, bump, toast, confirmDelete } = useApp();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const hold = useHold((_, at) => setMenu(at));
  const mp = progress(m);
  const pct = mp.total ? Math.round((mp.read / mp.total) * 100) : 0;
  const at = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const patch = (data: Parameters<typeof notes.patchHeader>[1]) =>
    flushAll()
      .then(() => notes.patchHeader(m.path, data))
      .then(bump, fail);
  const remove = async () => {
    if (!(await confirmDelete(m.title))) return;
    try {
      await flushAll();
      const trashed = await moveToTrash(notes.storage, m.path);
      bump();
      toast({ text: t.study.materialDeleted, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, m.path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };
  const items: MenuItem[] = [
    { icon: <BookOpen size={18} />, label: t.common.open, run: () => props.onOpen(m.path) },
    ...(at && pct < 100 ? [{ icon: <ChevronRight size={18} />, label: t.study.continueAt(at.title || t.study.chapter(at.n)), run: () => props.onOpen(m.path, at.n) }] : []),
    ...(mp.total > 0
      ? mp.read < mp.total
        ? [{ icon: <CircleCheck size={18} />, label: t.study.markAllRead, run: () => void patch({ done: m.chapters.map(c => c.n) }) }]
        : [{ icon: <Circle size={18} />, label: t.study.markAllUnread, run: () => void patch({ done: undefined, at: undefined }) }]
      : []),
    { icon: <Pencil size={18} />, label: t.study.renameMaterial, run: () => setRenaming(true) },
    { icon: <Trash2 size={18} />, label: t.study.deleteMaterial, run: () => void remove(), danger: true },
  ];
  return (
    <>
      <button className={`subj-material k-${m.kind}${menu ? " held" : ""}`} {...hold.handlers} onClick={() => !hold.eaten() && props.onOpen(m.path)}>
        <span className="subj-material-icon">{KIND_ICONS[m.kind]}</span>
        <span className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <span className="list-title">{m.title}</span>
          <span className="list-meta">{[t.study.kinds[m.kind], m.source].filter(Boolean).join(" · ")}</span>
          {at && pct < 100 ? (
            <span className="list-meta">{t.study.stoppedAt(at.title || t.study.chapter(at.n))}</span>
          ) : mp.total > 0 && pct === 100 ? (
            <span className="list-meta">{t.study.allRead}</span>
          ) : null}
        </span>
      </button>
      {menu && <ContextMenu at={menu} label={m.title} items={items} onClose={() => setMenu(null)} />}
      {renaming && (
        <AskText
          title={t.study.renameMaterial}
          initial={m.title}
          placeholder={t.study.materialName}
          okLabel={t.common.save}
          onOk={v => {
            setRenaming(false);
            if (v.trim() && v.trim() !== m.title) void patch({ title: v.trim() });
          }}
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}

/** The cover, the type, the parent, the group and delete: set once, so out of the way behind the gear. */
function Settings(props: Props & { f: NoteFile; onClose(): void }) {
  const { subject: s, f } = props;
  const d = f.data();
  const [group, setGroup] = useState(s.group);
  const [kind, setKind] = useState<"hub" | "study">(isHub(props.all, s) ? "hub" : "study");
  const [sure, setSure] = useState(false);
  // The type is chosen once: a subject made before the choice existed picks it here, then it stays.
  const fixed: SubjectKind = d.kind === "hub" || d.kind === "study" ? d.kind : "";
  const blocked = descendantsOf(props.all, s.slug);
  const parents = props.all.filter(x => !isSchool(x) && !blocked.has(x.slug)).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Dialog title={t.study.subjectSettings} onClose={props.onClose}>
      <SubjectCover s={s} cover={props.cover} onFrame={fr => f.setData({ cover_frame: frameText(fr) || undefined })} />
      <span className="fl">{t.study.kindLabel}</span>
      {fixed ? (
        <div className="kind-fixed">
          <span className="kind-opt-icon">{fixed === "hub" ? <LayoutDashboard size={18} /> : <NotebookPen size={18} />}</span>
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="list-title">{t.study.subjectKinds[fixed]}</span>
            <span className="list-meta">{t.study.kindFixed(fixed)}</span>
          </span>
        </div>
      ) : (
        <div className="kind-choose stack">
          <span className="row kind-choose-head">
            <TriangleAlert size={16} /> {t.study.kindOnceTitle}
          </span>
          <p className="muted small" style={{ margin: 0 }}>
            {t.study.kindOnce}
          </p>
          <KindPicker value={kind} onChange={setKind} />
          <button className="btn primary" onClick={() => setSure(true)}>
            <Lock size={16} /> {t.study.kindConfirm(t.study.subjectKinds[kind])}
          </button>
        </div>
      )}
      {sure && (
        <Confirm
          title={t.study.kindSureTitle(t.study.subjectKinds[kind])}
          text={t.study.kindSureText(kind)}
          okLabel={t.study.kindSureOk(t.study.subjectKinds[kind])}
          danger
          onOk={() => {
            setSure(false);
            f.setData({ kind });
          }}
          onClose={() => setSure(false)}
        />
      )}
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

/** The subject's own cover: a picture over its group's, picked, changed or removed here. */
function SubjectCover(props: { s: Subject; cover?: string; onFrame(f: CoverFrame | null): void }) {
  const { notes, bump, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const own = useImage(props.s.cover, props.s.coverFrame);
  // Open right after a new picture is picked, so it can be framed at once.
  const [adjust, setAdjust] = useState(false);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    try {
      const c = await coverData(file);
      await setSubjectCover(notes.storage, props.s.dir, c.ext, c.data);
      props.onFrame(null);
      bump();
      setAdjust(true);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="fl">{t.study.coverLabel}</span>
      <Cover url={own || props.cover} name={props.s.group || props.s.title} className="subj-cover-pic" />
      {!props.s.cover && <span className="list-meta">{t.study.subjectCoverHint}</span>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input ref={input} type="file" accept="image/*" hidden onChange={e => pick(e.target.files)} />
        <button className="btn ghost" onClick={() => input.current?.click()}>
          <ImagePlus size={16} /> {props.s.cover ? t.study.changeCover : t.study.addCover}
        </button>
        {props.s.cover && (
          <>
            <button className="btn ghost" onClick={() => setAdjust(true)}>
              <Crop size={16} /> {t.study.adjustCover}
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                removeSubjectCover(notes.storage, props.s.dir).then(() => {
                  props.onFrame(null);
                  bump();
                }, fail)
              }
            >
              <ImageMinus size={16} /> {t.study.removeCover}
            </button>
          </>
        )}
      </div>
      {adjust && own && (
        <CoverAdjust
          url={own}
          banner=".subj-hero"
          card={16 / 6}
          onClose={() => setAdjust(false)}
          onSave={f => {
            setAdjust(false);
            props.onFrame(f);
          }}
        />
      )}
    </div>
  );
}

/** Hub or study folder: two choices, each saying what it gives. */
export function KindPicker(props: { value: SubjectKind; onChange(k: "hub" | "study"): void }) {
  return (
    <div className="kind-pick" role="radiogroup" aria-label={t.study.kindLabel}>
      {(["study", "hub"] as const).map(k => (
        <button key={k} role="radio" aria-checked={props.value === k} className={`kind-opt${props.value === k ? " on" : ""}`} onClick={() => props.onChange(k)}>
          <span className="kind-opt-icon">{k === "hub" ? <LayoutDashboard size={18} /> : <NotebookPen size={18} />}</span>
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="list-title">{t.study.subjectKinds[k]}</span>
            <span className="list-meta">{t.study.kindHints[k]}</span>
          </span>
        </button>
      ))}
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
