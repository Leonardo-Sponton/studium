import { useState } from "react";
import { ArrowLeft, Minus, NotebookPen, Paperclip, Plus, Trash2, X } from "lucide-react";
import { isoDate } from "../../data/dates";
import {
  absenceLimit,
  average,
  CLASS_RESULTS,
  neededGrade,
  slotText,
  totalHours,
  WEEKDAYS,
  type Course,
  type Slot,
} from "../../data/school";
import { cardCount, dueCards, progress, type Subject } from "../../data/study";
import { useBack } from "../useBack";
import { useNoteFile } from "../useNoteFile";
import { Progress } from "./MaterialReader";
import { CardsBox, daysTo } from "./SubjectPage";
import { LinksBox } from "./LinksBox";
import { dateLabel, gradeText } from "./school-ui";
import { num, t } from "../../i18n";

// A school subject: tabs for the overview (class details, attendance, grades), the classes
// (one note per class), the handouts (materials), assignments, exams and flashcards.

export type SchoolTab = "overview" | "classes" | "handouts" | "links" | "work" | "exams" | "cards";
export const SCHOOL_TABS: SchoolTab[] = ["overview", "classes", "handouts", "links", "work", "exams", "cards"];

interface Props {
  subject: Subject;
  course?: Course;
  tab: SchoolTab;
  onTab(tab: SchoolTab): void;
  onBack(): void;
  onSyllabus(): void;
  onMaterial(path: string): void;
  onAddMaterial(): void;
  onNote(path: string): void;
  onNewClass(): void;
  onAssignment(path: string): void;
  onNewAssignment(): void;
  onExam(path: string): void;
  onNewExam(): void;
  onReview(): void;
  onAddCard(): void;
  onDelete(): void;
}

export function SchoolSubject(props: Props) {
  const s = props.subject;
  const f = useNoteFile(s.path);
  useBack(true, props.onBack);
  const [title, setTitle] = useState(s.title);

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back keep" onClick={props.onBack} aria-label={t.common.back}>
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
            placeholder={t.school.subjectName}
            aria-label={t.study.subjectName2}
            onChange={e => {
              const v = e.target.value.replace(/\n/g, " ");
              setTitle(v);
              f.editData({ title: v.trim() || undefined });
            }}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
          />
          <div className="chips school-tabs" role="tablist">
            {SCHOOL_TABS.map(x => (
              <button key={x} role="tab" aria-selected={props.tab === x} className={`chip${props.tab === x ? " active" : ""}`} onClick={() => props.onTab(x)}>
                {t.school.tabs[x]}
                {tabCount(s, x) > 0 && <span className="muted mono small">{tabCount(s, x)}</span>}
              </button>
            ))}
          </div>
          {props.tab === "overview" && f.note && <Overview {...props} f={f} />}
          {props.tab === "classes" && <Classes {...props} />}
          {props.tab === "handouts" && <Handouts {...props} />}
          {props.tab === "links" && <LinksBox dir={s.dir} links={s.links} />}
          {props.tab === "work" && <Work {...props} />}
          {props.tab === "exams" && <Exams {...props} />}
          {props.tab === "cards" && <Cards {...props} />}
        </div>
      </div>
      {f.dialog}
    </div>
  );
}

function tabCount(s: Subject, tab: SchoolTab): number {
  if (tab === "classes") return s.notes.filter(n => n.kind === "class").length;
  if (tab === "handouts") return s.materials.length;
  if (tab === "links") return s.links.length;
  if (tab === "work") return s.assignments.length;
  if (tab === "exams") return s.exams.length;
  if (tab === "cards") return cardCount(s);
  return 0;
}

function Overview(props: Props & { f: ReturnType<typeof useNoteFile> }) {
  const { subject: s, course, f } = props;
  const d = f.data();
  const [teacher, setTeacher] = useState(String(d.teacher ?? ""));
  const [room, setRoom] = useState(String(d.room ?? ""));
  const [hoursWeek, setHoursWeek] = useState(String(d.hours_week ?? ""));
  const [hoursTotal, setHoursTotal] = useState(String(d.hours_total ?? ""));
  const [slots, setSlots] = useState<Slot[]>(s.schedule);
  const absences = Number(d.absences ?? 0) || 0;
  const result = String(d.result ?? "taking");
  const semester = Number(d.semester ?? s.semester ?? 1);

  const writeSlots = (next: Slot[]) => {
    setSlots(next);
    f.editData({ schedule: next.length ? next.map(slotText) : undefined });
  };
  const numOrUndef = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const total = totalHours(numOrUndef(hoursTotal) ?? null, numOrUndef(hoursWeek) ?? null);
  const limit = absenceLimit(total, course?.attendance ?? 75);
  const graded = [...s.assignments, ...s.exams];
  const avg = average(graded);
  const pass = course?.pass ?? 6;
  const need = neededGrade(graded, pass);

  return (
    <>
      <div className="task-fields">
        <span className="fl">{t.school.fTeacher}</span>
        <input
          className="field"
          value={teacher}
          onChange={e => {
            setTeacher(e.target.value);
            f.editData({ teacher: e.target.value.trim() || undefined });
          }}
        />
        <span className="fl">{t.school.fRoom}</span>
        <input
          className="field"
          value={room}
          onChange={e => {
            setRoom(e.target.value);
            f.editData({ room: e.target.value.trim() || undefined });
          }}
        />
        <span className="fl">{t.school.fHoursWeek}</span>
        <input
          className="field"
          inputMode="decimal"
          value={hoursWeek}
          onChange={e => {
            setHoursWeek(e.target.value);
            f.editData({ hours_week: numOrUndef(e.target.value) });
          }}
        />
        <span className="fl">{t.school.fHoursTotal}</span>
        <input
          className="field"
          inputMode="decimal"
          value={hoursTotal}
          placeholder={total !== null && !hoursTotal ? t.school.hoursGuess(total) : ""}
          onChange={e => {
            setHoursTotal(e.target.value);
            f.editData({ hours_total: numOrUndef(e.target.value) });
          }}
        />
        <span className="fl">{t.school.fSchedule}</span>
        <div className="stack" style={{ gap: 6 }}>
          {slots.map((x, i) => (
            <div key={i} className="row slot-row">
              <select
                className="field"
                value={x.day}
                aria-label={t.school.day}
                onChange={e => writeSlots(slots.map((y, j) => (j === i ? { ...y, day: e.target.value as Slot["day"] } : y)))}
              >
                {WEEKDAYS.map(w => (
                  <option key={w} value={w}>
                    {t.school.days[w]}
                  </option>
                ))}
              </select>
              <input
                className="field"
                type="time"
                value={x.from}
                aria-label={t.school.from}
                onChange={e => e.target.value && writeSlots(slots.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)))}
              />
              <input
                className="field"
                type="time"
                value={x.to}
                aria-label={t.school.to}
                onChange={e => e.target.value && writeSlots(slots.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)))}
              />
              <button className="btn ghost icon" aria-label={t.common.delete} onClick={() => writeSlots(slots.filter((_, j) => j !== i))}>
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            className="btn ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={() => writeSlots([...slots, slots.at(-1) ? { ...slots.at(-1)! } : { day: "mon", from: "19:00", to: "20:40" }])}
          >
            <Plus size={16} /> {t.school.addTime}
          </button>
        </div>
        <span className="fl">{t.school.fSemester}</span>
        <select className="field" value={semester} onChange={e => f.setData({ semester: Number(e.target.value) })}>
          {Array.from({ length: course?.semesters ?? Math.max(semester, 1) }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>
              {t.school.semesterN(n)}
            </option>
          ))}
        </select>
        <span className="fl">{t.school.fResult}</span>
        <div className="segmented">
          {CLASS_RESULTS.map(r => (
            <button key={r} aria-pressed={result === r} onClick={() => f.setData({ result: r })}>
              {t.school.results[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="school-box">
        <h3>{t.school.attendance}</h3>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <button className="btn icon" aria-label={t.school.lessAbsence} disabled={absences <= 0} onClick={() => f.setData({ absences: absences - 1 || undefined })}>
            <Minus size={16} />
          </button>
          <span className="mono absences">{num(absences)}</span>
          <button className="btn icon" aria-label={t.school.moreAbsence} onClick={() => f.setData({ absences: absences + 1 })}>
            <Plus size={16} />
          </button>
          <span className={limit !== null && absences > limit ? "err" : "muted"}>{t.school.absencesOf(absences, limit)}</span>
        </div>
        {limit !== null && absences > limit && <p className="err small" style={{ margin: 0 }}>{t.school.overLimit}</p>}
      </div>

      <div className="school-box">
        <h3>{t.school.grades}</h3>
        {graded.some(x => x.grade !== null) || graded.length ? (
          <table className="md-table grades">
            <tbody>
              {graded.map(x => (
                <tr key={x.path}>
                  <td>{x.title}</td>
                  <td className="mono">{x.grade === null ? "—" : gradeText(x.grade)}</td>
                  <td className="muted small">{x.weight !== 1 ? t.school.weightN(x.weight) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            {t.school.noGrades}
          </p>
        )}
        <p style={{ margin: 0 }}>
          {avg === null ? (
            <span className="muted">{t.school.noAverage}</span>
          ) : (
            <>
              <strong>{t.school.averageIs(gradeText(avg))}</strong>{" "}
              <span className={avg >= pass ? "muted" : "err"}>· {t.school.passMark(gradeText(pass))}</span>
            </>
          )}
        </p>
        {need !== null && avg !== null && <p className="muted small" style={{ margin: 0 }}>{need > 10 ? t.school.cannotPass : t.school.needs(gradeText(need))}</p>}
      </div>

      <button className="list-item summary-row" onClick={props.onSyllabus}>
        <span className="list-title">{t.school.syllabus}</span>
        <span className="list-meta">{t.school.syllabusHint}</span>
        {!s.hasSummary && <span className="list-meta here-tag">{t.study.summaryEmpty}</span>}
      </button>
    </>
  );
}

function Head(props: { title: string; add: string; onAdd(): void; icon?: React.ReactNode }) {
  return (
    <div className="task-notes-head row" style={{ justifyContent: "space-between" }}>
      <h2>{props.title}</h2>
      <button className="btn ghost" onClick={props.onAdd}>
        {props.icon ?? <Plus size={16} />} {props.add}
      </button>
    </div>
  );
}

function Classes(props: Props) {
  const list = props.subject.notes.filter(n => n.kind === "class").sort((a, b) => (b.date || b.created).localeCompare(a.date || a.created));
  return (
    <>
      <Head title={t.school.tabs.classes} add={t.school.newClass} icon={<NotebookPen size={16} />} onAdd={props.onNewClass} />
      {list.length === 0 ? (
        <p className="muted small">{t.school.noClasses}</p>
      ) : (
        <ul className="list">
          {list.map(n => (
            <li key={n.path}>
              <button className="list-item" onClick={() => props.onNote(n.path)}>
                <span className="list-title">{n.title || <span className="muted">{t.common.untitled}</span>}</span>
                {n.preview && <span className="note-preview">{n.preview}</span>}
                <span className="list-meta">{[n.date && dateLabel(n.date), n.cards.length ? t.study.cards(n.cards.length) : ""].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Handouts(props: Props) {
  const s = props.subject;
  const other = s.notes.filter(n => n.kind === "note");
  return (
    <>
      <Head title={t.school.tabs.handouts} add={t.study.addMaterial} onAdd={props.onAddMaterial} />
      {s.materials.length === 0 ? (
        <p className="muted small">{t.school.noHandouts}</p>
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
      {other.length > 0 && (
        <>
          <h3 className="section-head">{t.school.handoutNotes}</h3>
          <ul className="list">
            {other.map(n => (
              <li key={n.path}>
                <button className="list-item" onClick={() => props.onNote(n.path)}>
                  <span className="list-title">{n.title || <span className="muted">{t.common.untitled}</span>}</span>
                  {n.preview && <span className="note-preview">{n.preview}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Work(props: Props) {
  const list = props.subject.assignments;
  return (
    <>
      <Head title={t.school.tabs.work} add={t.school.newAssignment} onAdd={props.onNewAssignment} />
      {list.length === 0 ? (
        <p className="muted small">{t.school.noAssignments}</p>
      ) : (
        <ul className="list">
          {list.map(a => (
            <li key={a.path}>
              <button className="list-item" onClick={() => props.onAssignment(a.path)}>
                <span className="list-title">{a.title}</span>
                <span className="list-meta">
                  {[
                    t.school.status[a.status],
                    a.due && dueText(a.due, a.status === "todo" || a.status === "doing"),
                    a.group ? t.school.groupWork : "",
                    a.grade !== null ? t.school.gradeIs(gradeText(a.grade)) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {a.files.length > 0 && (
                  <span className="list-meta">
                    <Paperclip size={12} /> {t.school.files(a.files.length)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** "Due Fri 24 Oct · in 3 days" (only counts days for open work). */
function dueText(day: string, open: boolean) {
  const n = daysTo(day, isoDate());
  return open ? `${t.school.dueOn(dateLabel(day))} · ${t.school.inDays(n)}` : t.school.dueOn(dateLabel(day));
}

function Exams(props: Props) {
  const list = props.subject.exams;
  return (
    <>
      <Head title={t.school.tabs.exams} add={t.school.newExam} onAdd={props.onNewExam} />
      {list.length === 0 ? (
        <p className="muted small">{t.school.noExams}</p>
      ) : (
        <ul className="list">
          {list.map(x => (
            <li key={x.path}>
              <button className="list-item" onClick={() => props.onExam(x.path)}>
                <span className="list-title">{x.title}</span>
                <span className="list-meta">
                  {[
                    x.date && dateLabel(x.date),
                    x.time,
                    x.room,
                    x.grade !== null ? t.school.gradeIs(gradeText(x.grade)) : x.date && daysTo(x.date) >= 0 ? t.school.inDays(daysTo(x.date)) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Cards(props: Props) {
  const s = props.subject;
  const withCards = s.notes.filter(n => n.cards.length);
  return (
    <>
      <CardsBox cards={cardCount(s)} due={dueCards([s]).length} onReview={props.onReview} onAdd={props.onAddCard} />
      {withCards.length === 0 ? (
        <p className="muted small">{t.school.noCards}</p>
      ) : (
        <ul className="list">
          {withCards.map(n => (
            <li key={n.path}>
              <button className="list-item" onClick={() => props.onNote(n.path)}>
                <span className="list-title">{n.title || t.common.untitled}</span>
                <span className="list-meta">{t.study.cards(n.cards.length)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
