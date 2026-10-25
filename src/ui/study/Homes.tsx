import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, ClipboardCheck, Crop, FileCheck2, FolderTree, ImageMinus, ImagePlus, LayoutGrid, Layers, List, Plus, Settings2 } from "lucide-react";
import { isoDate } from "../../data/dates";
import { average, type Course } from "../../data/school";
import {
  childrenOf,
  coverOf,
  descendantsOf,
  dueCards,
  removeGroupCover,
  rootsOf,
  setGroupCover,
  setGroupCoverFrame,
  type Subject,
} from "../../data/study";
import { todayPicks, type Pick } from "../../data/notebook";
import { TodayPicks } from "./Notebook";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useHold } from "../useHold";
import { ClassesToday } from "./School";
import { Cover, CoverAdjust, coverData, useCovers, useImage } from "./Covers";
import { relativeDay, stoppedAt } from "./SubjectPage";
import { shortcutLabel } from "../shortcuts";
import { usePref } from "./prefs";
import { dateLabel, gradeText } from "./school-ui";
import { t } from "../../i18n";

// The first screens of the two study areas, shown while nothing is open:
//   Personal  the subjects as the tree (a vertical column) or as cards by group, each group with
//             its name and a cover picture (study/_covers); a group card opens the group.
//   School    the course and semester, classes today, what is due next and the semester's
//             subjects as cards.

// ---- Personal ----

export type PersonalView = "list" | "cards";

interface PersonalProps {
  /** Personal subjects. */
  subjects: Subject[];
  /** Every group in its order (Groups), including the ones with no subject yet. */
  groups: string[];
  onSubject(s: Subject): void;
  onMenu(s: Subject, at: { x: number; y: number }): void;
  /** The tree (ui/study/SubjectTree), shown in the list view. */
  tree: ReactNode;
  /** New subject, inside a group when one is open. */
  onNew(group: string): void;
  onGroups(): void;
  onReview(): void;
  /** One of the suggestions for today (ui/study/Notebook). */
  onPick(p: Pick): void;
  /** The group whose page is open (cards view), kept by Study so back from a subject lands there. */
  group: string | null;
  onGroup(g: string | null): void;
}

/** List or cards: how Personal shows its subjects; a subject opens beside the tree only in list. */
export const usePersonalView = () => usePref<PersonalView>("studium.personal.view", "cards");

export function PersonalHome(props: PersonalProps) {
  const [view, setView] = usePersonalView();
  const { group, onGroup: setGroup } = props;
  useBack(group !== null, () => setGroup(null));
  const covers = useCovers();
  const roots = rootsOf(props.subjects);
  // Subjects with no group sit right on the home, beside the groups (no "No group" folder).
  const ungrouped = roots.filter(s => !s.group).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
  const cardGroups = props.groups;
  /** A root subject with all its sub-subjects. */
  const family = (s: Subject) => {
    const slugs = descendantsOf(props.subjects, s.slug);
    return props.subjects.filter(x => slugs.has(x.slug));
  };
  const inGroup = (g: string) => roots.filter(s => s.group === g);
  const due = dueCards(props.subjects).length;
  // A group renamed or removed elsewhere closes.
  const shownGroup = group !== null && cardGroups.includes(group) ? group : null;

  if (view === "cards" && shownGroup !== null)
    return (
      <GroupPage
        name={shownGroup}
        cover={coverOf(covers, shownGroup)}
        roots={inGroup(shownGroup)}
        all={props.subjects}
        family={family}
        onBack={() => setGroup(null)}
        onSubject={props.onSubject}
        onMenu={props.onMenu}
        onNew={() => props.onNew(shownGroup)}
      />
    );

  return (
    <div className="page study-home">
      <div className="page-inner stack">
        <div className="home-head">
          <h1>{t.area.personal}</h1>
          <div className="row home-actions">
            <div className="segmented home-view" role="group" aria-label={t.study.view}>
              <button aria-pressed={view === "list"} title={t.study.viewList} aria-label={t.study.viewList} onClick={() => setView("list")}>
                <List size={16} />
              </button>
              <button aria-pressed={view === "cards"} title={t.study.viewCards} aria-label={t.study.viewCards} onClick={() => setView("cards")}>
                <LayoutGrid size={16} />
              </button>
            </div>
            <button className="btn ghost" onClick={props.onGroups}>
              <FolderTree size={16} /> <span className="hide-narrow">{t.study.groups}</span>
            </button>
            <button className="btn primary" onClick={() => props.onNew("")}>
              <Plus size={18} /> {t.common.new}
            </button>
          </div>
        </div>
        <TodayPicks picks={todayPicks(props.subjects)} onPick={props.onPick} showSubject />
        {due > 0 && (
          <button className="subj-review-quiet" onClick={props.onReview}>
            <Layers size={16} />
            <span>{t.study.reviewWhenever(due)}</span>
          </button>
        )}
        {props.subjects.length === 0 && props.groups.length === 0 ? (
          <p className="muted">{t.study.empty}</p>
        ) : view === "list" ? (
          <>
            {/* Beside the side panel (wide screens) the same tree would show twice: a hint instead. */}
            <div className="home-tree">{props.tree}</div>
            <p className="muted home-tree-hint">{t.explorer.homeHint(shortcutLabel("open"))}</p>
          </>
        ) : (
          <>
            <ul className="group-grid">
              {cardGroups.map(g => {
                return (
                  <li key={g || "-"}>
                    <button className="group-card" onClick={() => setGroup(g)}>
                      <Cover url={coverOf(covers, g)} name={g || t.study.noGroup} className="group-cover" />
                      <span className="group-card-body">
                        <span className="list-title">{g || t.study.noGroup}</span>
                        <span className="list-meta">
                          {t.study.subjectsIn(inGroup(g).length)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {ungrouped.length > 0 && (
              <ul className="subject-grid">
                {ungrouped.map(s => (
                  <li key={s.path}>
                    <SubjectCard s={s} kids={childrenOf(props.subjects, s.slug)} due={dueCards(family(s)).length} onOpen={props.onSubject} onMenu={props.onMenu} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GroupPage(props: {
  name: string;
  cover?: string;
  roots: Subject[];
  all: Subject[];
  family(s: Subject): Subject[];
  onBack(): void;
  onSubject(s: Subject): void;
  onMenu(s: Subject, at: { x: number; y: number }): void;
  onNew(): void;
}) {
  const { notes, bump, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  // Open right after a new picture is picked, so it can be framed at once.
  const [adjust, setAdjust] = useState(false);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    try {
      const c = await coverData(file);
      await setGroupCover(notes.storage, props.name, c.ext, c.data);
      await setGroupCoverFrame(notes, props.name, null);
      bump();
      setAdjust(true);
    } catch (e) {
      fail(e);
    }
  };
  const removeCover = () =>
    removeGroupCover(notes.storage, props.name)
      .then(() => setGroupCoverFrame(notes, props.name, null))
      .then(bump, fail);
  const title = props.name || t.study.noGroup;
  return (
    <div className="page study-home">
      <div className="page-inner stack">
        <div className="group-banner">
          <Cover url={props.cover} name={title} className="group-banner-pic" />
          <button className="btn icon group-banner-back" onClick={props.onBack} aria-label={t.common.back} title={t.common.back}>
            <ArrowLeft size={20} />
          </button>
          <h1>{title}</h1>
        </div>
        {adjust && props.cover && (
          <CoverAdjust
            url={props.cover}
            banner=".group-banner"
            card={16 / 9}
            onClose={() => setAdjust(false)}
            onSave={f => {
              setAdjust(false);
              setGroupCoverFrame(notes, props.name, f).then(bump, fail);
            }}
          />
        )}
        <div className="row home-actions" style={{ justifyContent: "flex-end" }}>
          {props.name && (
            <>
              <input ref={input} type="file" accept="image/*" hidden onChange={e => pick(e.target.files)} />
              <button className="btn ghost" onClick={() => input.current?.click()}>
                <ImagePlus size={16} /> {props.cover ? t.study.changeCover : t.study.addCover}
              </button>
              {props.cover && (
                <>
                  <button className="btn ghost" onClick={() => setAdjust(true)}>
                    <Crop size={16} /> {t.study.adjustCover}
                  </button>
                  <button className="btn ghost" onClick={removeCover}>
                    <ImageMinus size={16} /> {t.study.removeCover}
                  </button>
                </>
              )}
            </>
          )}
          <button className="btn primary" onClick={props.onNew}>
            <Plus size={18} /> {t.study.newSubject}
          </button>
        </div>
        {props.roots.length === 0 ? (
          <p className="muted">{t.study.groupEmpty}</p>
        ) : (
          <ul className="subject-grid">
            {props.roots.map(s => (
              <li key={s.path}>
                <SubjectCard s={s} kids={childrenOf(props.all, s.slug)} due={dueCards(props.family(s)).length} onOpen={props.onSubject} onMenu={props.onMenu} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SubjectCard(props: { s: Subject; kids: Subject[]; due: number; onOpen(s: Subject): void; onMenu(s: Subject, at: { x: number; y: number }): void }) {
  const { s } = props;
  const hold = useHold((_, at) => props.onMenu(s, at));
  const at = stoppedAt(s);
  const notes = s.notes.filter(n => n.kind !== "cards").length;
  const cover = useImage(s.cover, s.coverFrame);
  return (
    <div className="subject-card" {...hold.handlers}>
      <button className="subject-card-main" onClick={() => !hold.eaten() && props.onOpen(s)}>
        {cover && <Cover url={cover} name={s.title} className="subj-kid-pic" />}
        <span className="list-title">{s.title}</span>
        {at && <span className="list-meta">{t.study.stoppedAt(at)}</span>}
        <span className="list-meta">
          {[s.materials.length ? t.study.materialsCount(s.materials.length) : "", notes ? t.study.notesCount(notes) : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="list-meta">{relativeDay(s.modified)}</span>
      </button>
      {props.kids.length > 0 && (
        <span className="subject-card-kids">
          {props.kids.map(k => (
            <button key={k.path} className="chip" onClick={() => props.onOpen(k)}>
              {k.title}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

// ---- School ----

/** The course (picked when there are several), its semesters as chips, timetable and settings. */
export function CourseBar(props: {
  courses: Course[];
  course: Course;
  semester: number;
  onCourse(id: string): void;
  onSemester(n: number): void;
  onTimetable(): void;
  onSettings(): void;
}) {
  const { course, semester } = props;
  return (
    <>
      <div className="course-head">
        {props.courses.length > 1 ? (
          <select className="field" value={course.id} aria-label={t.school.course} onChange={e => props.onCourse(e.target.value)}>
            {props.courses.map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="course-title">{course.title}</span>
        )}
        <button className="btn ghost icon" title={t.school.timetable} aria-label={t.school.timetable} onClick={props.onTimetable}>
          <CalendarDays size={18} />
        </button>
        <button className="btn ghost icon" title={t.school.courseSettings} aria-label={t.school.courseSettings} onClick={props.onSettings}>
          <Settings2 size={18} />
        </button>
      </div>
      <p className="muted small course-meta">{[course.institution, t.school.semesterOf(course.current, course.semesters)].filter(Boolean).join(" · ")}</p>
      <div className="chips" role="tablist" aria-label={t.school.fSemester}>
        {Array.from({ length: course.semesters }, (_, i) => i + 1).map(n => (
          <button key={n} role="tab" aria-selected={semester === n} className={`chip${semester === n ? " active" : ""}`} onClick={() => props.onSemester(n)}>
            {t.school.semesterShort(n)}
            {n === course.current && <span className="dot" aria-label={t.school.currentSemester} />}
          </button>
        ))}
      </div>
    </>
  );
}

/** "avg 7.5 · 4 h absent · next: Fri 24 Oct" for a school subject. */
export function schoolMeta(s: Subject, today = isoDate()): string {
  const avg = average([...s.assignments, ...s.exams]);
  const next = [
    ...s.assignments.filter(a => (a.status === "todo" || a.status === "doing") && a.due >= today).map(a => a.due),
    ...s.exams.filter(x => x.date >= today && x.grade === null).map(x => x.date),
  ].sort()[0];
  return [avg !== null ? t.school.averageShort(gradeText(avg)) : "", s.absences ? t.school.absencesShort(s.absences) : "", next ? t.school.nextDate(dateLabel(next)) : ""]
    .filter(Boolean)
    .join(" · ");
}

export const scheduleMeta = (s: Subject) => [s.schedule.map(x => `${t.school.days[x.day]} ${x.from}`).join(", "), s.room, s.teacher].filter(Boolean).join(" · ");

const UPCOMING = 8;

interface SchoolProps {
  subjects: Subject[];
  courses: Course[];
  course?: Course;
  semester: number;
  /** The subjects of the course in the semester shown. */
  semesterSubjects: Subject[];
  onCourse(id: string): void;
  onSemester(n: number): void;
  onTimetable(): void;
  onCourseSettings(): void;
  onNewCourse(): void;
  onNewSubject(): void;
  onSubject(s: Subject): void;
  onMenu(s: Subject, at: { x: number; y: number }): void;
  onAssignment(path: string): void;
  onExam(path: string): void;
  onReview(): void;
}

export function SchoolHome(props: SchoolProps) {
  const { course } = props;
  const today = isoDate();
  const school = props.subjects.filter(s => s.course);
  const due = dueCards(school).length;
  // Assignments to deliver and exams not taken yet, of the course's subjects (late ones first).
  const ofCourse = course ? school.filter(s => s.course === course.id) : [];
  const upcoming = [
    ...ofCourse.flatMap(s =>
      s.assignments
        .filter(a => (a.status === "todo" || a.status === "doing") && a.due)
        .map(a => ({ kind: "assignment" as const, path: a.path, title: a.title, day: a.due, subject: s.title, late: a.due < today })),
    ),
    ...ofCourse.flatMap(s =>
      s.exams.filter(x => x.date >= today && x.grade === null).map(x => ({ kind: "exam" as const, path: x.path, title: x.title, day: x.date, subject: s.title, late: false })),
    ),
  ]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, UPCOMING);

  return (
    <div className="page study-home">
      <div className="page-inner stack">
        <div className="home-head">
          <h1>{t.area.school}</h1>
          <div className="row home-actions">
            <button className="btn ghost" onClick={props.onNewCourse}>
              <Plus size={16} /> <span className="hide-narrow">{t.school.newCourse}</span>
            </button>
            {course && (
              <button className="btn primary" onClick={props.onNewSubject}>
                <Plus size={18} /> {t.common.new}
              </button>
            )}
          </div>
        </div>
        {!course ? (
          <div className="stack">
            <p className="muted">{t.school.empty}</p>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={props.onNewCourse}>
              <Plus size={16} /> {t.school.newCourse}
            </button>
          </div>
        ) : (
          <>
            <div className="school-course">
              <CourseBar
                courses={props.courses}
                course={course}
                semester={props.semester}
                onCourse={props.onCourse}
                onSemester={props.onSemester}
                onTimetable={props.onTimetable}
                onSettings={props.onCourseSettings}
              />
            </div>
            <ClassesToday subjects={props.subjects} courses={props.courses} onOpen={props.onSubject} />
            {due > 0 && (
              <button className="today-card review-all" style={{ marginTop: 0 }} onClick={props.onReview}>
                <Layers size={18} />
                <span>{t.study.reviewAll(due)}</span>
              </button>
            )}
            {upcoming.length > 0 && (
              <section className="stack" style={{ gap: 6 }}>
                <h2>{t.school.upcoming}</h2>
                <ul className="list upcoming">
                  {upcoming.map(u => (
                    <li key={u.path}>
                      <button className="list-item upcoming-row" onClick={() => (u.kind === "exam" ? props.onExam(u.path) : props.onAssignment(u.path))}>
                        <span className="list-title">
                          {u.kind === "exam" ? <FileCheck2 size={15} className="muted" /> : <ClipboardCheck size={15} className="muted" />} {u.title}
                        </span>
                        <span className={`list-meta${u.late ? " err" : ""}`}>
                          {[u.kind === "exam" ? t.school.exam : t.school.assignment, u.subject, u.late ? t.school.late(dateLabel(u.day)) : dateLabel(u.day)].join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="stack" style={{ gap: 6 }}>
              <h2>{t.school.semesterSubjects(props.semester)}</h2>
              {props.semesterSubjects.length === 0 ? (
                <p className="muted">{t.school.noSubjects}</p>
              ) : (
                <ul className="subject-grid">
                  {props.semesterSubjects.map(s => (
                    <li key={s.path}>
                      <SchoolCard s={s} onOpen={props.onSubject} onMenu={props.onMenu} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SchoolCard(props: { s: Subject; onOpen(s: Subject): void; onMenu(s: Subject, at: { x: number; y: number }): void }) {
  const { s } = props;
  const hold = useHold((_, at) => props.onMenu(s, at));
  const meta = schoolMeta(s);
  return (
    <div className="subject-card" {...hold.handlers}>
      <button className="subject-card-main" onClick={() => !hold.eaten() && props.onOpen(s)}>
        <span className="list-title">
          {s.title}
          {s.result !== "taking" && <span className={`result-tag ${s.result}`}>{t.school.results[s.result]}</span>}
        </span>
        {scheduleMeta(s) && <span className="list-meta">{scheduleMeta(s)}</span>}
        {meta && <span className="list-meta">{meta}</span>}
      </button>
    </div>
  );
}
