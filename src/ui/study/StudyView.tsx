import { useCallback, useContext, useEffect, useState } from "react";
import { BookOpen, FolderInput, Home, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { parseCards } from "../../data/cards";
import { isoDate } from "../../data/dates";
import { flushAll } from "../../data/pending";
import { COURSES_DIR, createAssignment, createCourse, createExam, loadCourses, type Course } from "../../data/school";
import {
  appendCards,
  backlinks,
  createMaterial,
  createProject,
  createStudyNote,
  createExercise,
  LINKS_FILE,
  isExercisePath,
  createSubject,
  allGroups,
  dueCards,
  isLinksPath,
  isMaterialPath,
  isPdfPath,
  isSchool,
  isStudyNotePath,
  isSubjectPath,
  isWorkbenchPath,
  linkTargets,
  loadSubjects,
  resolveLink,
  subjectDirOf,
  coverOf,
  workbenchProjectOf,
  type NewCard,
  type Subject,
} from "../../data/study";
import { guideBody, guideOf, type GuideId } from "../../data/guides";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { Dialog } from "../Dialog";
import { NoteEditor } from "../NoteEditor";
import { useApp } from "../context";
import { LinksCtx } from "../links";
import type { WikiLinks } from "../../editor/wikiLinks";
import { useHold } from "../useHold";
import { CourseBar, PersonalHome, SchoolHome, scheduleMeta, schoolMeta, usePersonalView } from "./Homes";
import { useCovers } from "./Covers";
import { AddCard } from "./AddCard";
import { CardReview, CardText } from "./CardReview";
import { MaterialReader } from "./MaterialReader";
import { NewMaterial } from "./NewMaterial";
import { SCHOOL_TABS, SchoolSubject, type SchoolTab } from "./SchoolSubject";
import { CoursePage, NewCourse, NewDated, Timetable } from "./School";
import { groupOf, SubjectPage, type MaterialBox, type SubjectTab } from "./SubjectPage";
import { SubjectTree } from "./SubjectTree";
import { AssignmentPage, ExamPage } from "./WorkPages";
import { NewProject, WorkbenchPage } from "./Workbench";
import { GroupsDialog, MoveToGroup, useSavedGroups } from "./Groups";
import { usePref } from "./prefs";
import { dateLabel } from "./school-ui";
import { t, word } from "../../i18n";

// Study (data/study, data/school), two areas of the app with this same screen:
//   Personal  subjects as a tree (groups, sub-subjects, their materials and notes), Obsidian-like
//   School    courses → semesters → subjects with tabs (classes, handouts, assignments, exams…)
// With nothing open it shows the area's home (ui/study/Homes). Once something is open, in
// Personal it takes the whole width (the tree beside it only in the list view); in School the
// semester's subjects stay on the left. The open thing is a subject, material, note, assignment,
// exam, course or timetable (one at a time on the phone; back goes up one level, from a personal
// subject to its group's page, and from the top back home).

/** Subjects with their materials and notes, reloaded whenever data on disk changes. */
export function useStudy(): Subject[] {
  const { notes, version, toast } = useApp();
  const [list, setList] = useState<Subject[]>([]);
  useEffect(() => {
    let alive = true;
    loadSubjects(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(l => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return list;
}

export function useCourses(): Course[] {
  const { notes, version } = useApp();
  const [list, setList] = useState<Course[]>([]);
  useEffect(() => {
    let alive = true;
    loadCourses(notes).then(l => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [notes, version]);
  return list;
}

/** What the detail pane shows. */
type Pane =
  | { kind: "subject"; path: string; tab?: Tab; box?: MaterialBox }
  | { kind: "summary"; path: string }
  | { kind: "material"; path: string; chapter?: number | null }
  | { kind: "note"; path: string; isNew?: boolean }
  | { kind: "assignment"; path: string }
  | { kind: "exam"; path: string }
  | { kind: "project"; path: string }
  | { kind: "exercise"; path: string; isNew?: boolean }
  | { kind: "review"; only?: string; section?: Section }
  | { kind: "course"; path: string }
  | { kind: "timetable" };

export type Section = "personal" | "school";

/** A tab of a subject's page: school (SchoolSubject) or personal (SubjectPage), and old names. */
type Tab = SchoolTab | SubjectTab | "pdf" | "exercises";

/** The personal tab and materials list a pane's tab names. */
function personalTab(tab: Tab | undefined, box: MaterialBox | undefined): [SubjectTab, MaterialBox] {
  if (tab === "pdf" || tab === "exercises" || tab === "links") return ["materials", tab];
  if (tab === "handouts" || tab === "materials") return ["materials", box ?? "md"];
  if (tab === "classes") return ["notes", "md"];
  if (tab === "cards" || tab === "notes" || tab === "workbench") return [tab, box ?? "md"];
  return ["overview", box ?? "md"];
}

export interface StudyRequest {
  path?: string;
  chapter?: number;
  review?: boolean;
  key: number;
}

const subjectPathOf = (path: string) => `${subjectDirOf(path)}/subject.md`;
const isAssignmentPath = (p: string) => /^study\/[^/]+\/assignments\/[^/]+\//.test(p);
const isExamPath = (p: string) => /^study\/[^/]+\/exams\/[^/]+\.md$/.test(p);

function NewSubject(props: { personal: Subject[]; groups: string[]; group?: string; school: boolean; onOk(title: string, group: string, parent: string): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState(props.group ?? "");
  const [parent, setParent] = useState("");
  const ok = () => title.trim() && props.onOk(title, group, parent);
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && ok();
  return (
    <Dialog title={props.school ? t.school.newSubject : t.study.newSubject} onClose={props.onClose}>
      <input
        className="field"
        autoFocus
        value={title}
        placeholder={props.school ? t.school.subjectName : t.study.subjectName}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={enter}
      />
      {!props.school && (
        <>
          <select className="field" value={parent} aria-label={t.study.fParent} onChange={e => setParent(e.target.value)}>
            <option value="">{t.study.parentNone}</option>
            {[...props.personal]
              .sort((a, b) => a.title.localeCompare(b.title))
              .map(s => (
                <option key={s.slug} value={s.slug}>
                  {t.study.insideOf(s.title)}
                </option>
              ))}
          </select>
          {!parent && (
            <>
              <input className="field" list="new-study-groups" value={group} placeholder={t.study.groupOptional} onChange={e => setGroup(e.target.value)} onKeyDown={enter} />
              <datalist id="new-study-groups">
                {props.groups.map(g => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
        </>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={!title.trim()} onClick={ok}>
          {t.common.ok}
        </button>
      </div>
    </Dialog>
  );
}

/** How flashcards are written, and the cards of the open note. */
function CardsHelp(props: { body: string; onClose(): void }) {
  const cards = parseCards(props.body);
  const x = t.study.cardsHelpEx;
  return (
    <Dialog title={t.study.cardsHelp} onClose={props.onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {t.study.cardsHelpText}
      </p>
      <table className="md-table cards-help">
        <tbody>
          <tr>
            <td className="mono">{`${x.q} :: ${x.a}`}</td>
            <td>{t.study.cardsHelpOne}</td>
          </tr>
          <tr>
            <td className="mono">{`${x.front} ::: ${x.back}`}</td>
            <td>{t.study.cardsHelpBoth}</td>
          </tr>
          <tr>
            <td className="mono">{`${x.q}\n?\n${x.a}`}</td>
            <td>{t.study.cardsHelpMulti}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small" style={{ margin: 0 }}>
        {t.study.cardsHelpCode}
      </p>
      <p className="muted small" style={{ margin: 0 }}>
        {t.study.linksHelp}
      </p>
      <h3>{t.study.cardsInNote(cards.length)}</h3>
      {cards.length > 0 && (
        <ol className="cards-list">
          {cards.map(c => (
            <li key={c.id}>
              <CardText text={c.front} />
              <span className="muted">
                <CardText text={c.back} />
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.close}
        </button>
      </div>
    </Dialog>
  );
}

/** The section a study path belongs to (School: courses and school subjects). */
export function sectionOf(subjects: Subject[], path: string): Section {
  if (path.startsWith(`${COURSES_DIR}/`)) return "school";
  const s = subjects.find(x => x.path === subjectPathOf(path.replace(/^summary:/, "")));
  return s && isSchool(s) ? "school" : "personal";
}

function SchoolRow(props: { s: Subject; course?: Course; active: boolean; onOpen(): void; onMenu(): void }) {
  const { s } = props;
  const hold = useHold(props.onMenu);
  const meta = schoolMeta(s);
  return (
    <li {...hold.handlers}>
      <button className={`list-item${props.active ? " active" : ""}`} onClick={() => !hold.eaten() && props.onOpen()}>
        <span className="list-title">
          {s.title}
          {s.result !== "taking" && <span className={`result-tag ${s.result}`}>{t.school.results[s.result]}</span>}
        </span>
        <span className="list-meta">{scheduleMeta(s)}</span>
        {meta && <span className="list-meta">{meta}</span>}
      </button>
    </li>
  );
}

export function StudyView(props: {
  section: Section;
  subjects: Subject[];
  request?: StudyRequest;
  /** Opens a path of the other section (a [[link]] to it), in its own area. */
  onElsewhere(path: string): void;
}) {
  const { notes, bump, toast, confirmDelete } = useApp();
  const appLinks = useContext(LinksCtx);
  const { subjects } = props;
  const courses = useCourses();
  const { section } = props;
  const [courseId, setCourseId] = usePref<string>("studium.study.course", "");
  const [semesterPick, setSemesterPick] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane | null>(null);
  const [adding, setAdding] = useState<"subject" | "course" | null>(null);
  /** The group a new personal subject goes in (made from a group's page). */
  const [addGroup, setAddGroup] = useState("");
  const [addingMaterial, setAddingMaterial] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState<string | null>(null);
  const [dated, setDated] = useState<{ kind: "assignment" | "exam"; dir: string } | null>(null);
  const [menu, setMenu] = useState<Subject | null>(null);
  const [moving, setMoving] = useState<Subject | null>(null);
  const [managing, setManaging] = useState(false);
  const savedGroups = useSavedGroups();
  const [view] = usePersonalView();
  /** The group page open on the Personal home; it stays while a subject is open, for back. */
  const [homeGroup, setHomeGroup] = useState<string | null>(null);
  const covers = useCovers();
  const [help, setHelp] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }), [toast]);
  const personal = subjects.filter(s => !isSchool(s));
  const groups = allGroups(savedGroups, personal);
  const course = courses.find(c => c.id === courseId) ?? courses[0];
  const semester = semesterPick && course && semesterPick <= course.semesters ? semesterPick : (course?.current ?? 1);
  const subjectOf = (path: string) => subjects.find(s => s.path === subjectPathOf(path));

  useEffect(() => {
    const r = props.request;
    if (!r) return;
    if (r.review) setPane({ kind: "review" });
    else if (!r.path) setPane(null);
    else open(r.path, r.chapter);
    // Only when a new request comes in.
  }, [props.request]);

  /** Opens any study path in the detail pane, switching section when needed. */
  function open(path: string, chapter?: number) {
    if (sectionOf(subjects, path) !== section) return props.onElsewhere(path);
    if (path.startsWith("summary:")) return setPane({ kind: "summary", path: path.slice(8) });
    if (path.startsWith(`${COURSES_DIR}/`)) {
      setCourseId(path.slice(COURSES_DIR.length + 1, -3));
      return setPane({ kind: "course", path });
    }
    const s = subjects.find(x => x.path === subjectPathOf(path));
    if (s && isSchool(s)) {
      setCourseId(s.course);
      if (s.semester) setSemesterPick(s.semester);
    }
    if (isSubjectPath(path)) setPane({ kind: "subject", path });
    else if (isExercisePath(path))
      setPane(path.endsWith(".md") && !path.endsWith(`/${LINKS_FILE}`) ? { kind: "exercise", path } : { kind: "subject", path: subjectPathOf(path), tab: "exercises" });
    else if (isLinksPath(path)) setPane({ kind: "subject", path: subjectPathOf(path), tab: "links" });
    else if (isPdfPath(path)) setPane({ kind: "subject", path: subjectPathOf(path), tab: "pdf" });
    else if (isWorkbenchPath(path)) setPane({ kind: "project", path: workbenchProjectOf(path) });
    else if (isMaterialPath(path)) setPane({ kind: "material", path, chapter: chapter ?? null });
    else if (isStudyNotePath(path)) setPane({ kind: "note", path });
    else if (isExamPath(path)) setPane({ kind: "exam", path });
    else if (isAssignmentPath(path)) setPane({ kind: "assignment", path: `${path.split("/").slice(0, 4).join("/")}/assignment.md` });
  }

  /** The school tab an item lives in, to come back to it. */
  const tabOf = (p: Pane): Tab | undefined => {
    if (p.kind === "exercise") return "exercises";
    if (p.kind === "project") return "workbench";
    if (p.kind === "note" && !subjectOf(p.path)?.course) return "notes";
    if (p.kind === "material") return "handouts";
    if (p.kind === "assignment") return "work";
    if (p.kind === "exam") return "exams";
    if (p.kind === "note") {
      const n = subjectOf(p.path)?.notes.find(x => x.path === p.path);
      return n?.kind === "class" ? "classes" : n?.kind === "cards" ? "cards" : n?.material ? "handouts" : n?.pdf ? "pdf" : "classes";
    }
    return undefined;
  };

  const up = () => {
    if (!pane) return;
    if (pane.kind === "subject") {
      // Up from a personal subject is its group's page.
      const s = subjects.find(x => x.path === pane.path);
      if (s && !isSchool(s)) setHomeGroup(groupOf(subjects, s));
      setPane(null);
    } else if (pane.kind === "course" || pane.kind === "timetable") setPane(null);
    else if (pane.kind === "review") setPane(pane.only ? { kind: "subject", path: pane.only, tab: "cards" } : null);
    else setPane({ kind: "subject", path: subjectPathOf(pane.path), tab: tabOf(pane) });
  };

  const run = async (f: () => Promise<void>) => {
    try {
      await flushAll();
      await f();
    } catch (e) {
      fail(e);
    }
  };

  const createSub = (title: string, group: string, parent: string) =>
    run(async () => {
      setAdding(null);
      const school = section === "school" && course;
      const n = await createSubject(notes, school ? { title, course: course.id, semester } : { title, group: parent ? undefined : group, parent });
      bump();
      setPane({ kind: "subject", path: n.path, tab: "overview" });
    });

  const moveToGroup = (s: Subject, group: string) =>
    run(async () => {
      setMoving(null);
      await notes.patchHeader(s.path, { group: group || undefined });
      bump();
    });

  const addCourse = (f: { title: string; institution: string; semesters: number }) =>
    run(async () => {
      setAdding(null);
      const n = await createCourse(notes, f);
      setCourseId(n.path.slice(n.path.lastIndexOf("/") + 1, -3));
      bump();
      setPane({ kind: "course", path: n.path });
    });

  /** Moves a file or a folder to the trash, with Undo. */
  const trash = async (path: string, text: string, after: Pane | null, what?: string) =>
    (await confirmDelete(what)) &&
    run(async () => {
      setPane(after);
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({ text, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    });

  const newNote = (dir: string, about?: Parameters<typeof createStudyNote>[2]) =>
    run(async () => {
      const n = await createStudyNote(notes, dir, about);
      bump();
      setPane({ kind: "note", path: n.path, isNew: true });
    });

  const newExercise = (dir: string, title: string) =>
    run(async () => {
      const n = await createExercise(notes, dir, title);
      bump();
      setPane({ kind: "exercise", path: n.path, isNew: true });
    });

  const newClass = (dir: string) => {
    const today = isoDate();
    return newNote(dir, { kind: "class", date: today, title: t.school.classOf(dateLabel(today)) });
  };

  const addMaterial = (dir: string, f: Parameters<typeof createMaterial>[2]) =>
    run(async () => {
      setAddingMaterial(null);
      const n = await createMaterial(notes, dir, f);
      bump();
      setPane({ kind: "material", path: n.path, chapter: null });
    });

  const addProject = (dir: string, title: string, description: string, guide: GuideId | "") =>
    run(async () => {
      setAddingProject(null);
      const n = await createProject(notes, dir, { title, description }, guide ? guideBody(guideOf(guide), word) : "");
      bump();
      setPane({ kind: "project", path: n.path });
    });

  /** A PDF keeps one note, like a chapter: open the one already written instead of starting another. */
  const pdfNote = (s: Subject, pdf: string) => {
    const had = s.notes.find(x => x.kind !== "cards" && x.pdf === pdf);
    if (had) setPane({ kind: "note", path: had.path });
    else void newNote(s.dir, { pdf, title: pdf.replace(/\.pdf$/i, "") });
  };

  const addCards = (dir: string, cards: NewCard[], from?: { material: string; title: string }) =>
    run(async () => {
      setAddingCard(null);
      if (!cards.length) return;
      await appendCards(notes, dir, cards, from);
      bump();
      toast({ text: t.study.cardsAdded(cards.length) });
    });

  const addDated = (title: string, date: string) =>
    run(async () => {
      const d = dated!;
      setDated(null);
      const n = d.kind === "assignment" ? await createAssignment(notes, d.dir, { title, due: date }) : await createExam(notes, d.dir, { title, date });
      bump();
      setPane({ kind: d.kind, path: n.path });
    });

  // ---- [[Links]] in study notes ----
  // Study names first; then the app-wide link names.
  const links = (fromDir: string): WikiLinks => ({
    names: () => [...linkTargets(subjects, fromDir).map(x => x.title), ...(appLinks?.names() ?? [])],
    open: (name: string) => {
      const hit = resolveLink(subjects, name, fromDir);
      if (hit) return void flushAll().then(() => open(hit.path));
      if (appLinks?.names().some(n => n.toLowerCase() === name.trim().toLowerCase())) return appLinks.open(name);
      // Like Obsidian: a link to nothing yet makes that note.
      void newNote(fromDir, { title: name });
    },
    read: async (name: string) => {
      const hit = resolveLink(subjects, name, fromDir);
      if (!hit) return (await appLinks?.read?.(name)) ?? null;
      try {
        return (await notes.load(hit.path)).body;
      } catch {
        return null;
      }
    },
  });

  let detail: React.ReactNode = <div className="detail-empty muted">{section === "school" ? t.school.pick : t.study.pick}</div>;
  if (pane?.kind === "subject") {
    const s = subjects.find(x => x.path === pane.path);
    const common = s && {
      key: s.path,
      subject: s,
      onBack: up,
      onMaterial: (path: string) => setPane({ kind: "material", path, chapter: null }),
      onAddMaterial: () => setAddingMaterial(s.dir),
      onNote: (path: string) => setPane({ kind: "note", path }),
      onReview: () => setPane({ kind: "review", only: s.path }),
      onAddCard: () => setAddingCard(s.dir),
      onDelete: () => trash(s.dir, t.study.subjectDeleted, null, s.title),
    };
    if (s && common && isSchool(s))
      detail = (
        <SchoolSubject
          {...common}
          course={courses.find(c => c.id === s.course)}
          tab={SCHOOL_TABS.includes(pane.tab as SchoolTab) ? (pane.tab as SchoolTab) : "overview"}
          onTab={tab => setPane({ ...pane, tab })}
          onSyllabus={() => setPane({ kind: "summary", path: s.path })}
          onNewClass={() => newClass(s.dir)}
          onAssignment={path => setPane({ kind: "assignment", path })}
          onNewAssignment={() => setDated({ kind: "assignment", dir: s.dir })}
          onExam={path => setPane({ kind: "exam", path })}
          onNewExam={() => setDated({ kind: "exam", dir: s.dir })}
        />
      );
    else if (s && common)
      detail = (
        <SubjectPage
          {...common}
          all={subjects}
          groups={groups}
          cover={coverOf(covers, groupOf(subjects, s))}
          tab={personalTab(pane.tab, pane.box)[0]}
          box={personalTab(pane.tab, pane.box)[1]}
          onTab={(tab, box) => setPane({ ...pane, tab, box: box ?? personalTab(pane.tab, pane.box)[1] })}
          onGroup={g => {
            setHomeGroup(g);
            setPane(null);
          }}
          onSubject={x => setPane({ kind: "subject", path: x.path })}
          onMaterial={(path, chapter) => setPane({ kind: "material", path, chapter: chapter ?? null })}
          onSummary={() => setPane({ kind: "summary", path: s.path })}
          onNewNote={() => newNote(s.dir)}
          onPdfNote={pdf => pdfNote(s, pdf)}
          onProject={path => setPane({ kind: "project", path })}
          onNewProject={() => setAddingProject(s.dir)}
          onExercise={path => setPane({ kind: "exercise", path })}
          onNewExercise={title => newExercise(s.dir, title)}
        />
      );
  } else if (pane?.kind === "summary") {
    const school = subjectOf(pane.path)?.course;
    detail = (
      <NoteEditor
        key={`summary:${pane.path}`}
        path={pane.path}
        placeholder={school ? t.school.syllabusPlaceholder : t.study.summaryPlaceholder}
        onBack={up}
        backOnWide
        links={links(subjectDirOf(pane.path))}
      />
    );
  } else if (pane?.kind === "material") {
    const p = pane.path;
    detail = (
      <MaterialReader
        key={p}
        path={p}
        chapter={pane.chapter}
        onBack={up}
        onNote={about => {
          // A chapter keeps one note: open the one already written instead of starting another.
          const had = subjectOf(p)?.notes.find(
            x => x.kind !== "cards" && x.material === about.material && x.chapter === about.chapter,
          );
          if (had) setPane({ kind: "note", path: had.path });
          else void newNote(subjectDirOf(p), about);
        }}
        onDelete={() => trash(p, t.study.materialDeleted, { kind: "subject", path: subjectPathOf(p), tab: "handouts" })}
      />
    );
  } else if (pane?.kind === "note") {
    const p = pane.path;
    const s = subjectOf(p);
    const n = s?.notes.find(x => x.path === p);
    const m = n?.material ? s?.materials.find(x => x.name === n.material) : undefined;
    const back = n?.title ? backlinks(subjects, n.title, p) : [];
    detail = (
      <NoteEditor
        key={p}
        path={p}
        placeholder={n?.kind === "class" ? t.school.classPlaceholder : t.study.notePlaceholder}
        onBack={up}
        backOnWide
        removeIfEmpty
        autoFocus={pane.isNew}
        links={links(subjectDirOf(p))}
        footer={
          back.length > 0 && (
            <div className="backlinks">
              <span className="muted small">{t.study.linkedFrom}</span>
              {back.map(b => (
                <button key={b.path} className="chip" onClick={() => setPane({ kind: "note", path: b.path })}>
                  {b.title}
                </button>
              ))}
            </div>
          )
        }
        actions={f => (
          <>
            {m && (
              <button
                className="btn ghost icon"
                title={t.study.from(m.title)}
                aria-label={t.study.from(m.title)}
                onClick={() => setPane({ kind: "material", path: m.path, chapter: n?.chapter ?? null })}
              >
                <BookOpen size={18} />
              </button>
            )}
            <button className="btn ghost icon" title={t.study.cardsHelp} aria-label={t.study.cardsHelp} onClick={() => setHelp(f.body())}>
              <Layers size={18} />
            </button>
            <button
              className="btn ghost icon"
              title={t.study.deleteNote}
              aria-label={t.study.deleteNote}
              onClick={() => trash(p, t.study.noteDeleted, { kind: "subject", path: subjectPathOf(p), tab: tabOf(pane) })}
            >
              <Trash2 size={18} />
            </button>
          </>
        )}
      />
    );
  } else if (pane?.kind === "exercise") {
    const p = pane.path;
    detail = (
      <NoteEditor
        key={p}
        path={p}
        placeholder={t.study.exercisePlaceholder}
        onBack={up}
        backOnWide
        autoFocus={pane.isNew}
        links={links(subjectDirOf(p))}
        actions={() => (
          <button
            className="btn ghost icon"
            title={t.study.deleteExercise}
            aria-label={t.study.deleteExercise}
            onClick={() => trash(p, t.study.exerciseDeleted, { kind: "subject", path: subjectPathOf(p), tab: "exercises" })}
          >
            <Trash2 size={18} />
          </button>
        )}
      />
    );
  } else if (pane?.kind === "assignment") {
    const s = subjectOf(pane.path);
    const a = s?.assignments.find(x => x.path === pane.path);
    if (a)
      detail = (
        <AssignmentPage
          key={a.path}
          assignment={a}
          onBack={up}
          onDelete={() => trash(a.dir, t.school.assignmentDeleted, { kind: "subject", path: s!.path, tab: "work" })}
        />
      );
  } else if (pane?.kind === "project") {
    const s = subjectOf(pane.path);
    const p = s?.workbench.find(x => x.path === pane.path);
    if (p)
      detail = (
        <WorkbenchPage
          key={p.path}
          project={p}
          onBack={up}
          onDelete={() => trash(p.dir, t.study.projectDeleted, { kind: "subject", path: s!.path }, p.title)}
        />
      );
  } else if (pane?.kind === "exam") {
    const p = pane.path;
    detail = <ExamPage key={p} path={p} onBack={up} onDelete={() => trash(p, t.school.examDeleted, { kind: "subject", path: subjectPathOf(p), tab: "exams" })} />;
  } else if (pane?.kind === "review") {
    const scope = pane.only ? subjects : subjects.filter(s => isSchool(s) === (pane.section === "school"));
    detail = (
      <CardReview
        key={pane.only ?? pane.section ?? "all"}
        cards={dueCards(pane.only || pane.section ? scope : subjects, undefined, pane.only)}
        onClose={up}
        onOpenNote={path => setPane({ kind: "note", path })}
      />
    );
  } else if (pane?.kind === "course") {
    const c = courses.find(x => x.path === pane.path);
    if (c) detail = <CoursePage key={c.path} course={c} onBack={up} onDelete={() => trash(c.path, t.school.courseDeleted, null, c.title)} />;
  } else if (pane?.kind === "timetable") {
    detail = <Timetable subjects={subjects} courses={courses} onBack={up} onOpen={s => setPane({ kind: "subject", path: s.path })} />;
  }

  const activePath = pane && "path" in pane ? pane.path : undefined;
  const activeSubject = activePath ? subjectPathOf(activePath) : pane?.kind === "review" ? pane.only : undefined;
  const semesterSubjects = course ? subjects.filter(s => s.course === course.id && s.semester === semester).sort((a, b) => a.title.localeCompare(b.title)) : [];
  const pickCourse = (id: string) => {
    setCourseId(id);
    setSemesterPick(null);
  };
  const newSubject = (group = "") => {
    setAddGroup(group);
    setAdding(section === "school" && !course ? "course" : "subject");
  };
  const openSubject = (s: Subject) => setPane({ kind: "subject", path: s.path });

  // Nothing open: the area's home, the whole width.
  const home =
    section === "personal" ? (
      <PersonalHome
        subjects={personal}
        groups={groups}
        onSubject={openSubject}
        onMenu={setMenu}
        onOpen={p => open(p)}
        onNew={newSubject}
        onGroups={() => setManaging(true)}
        onReview={() => setPane({ kind: "review", section })}
        group={homeGroup}
        onGroup={setHomeGroup}
      />
    ) : (
      <SchoolHome
        subjects={subjects}
        courses={courses}
        course={course}
        semester={semester}
        semesterSubjects={semesterSubjects}
        onCourse={pickCourse}
        onSemester={setSemesterPick}
        onTimetable={() => setPane({ kind: "timetable" })}
        onCourseSettings={() => course && setPane({ kind: "course", path: course.path })}
        onNewCourse={() => setAdding("course")}
        onNewSubject={() => newSubject()}
        onSubject={openSubject}
        onMenu={setMenu}
        onAssignment={path => setPane({ kind: "assignment", path })}
        onExam={path => setPane({ kind: "exam", path })}
        onReview={() => setPane({ kind: "review", section })}
      />
    );

  // Something open takes the whole width; only the list view keeps the tree (or, in School, the
  // semester's subjects) on its left.
  const focus = section === "personal" && view === "cards";
  return (
    <div className={!pane ? "study-area" : focus ? "split has-detail focus" : "split has-detail"}>
      {!pane ? (
        home
      ) : focus ? null : (
        <div className="list-pane">
          <div className="list-head">
            <button className="btn ghost study-home-link" onClick={() => setPane(null)} title={t.study.home} aria-label={t.study.home}>
              <Home size={18} /> <h1>{section === "school" ? t.area.school : t.area.personal}</h1>
            </button>
            <button className="btn primary icon" title={t.common.new} aria-label={t.common.new} onClick={() => newSubject()}>
              <Plus size={18} />
            </button>
          </div>
          {section === "personal" && (
            <SubjectTree
              subjects={personal}
              groups={groups}
              active={pane.kind === "subject" ? pane.path : activePath}
              onSubject={openSubject}
              onMenu={setMenu}
              onOpen={p => open(p)}
            />
          )}
          {section === "school" && course && (
            <>
              <CourseBar
                courses={courses}
                course={course}
                semester={semester}
                onCourse={pickCourse}
                onSemester={setSemesterPick}
                onTimetable={() => setPane({ kind: "timetable" })}
                onSettings={() => setPane({ kind: "course", path: course.path })}
              />
              {semesterSubjects.length === 0 ? (
                <p className="muted empty-note">{t.school.noSubjects}</p>
              ) : (
                <ul className="list">
                  {semesterSubjects.map(s => (
                    <SchoolRow key={s.path} s={s} course={course} active={activeSubject === s.path} onOpen={() => openSubject(s)} onMenu={() => setMenu(s)} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      {pane && <div className="detail-pane">{detail}</div>}
      {managing && <GroupsDialog subjects={subjects} saved={savedGroups} onClose={() => setManaging(false)} />}
      {moving && <MoveToGroup subject={moving} groups={groups} onPick={g => moveToGroup(moving, g)} onClose={() => setMoving(null)} />}
      {adding === "subject" && <NewSubject personal={personal} groups={groups} group={addGroup} school={section === "school"} onOk={createSub} onClose={() => setAdding(null)} />}
      {adding === "course" && <NewCourse onOk={addCourse} onClose={() => setAdding(null)} />}
      {addingMaterial && <NewMaterial onOk={f => addMaterial(addingMaterial, f)} onClose={() => setAddingMaterial(null)} />}
      {addingProject && <NewProject onOk={(title, desc, guide) => addProject(addingProject, title, desc, guide)} onClose={() => setAddingProject(null)} />}
      {addingCard && <AddCard onOk={cards => addCards(addingCard, cards)} onClose={() => setAddingCard(null)} />}
      {dated && (
        <NewDated
          title={dated.kind === "assignment" ? t.school.newAssignment : t.school.newExam}
          placeholder={dated.kind === "assignment" ? t.school.assignmentTitle : t.school.examTitle}
          dateLabel={dated.kind === "assignment" ? t.school.fDue : t.school.fDate}
          onOk={addDated}
          onClose={() => setDated(null)}
        />
      )}
      {help !== null && <CardsHelp body={help} onClose={() => setHelp(null)} />}
      {menu && (
        <Dialog title={menu.title} onClose={() => setMenu(null)}>
          <div className="stack" style={{ gap: 2 }}>
            <button
              className="menu-item"
              onClick={() => {
                setMenu(null);
                setPane({ kind: "subject", path: menu.path });
              }}
            >
              <Pencil size={18} /> {t.common.open}
            </button>
            {!isSchool(menu) && !menu.parent && (
              <button
                className="menu-item"
                onClick={() => {
                  setMoving(menu);
                  setMenu(null);
                }}
              >
                <FolderInput size={18} /> {t.study.moveToGroup}
              </button>
            )}
            <button
              className="menu-item danger"
              onClick={() => {
                setMenu(null);
                void trash(menu.dir, t.study.subjectDeleted, null, menu.title);
              }}
            >
              <Trash2 size={18} /> {t.common.delete}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
