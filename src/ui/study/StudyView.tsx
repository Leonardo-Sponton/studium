import { useCallback, useContext, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ArrowLeft, BookOpen, Brain, Circle, CircleCheck, Copy, FilePlus, Folder, FolderInput, FolderPlus, Home, Layers, Link2, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { parseCards } from "../../data/cards";
import { isoDate } from "../../data/dates";
import { flushAll } from "../../data/pending";
import { COURSES_DIR, createAssignment, createCourse, createExam, loadCourses, type Course } from "../../data/school";
import {
  appendCards,
  backlinks,
  descendantsOf,
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
  deleteGroup,
  renameGroup,
  workbenchProjectOf,
  type NewCard,
  type Subject,
} from "../../data/study";
import { guideBody, guideOf, type GuideId } from "../../data/guides";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { addGroup as createGroup, duplicateNote, loadPins, moveNote, movePin, moveSubject, placesFor, relinkAll, renameNote, renameTitled, togglePin, type Place } from "../../data/organize";
import { markOpened } from "../../editor/memory";
import { AskText, Dialog } from "../Dialog";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { PickList, type PickOption } from "../PickList";
import { shortcutLabel } from "../shortcuts";
import { NoteEditor } from "../NoteEditor";
import { useApp } from "../context";
import { LinksCtx } from "../links";
import type { WikiLinks } from "../../editor/wikiLinks";
import { useHold } from "../useHold";
import { CourseBar, PersonalHome, SchoolHome, scheduleMeta, schoolMeta } from "./Homes";
import { useCovers } from "./Covers";
import { AddCard } from "./AddCard";
import { CardReview, CardText } from "./CardReview";
import { MaterialReader } from "./MaterialReader";
import { PointsView, RecallView } from "./Recall";
import { setFinished, setNotebookAt, type Pick } from "../../data/notebook";
import { NewMaterial } from "./NewMaterial";
import { SCHOOL_TABS, SchoolSubject, type SchoolTab } from "./SchoolSubject";
import { CoursePage, NewCourse, NewDated, Timetable } from "./School";
import { groupOf, KindPicker, lineOf, SubjectPage, type MaterialBox, type SubjectTab } from "./SubjectPage";
import { nodeTitle, SubjectTree, useTreeOpen, type TreeNode } from "./SubjectTree";
import { Explorer, ExplorerRail, studyItem, type NavButtons, type StudyItem } from "./Explorer";
import { AssignmentPage, ExamPage } from "./WorkPages";
import { NewProject, WorkbenchPage } from "./Workbench";
import { GroupsDialog, useSavedGroups } from "./Groups";
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
  | { kind: "recall"; path: string }
  | { kind: "points"; path: string }
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

function NewSubject(props: {
  personal: Subject[];
  groups: string[];
  group?: string;
  /** Made inside this subject (its folder name). */
  parent?: string;
  school: boolean;
  onOk(title: string, group: string, parent: string, kind: "hub" | "study"): void;
  onClose(): void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"hub" | "study">("study");
  const [group, setGroup] = useState(props.group ?? "");
  const [parent, setParent] = useState(props.parent ?? "");
  // A group named like the subject itself would only wrap it in a second folder.
  const ok = () => title.trim() && props.onOk(title, group.trim().toLowerCase() === title.trim().toLowerCase() ? "" : group, parent, kind);
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
          <KindPicker value={kind} onChange={setKind} />
          <p className="muted small">{t.study.kindNewHint}</p>
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

function SchoolRow(props: { s: Subject; course?: Course; active: boolean; onOpen(): void; onMenu(at: { x: number; y: number }): void }) {
  const { s } = props;
  const hold = useHold((_, at) => props.onMenu(at));
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

/** What the Shell (shortcuts, command palette) can ask of the open study area. */
export interface StudyApi {
  /** A new note in the open subject (or asks which), with a title when given. */
  newNote(title?: string): void;
  newSubject(): void;
  newGroup(): void;
  rename(): void;
  move(): void;
  pin(): void;
  toggleExplorer(): void;
  /** The item open now, if any. */
  current(): StudyItem | null;
}

export function StudyView(props: {
  section: Section;
  subjects: Subject[];
  request?: StudyRequest;
  /** Opens a path of the other section (a [[link]] to it), in its own area. */
  onElsewhere(path: string): void;
  /** Back and forward through the session (ui/history, kept by the Shell). */
  nav: NavButtons;
  /** Tells the Shell what is open ("" = the home), for back and forward. */
  onPlace(path: string): void;
  /** Filled while this area is shown, for the Shell's shortcuts and palette. */
  apiRef: MutableRefObject<StudyApi | null>;
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
  /** Options of a tree row, a subject card or the open item, at a point. */
  const [menu, setMenu] = useState<{ node: TreeNode; at: { x: number; y: number } } | null>(null);
  /** Picking where something goes: a note or subject being moved, or a new note. */
  const [picking, setPicking] = useState<{ kind: "move"; node: TreeNode } | { kind: "newNote"; title?: string } | null>(null);
  /** Renamed in place in the tree (by key), or in a small dialog. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameAsk, setRenameAsk] = useState<TreeNode | null>(null);
  const [askGroup, setAskGroup] = useState(false);
  const [managing, setManaging] = useState(false);
  /** The parent a new subject is made in (from a subject's menu). */
  const [addParent, setAddParent] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const [explorerOn, setExplorerOn] = usePref<boolean>("studium.explorer", true);
  const branches = useTreeOpen();
  const savedGroups = useSavedGroups();
  /** The group page open on the Personal home; it stays while a subject is open, for back. */
  const [homeGroup, setHomeGroup] = useState<string | null>(null);
  const covers = useCovers();
  const [help, setHelp] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }), [toast]);
  const personal = subjects.filter(s => !isSchool(s));
  const groups = allGroups(savedGroups, personal);
  const personalSlugs = personal.map(s => s.slug);
  const course = courses.find(c => c.id === courseId) ?? courses[0];
  const semester = semesterPick && course && semesterPick <= course.semesters ? semesterPick : (course?.current ?? 1);
  const subjectOf = (path: string) => subjects.find(s => s.path === subjectPathOf(path));
  const { version } = useApp();
  useEffect(() => {
    let alive = true;
    loadPins(notes).then(p => alive && setPins(p), () => alive && setPins([]));
    return () => {
      alive = false;
    };
  }, [notes, version]);

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

  // The last subject page shown, with its section.
  const lastSubject = useRef<Pane | null>(null);
  if (pane?.kind === "subject") lastSubject.current = pane;

  // "Try to recall" and the review points go back to where they were opened from.
  const before = useRef<Pane | null>(null);
  const aside = (p: Pane) => {
    before.current = pane;
    setPane(p);
  };
  const recall = (path: string) => aside({ kind: "recall", path });
  const pick = (p: Pick) => {
    if (p.kind === "continue-material") setPane({ kind: "material", path: p.material.path, chapter: p.chapter });
    else if (p.kind === "recall") recall(p.note.path);
    else setPane({ kind: "note", path: p.note.path });
  };

  const up = () => {
    if (!pane) return;
    if ((pane.kind === "recall" || pane.kind === "points") && before.current) {
      setPane(before.current);
      before.current = null;
    } else if (pane.kind === "subject") {
      // Up from a personal subject is its group's page.
      const s = subjects.find(x => x.path === pane.path);
      if (s && !isSchool(s)) setHomeGroup(groupOf(subjects, s) || null);
      setPane(null);
    } else if (pane.kind === "course" || pane.kind === "timetable") setPane(null);
    else if (pane.kind === "review") setPane(pane.only ? { kind: "subject", path: pane.only, tab: "cards" } : null);
    else {
      const path = subjectPathOf(pane.path);
      // A personal subject's page comes back at the section it was left at.
      const was = lastSubject.current;
      setPane(was?.kind === "subject" && was.path === path && !subjectOf(pane.path)?.course ? was : { kind: "subject", path, tab: tabOf(pane) });
    }
  };

  const run = async (f: () => Promise<void>) => {
    try {
      await flushAll();
      await f();
    } catch (e) {
      fail(e);
    }
  };

  const createSub = (title: string, group: string, parent: string, kind: "hub" | "study") =>
    run(async () => {
      setAdding(null);
      const school = section === "school" && course;
      const n = await createSubject(notes, school ? { title, course: course.id, semester } : { title, kind, group: parent ? undefined : group, parent });
      bump();
      setPane({ kind: "subject", path: n.path, tab: "overview" });
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

  // ---- Organizing: rename, move, duplicate, pin, delete (tree menu, F2, palette) ----

  /** The path of the open pane's item, and the tree row that stands for it. */
  const paneNode = (): TreeNode | null => {
    if (!pane || !("path" in pane)) return null;
    const s = subjectOf(pane.path);
    if (!s) return null;
    if (pane.kind === "subject" || pane.kind === "summary") return { kind: "subject", key: s.path, s };
    const n = s.notes.find(x => x.path === pane.path);
    if (n) return { kind: "note", key: n.path, s, n };
    const m = s.materials.find(x => x.path === pane.path);
    if (m) return { kind: "material", key: m.path, s, m };
    return null;
  };

  const renameNode = (node: TreeNode, title: string) =>
    run(async () => {
      const old = nodeTitle(node);
      const go = async (from: string, to: string) => {
        if (node.kind === "group") return void (await renameGroup(notes, subjects, savedGroups, from, to));
        if (node.kind === "note") await renameNote(notes, node.n.path, to);
        else if (node.kind === "subject") await renameTitled(notes, node.s.path, to);
        else if (node.kind === "material") await renameTitled(notes, node.m.path, to);
        else return 0;
        return relinkAll(notes, await loadSubjects(notes), from, to, node.key);
      };
      const links = await go(old, title);
      bump();
      toast({
        text: t.explorer.renamed(links ?? 0),
        action: node.kind === "group" ? undefined : { label: t.common.undo, run: () => void go(title, old).then(bump, fail) },
      });
    });

  const startRename = (node: TreeNode, inTree: boolean) => {
    if (node.kind === "leaf" || (node.kind === "group" && !node.name)) return;
    if (inTree) setRenaming(node.key);
    else setRenameAsk(node);
  };

  /** Where a note can go (every subject but its own) or a subject (groups, and subjects not inside it). */
  const placeOptions = (node: TreeNode | null): PickOption[] => {
    const where = (s: Subject) => (isSchool(s) ? `${t.area.school}${s.semester ? ` · ${s.semester}º` : ""}` : groupOf(subjects, s) || t.study.noGroup);
    if (!node || node.kind === "note")
      return [...subjects]
        .sort((a, b) => Number(isSchool(a)) - Number(isSchool(b)) || a.title.localeCompare(b.title))
        .map(s => ({ key: s.path, label: s.title, sub: where(s), icon: <BookOpen size={16} />, current: node?.kind === "note" && node.s.path === s.path }));
    if (node.kind !== "subject") return [];
    const s = node.s;
    const parent = subjects.find(x => x.slug === s.parent && !isSchool(x));
    const groupsList = [...groups, ""].map(g => ({
      key: `g:${g}`,
      label: g || t.study.noGroup,
      sub: t.explorer.topLevel,
      icon: <Folder size={16} />,
      current: !parent && s.group === g,
    }));
    const inside = placesFor(subjects, s)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(x => ({ key: `s:${x.slug}`, label: x.title, sub: t.explorer.inside(where(x)), icon: <BookOpen size={16} />, current: parent?.slug === x.slug }));
    return [...groupsList, ...inside];
  };

  const moveTo = (node: TreeNode, key: string) =>
    run(async () => {
      if (node.kind === "note") {
        const target = subjects.find(s => s.path === key);
        if (!target) return;
        const from = node.n.path;
        const back = node.s.dir;
        const to = await moveNote(notes, from, target.dir);
        await movePin(notes, from, to);
        // Its new place opens in the tree, so you see where it went.
        if (!isSchool(target)) branches.reveal(lineOf(subjects, target).map(x => x.slug), groupOf(subjects, target));
        bump();
        if (pane && "path" in pane && pane.path === from) setPane({ kind: "note", path: to });
        toast({
          text: t.explorer.moved(target.title),
          action: {
            label: t.common.undo,
            run: () =>
              void moveNote(notes, to, back)
                .then(async p => (await movePin(notes, to, p), bump(), pane && "path" in pane && pane.path === from && setPane({ kind: "note", path: p })))
                .catch(fail),
          },
        });
      } else if (node.kind === "subject") {
        const s = node.s;
        const was: Place = s.parent && subjects.some(x => x.slug === s.parent) ? { parent: s.parent } : { group: s.group };
        const to: Place = key.startsWith("g:") ? { group: key.slice(2) } : { parent: key.slice(2) };
        await moveSubject(notes, subjects, s, to);
        // The group it leaves stays, even empty (a folder does not vanish when emptied).
        if (s.group && !savedGroups.includes(s.group)) await createGroup(notes, s.group);
        if ("parent" in to) branches.reveal([to.parent]);
        bump();
        const name = "group" in to ? to.group || t.study.noGroup : (subjects.find(x => x.slug === to.parent)?.title ?? "");
        toast({ text: t.explorer.moved(name), action: { label: t.common.undo, run: () => void moveSubject(notes, subjects, s, was).then(bump, fail) } });
      }
    });

  /** A row dragged onto a subject or a group. */
  const dropOn = (dragged: TreeNode, onto: TreeNode) => {
    if (dragged.kind === "note" && onto.kind === "subject") void moveTo(dragged, onto.s.path);
    else if (dragged.kind === "subject" && onto.kind === "group") void moveTo(dragged, `g:${onto.name}`);
    else if (dragged.kind === "subject" && onto.kind === "subject" && !descendantsOf(subjects, dragged.s.slug).has(onto.s.slug)) void moveTo(dragged, `s:${onto.s.slug}`);
  };

  const pinToggle = (path: string) =>
    run(async () => {
      const on = await togglePin(notes, path);
      setPins(p => (on ? [...p, path] : p.filter(x => x !== path)));
      toast({ text: on ? t.explorer.pinnedNow : t.explorer.unpinnedNow });
    });

  const copyLink = (title: string) =>
    navigator.clipboard.writeText(`[[${title}]]`).then(
      () => toast({ text: t.explorer.linkCopied(title) }),
      () => toast({ text: t.explorer.copyFailed, error: true }),
    );

  const duplicate = (path: string) =>
    run(async () => {
      const to = await duplicateNote(notes, path, t.explorer.copyOf);
      bump();
      setPane({ kind: "note", path: to });
      toast({ text: t.explorer.duplicated });
    });

  const deleteNode = (node: TreeNode) => {
    if (node.kind === "note") void trash(node.n.path, t.study.noteDeleted, pane && "path" in pane && pane.path === node.n.path ? { kind: "subject", path: node.s.path, tab: "notes" } : pane, node.n.title);
    else if (node.kind === "material")
      void trash(node.m.path, t.study.materialDeleted, pane && "path" in pane && pane.path === node.m.path ? { kind: "subject", path: node.s.path, tab: "materials" } : pane, node.m.title);
    else if (node.kind === "subject") void trash(node.s.dir, t.study.subjectDeleted, pane && "path" in pane && subjectPathOf(pane.path) === node.s.path ? null : pane, node.s.title);
    else if (node.kind === "group" && node.name)
      void confirmDelete(node.name, t.explorer.deleteGroupText(node.name)).then(
        ok => {
          if (ok) void run(async () => (await deleteGroup(notes, subjects, savedGroups, node.name), bump(), toast({ text: t.explorer.groupDeleted(node.name) })));
        },
      );
  };

  /** New note in the open subject; with none open, asks which subject. */
  const newNoteHere = (title?: string) => {
    const s = pane && "path" in pane ? subjectOf(pane.path) : undefined;
    if (s) void newNote(s.dir, title ? { title } : undefined);
    else setPicking({ kind: "newNote", title });
  };

  const newSubjectIn = (opts: { group?: string; parent?: string }) => {
    setAddGroup(opts.group ?? "");
    setAddParent(opts.parent ?? "");
    setAdding("subject");
  };

  // An open editor keeps its edits: they are saved first, then it reloads the marked file.
  const finish = (path: string, done: boolean) =>
    flushAll()
      .then(() => setFinished(notes, path, done))
      .then(bump, fail);

  const itemsFor = (node: TreeNode): MenuItem[] => {
    const rename: MenuItem = { icon: <Pencil size={17} />, label: t.explorer.rename, keys: shortcutLabel("rename"), run: () => startRename(node, true) };
    const pinItem = (path: string): MenuItem =>
      pins.includes(path) ? { icon: <PinOff size={17} />, label: t.explorer.unpin, run: () => pinToggle(path) } : { icon: <Pin size={17} />, label: t.explorer.pin, run: () => pinToggle(path) };
    const link = (title: string): MenuItem => ({ icon: <Link2 size={17} />, label: t.explorer.copyLink, run: () => void copyLink(title) });
    const del = (label = t.common.delete): MenuItem => ({ icon: <Trash2 size={17} />, label, danger: true, divide: true, keys: "Delete", run: () => deleteNode(node) });
    switch (node.kind) {
      case "group":
        return [
          { icon: <FolderPlus size={17} />, label: t.explorer.newSubjectHere, run: () => newSubjectIn({ group: node.name }) },
          ...(node.name ? [rename, del(t.explorer.removeGroup)] : []),
        ];
      case "subject": {
        const s = node.s;
        return [
          { icon: <FilePlus size={17} />, label: t.explorer.newNoteHere, run: () => void newNote(s.dir) },
          ...(isSchool(s)
            ? [rename]
            : [
                { icon: <FolderPlus size={17} />, label: t.explorer.newSubjectInside, run: () => newSubjectIn({ parent: s.slug }) },
                rename,
                { icon: <FolderInput size={17} />, label: t.explorer.move, run: () => setPicking({ kind: "move", node }) },
              ]),
          pinItem(s.path),
          link(s.title),
          del(),
        ];
      }
      case "note": {
        const n = node.n;
        const book = n.kind === "note" && n.order !== null && !isSchool(node.s);
        return [
          { icon: <BookOpen size={17} />, label: t.common.open, run: () => setPane({ kind: "note", path: n.path }) },
          ...(n.kind !== "cards" && !n.empty ? [{ icon: <Brain size={17} />, label: t.recall.title, run: () => recall(n.path) }] : []),
          ...(book
            ? [
                n.finished
                  ? { icon: <Circle size={17} />, label: t.notebook.unfinish, run: () => void finish(n.path, false) }
                  : { icon: <CircleCheck size={17} />, label: t.notebook.finish, run: () => void finish(n.path, true) },
              ]
            : []),
          { ...rename, divide: true },
          { icon: <FolderInput size={17} />, label: t.explorer.move, run: () => setPicking({ kind: "move", node }) },
          { icon: <Copy size={17} />, label: t.explorer.duplicate, run: () => duplicate(n.path) },
          pinItem(n.path),
          ...(n.title ? [link(n.title)] : []),
          del(),
        ];
      }
      case "material":
        return [rename, pinItem(node.m.path), link(node.m.title), del()];
      case "leaf":
        return [{ icon: <BookOpen size={17} />, label: t.common.open, run: () => open(node.open) }];
    }
  };

  /** A subject card's options (Homes): the same as its row in the tree. */
  const subjectMenu = (s: Subject, at: { x: number; y: number }) => setMenu({ node: { kind: "subject", key: s.path, s }, at });

  // What is open goes into the back/forward history and the recent list, and its branch of the
  // tree opens so the row shows.
  const placeOf = (p: Pane | null) =>
    !p ? "" : p.kind === "summary" ? `summary:${p.path}` : p.kind === "recall" || p.kind === "points" ? null : "path" in p ? p.path : null;
  const firstPlace = useRef(true);
  useEffect(() => {
    const place = placeOf(pane);
    // The first render of an area asked to open something is that thing, not the home.
    if (firstPlace.current && !pane && props.request?.path) return;
    firstPlace.current = false;
    if (place === null) return;
    props.onPlace(place);
    if (!place || section !== "personal") return;
    if (pane?.kind !== "note") markOpened(place.replace(/^summary:/, ""));
    const s = subjectOf(place.replace(/^summary:/, ""));
    if (!s) return;
    const line: string[] = [];
    for (let at: Subject | undefined = s; at && !line.includes(at.slug); at = subjects.find(x => x.slug === at!.parent && !isSchool(x))) line.push(at.slug);
    // The subject's own branch opens only for something inside it.
    branches.reveal(pane?.kind === "subject" ? line.slice(1) : line, groupOf(subjects, s));
  }, [pane && placeOf(pane)]);

  // Opening a notebook chapter (a numbered note) remembers it as where the notebook stopped.
  const openNote = pane?.kind === "note" ? pane.path : "";
  useEffect(() => {
    if (!openNote) return;
    const s = subjectOf(openNote);
    const n = s?.notes.find(x => x.path === openNote);
    if (s && n && n.kind === "note" && n.order !== null && !isSchool(s)) void setNotebookAt(notes, s, openNote).then(bump, () => {});
  }, [openNote]);

  props.apiRef.current = {
    newNote: newNoteHere,
    newSubject: () => {
      const node = paneNode();
      if (section === "personal" && node?.kind === "subject" && !isSchool(node.s)) newSubjectIn({ parent: node.s.slug });
      else newSubject();
    },
    newGroup: () => setAskGroup(true),
    rename: () => {
      const node = paneNode();
      if (node) startRename(node, false);
    },
    move: () => {
      const node = paneNode();
      if (node && (node.kind === "note" || (node.kind === "subject" && !isSchool(node.s)))) setPicking({ kind: "move", node });
    },
    pin: () => {
      const node = paneNode();
      if (node) void pinToggle(node.key);
    },
    toggleExplorer: () => setExplorerOn(!explorerOn),
    current: () => {
      const p = pane && placeOf(pane);
      return p ? studyItem(subjects, p) : null;
    },
  };
  useEffect(
    () => () => {
      props.apiRef.current = null;
    },
    [],
  );

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

  /** Where an item is: group › parent subjects › subject, each one a way there. */
  const crumbs = (path: string) => {
    const s = subjectOf(path);
    if (!s) return null;
    const line = isSchool(s) ? [s] : lineOf(subjects, s);
    const group = isSchool(s) ? t.area.school : groupOf(subjects, s);
    return (
      <nav className="crumbs one-line" aria-label={t.explorer.where}>
        {group && (
          <>
            <button
              className="crumb"
              onClick={() => {
                if (!isSchool(s)) setHomeGroup(group);
                setPane(null);
              }}
            >
              {group}
            </button>
            <span aria-hidden="true">›</span>
          </>
        )}
        {line.map((x, i) => (
          <span key={x.path} className="row" style={{ gap: 4, display: "contents" }}>
            {i > 0 && <span aria-hidden="true">›</span>}
            <button className="crumb" onClick={() => setPane({ kind: "subject", path: x.path })}>
              {x.title}
            </button>
          </span>
        ))}
      </nav>
    );
  };
  const pinButton = (path: string) => {
    const on = pins.includes(path);
    return (
      <button className={`btn ghost icon${on ? " on" : ""}`} title={on ? t.explorer.unpin : t.explorer.pin} aria-label={t.explorer.pin} aria-pressed={on} onClick={() => pinToggle(path)}>
        <Pin size={18} />
      </button>
    );
  };

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
          onNoteMenu={(n, at) => setMenu({ node: { kind: "note", key: n.path, s, n }, at })}
          onSubjectMenu={subjectMenu}
          onNewChild={() => newSubjectIn({ parent: s.slug })}
          onPoints={() => aside({ kind: "points", path: s.path })}
          onPick={pick}
          onNewTitled={title => newNote(s.dir, { title })}
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
        crumbs={crumbs(pane.path)}
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
        crumbs={crumbs(p)}
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
            {n && n.kind === "note" && n.order !== null && s && !isSchool(s) && (() => {
              const done = f.data().finished === true;
              return (
                <button
                  className={`btn ghost${done ? " is-done" : ""}`}
                  role="checkbox"
                  aria-checked={done}
                  title={done ? t.notebook.unfinish : t.notebook.finish}
                  onClick={() => f.setData({ finished: done ? undefined : true })}
                >
                  {done ? <CircleCheck size={17} /> : <Circle size={17} />} <span className="hide-narrow">{done ? t.notebook.finished : t.notebook.finishShort}</span>
                </button>
              );
            })()}
            {n && !n.empty && n.kind !== "cards" && (
              <button className="btn ghost" title={t.recall.what} onClick={() => recall(p)}>
                <Brain size={17} /> <span className="hide-narrow">{t.recall.title}</span>
              </button>
            )}
            {pinButton(p)}
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
        crumbs={crumbs(p)}
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
  } else if (pane?.kind === "recall") {
    const p = pane.path;
    detail = <RecallView key={p} path={p} links={links(subjectDirOf(p))} onBack={up} onOpenNote={path => setPane({ kind: "note", path })} />;
  } else if (pane?.kind === "points") {
    const s = subjects.find(x => x.path === pane.path);
    if (s) {
      const under = descendantsOf(subjects, s.slug);
      detail = (
        <PointsView
          key={s.path}
          subject={s}
          subjects={subjects.filter(x => !isSchool(x) && under.has(x.slug))}
          links={links(s.dir)}
          onBack={up}
          onOpenNote={path => setPane({ kind: "note", path })}
        />
      );
    }
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
    setAddParent("");
    setAdding(section === "school" && !course ? "course" : "subject");
  };
  const openSubject = (s: Subject) => setPane({ kind: "subject", path: s.path });

  // The personal tree: in the side panel, and on the Personal home in the list view (phones).
  const treeActive = pane?.kind === "subject" ? pane.path : pane?.kind === "summary" ? `summary:${pane.path}` : activePath;
  const tree = (
    <SubjectTree
      subjects={personal}
      groups={groups}
      active={treeActive}
      onSubject={openSubject}
      onOpen={p => open(p)}
      onMenu={(node, at) => setMenu({ node, at })}
      renaming={renaming}
      onRenameStart={node => startRename(node, true)}
      onRename={(node, title) => {
        setRenaming(null);
        if (title) void renameNode(node, title);
      }}
      onDelete={deleteNode}
      onDrop={dropOn}
    />
  );

  // Nothing open: the area's home.
  const home =
    section === "personal" ? (
      <PersonalHome
        subjects={personal}
        groups={groups}
        tree={tree}
        onSubject={openSubject}
        onMenu={subjectMenu}
        onNew={newSubject}
        onGroups={() => setManaging(true)}
        onReview={() => setPane({ kind: "review", section })}
        onPick={pick}
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
        onMenu={subjectMenu}
        onAssignment={path => setPane({ kind: "assignment", path })}
        onExam={path => setPane({ kind: "exam", path })}
        onReview={() => setPane({ kind: "review", section })}
      />
    );

  const dialogs = (
    <>
      {managing && <GroupsDialog subjects={subjects} saved={savedGroups} onClose={() => setManaging(false)} />}
      {adding === "subject" && (
        <NewSubject personal={personal} groups={groups} group={addGroup} parent={addParent} school={section === "school"} onOk={createSub} onClose={() => setAdding(null)} />
      )}
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
      {menu && <ContextMenu at={menu.at} label={nodeTitle(menu.node)} items={itemsFor(menu.node)} onClose={() => setMenu(null)} />}
      {picking && (
        <PickList
          title={picking.kind === "newNote" ? t.explorer.whereNote : t.study.moveToGroupOf(nodeTitle(picking.node))}
          options={placeOptions(picking.kind === "move" ? picking.node : null)}
          onPick={key => {
            if (picking.kind === "move") void moveTo(picking.node, key);
            else {
              const s = subjects.find(x => x.path === key);
              if (s) void newNote(s.dir, picking.title ? { title: picking.title } : undefined);
            }
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {renameAsk && (
        <AskText
          title={t.explorer.renameWhat(nodeTitle(renameAsk))}
          initial={renameAsk.kind === "note" ? renameAsk.n.title : nodeTitle(renameAsk)}
          okLabel={t.explorer.rename}
          onOk={title => {
            const node = renameAsk;
            setRenameAsk(null);
            if (title !== nodeTitle(node)) void renameNode(node, title);
          }}
          onClose={() => setRenameAsk(null)}
        />
      )}
      {askGroup && (
        <AskText
          title={t.study.newGroup}
          placeholder={t.study.newGroupName}
          onOk={name => {
            setAskGroup(false);
            void run(async () => (await createGroup(notes, name), bump()));
          }}
          onClose={() => setAskGroup(false)}
        />
      )}
    </>
  );

  // Personal: the side panel (tree) stays beside the home or the open item on wide screens.
  if (section === "personal")
    return (
      <div className={`study-split${explorerOn ? " with-explorer" : ""}${pane ? " has-detail" : ""}`}>
        {explorerOn ? (
          <Explorer
            subjects={subjects}
            pins={pins}
            active={treeActive}
            nav={props.nav}
            onHome={() => setPane(null)}
            onOpen={p => open(p)}
            onNewNote={() => newNoteHere()}
            onNewSubject={() => props.apiRef.current?.newSubject()}
            expanded={branches.anyOpen(personalSlugs, groups)}
            onToggleAll={() => (branches.anyOpen(personalSlugs, groups) ? branches.collapseAll(groups) : branches.expandAll(personalSlugs))}
            onHide={() => setExplorerOn(false)}
            tree={tree}
          />
        ) : (
          <ExplorerRail nav={props.nav} onShow={() => setExplorerOn(true)} />
        )}
        <div className="detail-pane">{pane ? detail : home}</div>
        {dialogs}
      </div>
    );

  // School: the semester's subjects stay on the left while one is open.
  return (
    <div className={!pane ? "study-area" : "split has-detail"}>
      {!pane ? (
        home
      ) : (
        <div className="list-pane">
          <div className="list-head">
            <button className="btn ghost study-home-link" onClick={() => setPane(null)} title={t.study.home} aria-label={t.study.home}>
              <Home size={18} /> <h1>{t.area.school}</h1>
            </button>
            <span className="row" style={{ gap: 2 }}>
              <button className="btn ghost icon" disabled={!props.nav.canBack} onClick={props.nav.back} title={`${t.explorer.back} (${shortcutLabel("back")})`} aria-label={t.explorer.back}>
                <ArrowLeft size={17} />
              </button>
              <button className="btn primary icon" title={t.common.new} aria-label={t.common.new} onClick={() => newSubject()}>
                <Plus size={18} />
              </button>
            </span>
          </div>
          {course && (
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
                    <SchoolRow key={s.path} s={s} course={course} active={activeSubject === s.path} onOpen={() => openSubject(s)} onMenu={at => subjectMenu(s, at)} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      {pane && <div className="detail-pane">{detail}</div>}
      {dialogs}
    </div>
  );
}
