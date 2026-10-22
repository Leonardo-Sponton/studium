import { useState } from "react";
import { ArrowLeft, CalendarClock, Trash2 } from "lucide-react";
import { isoDate } from "../../data/dates";
import { WEEKDAYS, weekdayOf, type Course, type Slot } from "../../data/school";
import { isSchool, type Subject } from "../../data/study";
import { Dialog } from "../Dialog";
import { useBack } from "../useBack";
import { useNoteFile } from "../useNoteFile";
import { t } from "../../i18n";

// School screens besides the subject page: new course, course settings, the weekly timetable,
// the "Classes today" card on Today, and the small "title + date" dialog for new items.

export function NewCourse(props: { onOk(f: { title: string; institution: string; semesters: number }): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  const [institution, setInstitution] = useState("");
  const [semesters, setSemesters] = useState("5");
  const n = Math.round(Number(semesters));
  const valid = title.trim() !== "" && n >= 1 && n <= 20;
  const ok = () => valid && props.onOk({ title, institution, semesters: n });
  return (
    <Dialog title={t.school.newCourse} onClose={props.onClose}>
      <input className="field" autoFocus value={title} placeholder={t.school.courseName} aria-label={t.school.courseName} onChange={e => setTitle(e.target.value)} />
      <input className="field" value={institution} placeholder={t.school.institution} aria-label={t.school.institution} onChange={e => setInstitution(e.target.value)} />
      <label className="row" style={{ gap: 8 }}>
        <span>{t.school.semestersCount}</span>
        <input className="field" style={{ width: 80 }} type="number" min={1} max={20} value={semesters} onChange={e => setSemesters(e.target.value)} />
      </label>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={!valid} onClick={ok}>
          {t.common.ok}
        </button>
      </div>
    </Dialog>
  );
}

/** "Title" + an optional date: new assignment (due date) or exam (date). */
export function NewDated(props: { title: string; placeholder: string; dateLabel: string; onOk(title: string, date: string): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const ok = () => title.trim() && props.onOk(title, date);
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <input
        className="field"
        autoFocus
        value={title}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ok()}
      />
      <label className="row" style={{ gap: 8 }}>
        <span>{props.dateLabel}</span>
        <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </label>
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

export function CoursePage(props: { course: Course; onBack(): void; onDelete(): void }) {
  const f = useNoteFile(props.course.path);
  useBack(true, props.onBack);
  const d = f.note ? f.data() : {};
  const [title, setTitle] = useState(props.course.title);
  const [institution, setInstitution] = useState(props.course.institution);
  const semesters = Number(d.semesters ?? props.course.semesters) || 1;
  const current = Math.min(Number(d.current ?? props.course.current) || 1, semesters);
  const numField = (name: string, value: number, min: number, max: number) => (
    <input
      className="field"
      style={{ width: 90 }}
      type="number"
      min={min}
      max={max}
      step="any"
      defaultValue={value}
      onChange={e => {
        const n = Number(e.target.value);
        if (e.target.value !== "" && n >= min && n <= max) f.editData({ [name]: n });
      }}
    />
  );
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back keep" onClick={props.onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="note-status mono">{f.note ? t.note.status[f.status] : ""}</span>
        <button className="btn ghost icon" title={t.school.deleteCourse} aria-label={t.school.deleteCourse} onClick={props.onDelete}>
          <Trash2 size={18} />
        </button>
      </div>
      {f.note && (
        <div className="page task-page">
          <div className="page-inner stack">
            <textarea
              className="task-title-input"
              rows={1}
              value={title}
              placeholder={t.school.courseName}
              aria-label={t.school.courseName}
              onChange={e => {
                setTitle(e.target.value.replace(/\n/g, " "));
                f.editData({ title: e.target.value.trim() || undefined });
              }}
            />
            <div className="task-fields">
              <span className="fl">{t.school.institution}</span>
              <input
                className="field"
                value={institution}
                onChange={e => {
                  setInstitution(e.target.value);
                  f.editData({ institution: e.target.value.trim() || undefined });
                }}
              />
              <span className="fl">{t.school.semestersCount}</span>
              {numField("semesters", semesters, 1, 20)}
              <span className="fl">{t.school.currentSemester}</span>
              <select className="field" value={current} onChange={e => f.setData({ current: Number(e.target.value) })}>
                {Array.from({ length: semesters }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>
                    {t.school.semesterN(n)}
                  </option>
                ))}
              </select>
              <span className="fl">{t.school.passMarkField}</span>
              {numField("pass", props.course.pass, 0, 10)}
              <span className="fl">{t.school.attendanceField}</span>
              {numField("attendance", props.course.attendance, 0, 100)}
            </div>
            <p className="muted small">{t.school.courseHint}</p>
          </div>
        </div>
      )}
      {f.dialog}
    </div>
  );
}

export interface ClassSlot {
  subject: Subject;
  slot: Slot;
}

/** Classes of the current semester of each course that are being taken, by weekday and time. */
export function weekClasses(subjects: Subject[], courses: Course[]): ClassSlot[] {
  const current = new Map(courses.map(c => [c.id, c.current]));
  return subjects
    .filter(s => isSchool(s) && s.result === "taking" && s.semester === current.get(s.course))
    .flatMap(subject => subject.schedule.map(slot => ({ subject, slot })))
    .sort((a, b) => WEEKDAYS.indexOf(a.slot.day) - WEEKDAYS.indexOf(b.slot.day) || a.slot.from.localeCompare(b.slot.from));
}

export function Timetable(props: { subjects: Subject[]; courses: Course[]; onBack(): void; onOpen(s: Subject): void }) {
  useBack(true, props.onBack);
  const all = weekClasses(props.subjects, props.courses);
  const today = weekdayOf(isoDate());
  // Monday to Friday always; the weekend only when there is a class.
  const days = WEEKDAYS.filter((d, i) => i < 5 || all.some(c => c.slot.day === d));
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back keep" onClick={props.onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="note-status">{t.school.timetable}</span>
      </div>
      <div className="page">
        {all.length === 0 ? (
          <p className="muted empty-note">{t.school.noTimetable}</p>
        ) : (
          <div className="timetable">
            {days.map(d => (
              <section key={d} className={`tt-day${d === today ? " today" : ""}`}>
                <h3>{t.school.daysLong[d]}</h3>
                {all
                  .filter(c => c.slot.day === d)
                  .map((c, i) => (
                    <button key={i} className="tt-class" onClick={() => props.onOpen(c.subject)}>
                      <span className="mono small">
                        {c.slot.from}–{c.slot.to}
                      </span>
                      <span className="list-title">{c.subject.title}</span>
                      <span className="list-meta">{[c.subject.room, c.subject.teacher].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** On Today: the classes of the day, in time order. Hidden when there are none. */
export function ClassesToday(props: { subjects: Subject[]; courses: Course[]; onOpen(s: Subject): void }) {
  const today = weekdayOf(isoDate());
  const list = weekClasses(props.subjects, props.courses).filter(c => c.slot.day === today);
  if (!list.length) return null;
  return (
    <div className="today-card classes-today" aria-label={t.school.classesToday}>
      <CalendarClock size={18} />
      <span className="what stack" style={{ gap: 4 }}>
        <span className="muted small">{t.school.classesToday}</span>
        {list.map((c, i) => (
          <button key={i} className="link-row" onClick={() => props.onOpen(c.subject)}>
            <span className="mono small">{c.slot.from}</span> <span>{c.subject.title}</span>
            {c.subject.room && <span className="muted small"> · {c.subject.room}</span>}
          </button>
        ))}
      </span>
    </div>
  );
}
