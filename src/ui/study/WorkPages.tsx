import { useRef, useState } from "react";
import { ArrowLeft, ExternalLink, FileUp, Trash2, X } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { addFile, ASSIGNMENT_STATUSES, type Assignment } from "../../data/school";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { t } from "../../i18n";

// An assignment (fields, the files in its folder, a description) and an exam (date, room, grade,
// what to study). Both are opened from a school subject; back returns to its tab.

const numOrUndef = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

function Bar(props: { f: NoteFile; onBack(): void; deleteLabel: string; onDelete(): void }) {
  return (
    <div className="note-bar">
      <button className="btn ghost icon back keep" onClick={props.onBack} aria-label={t.common.back}>
        <ArrowLeft size={20} />
      </button>
      <span className={`note-status mono${props.f.status === "error" ? " err" : ""}`}>{props.f.note ? t.note.status[props.f.status] : ""}</span>
      <button className="btn ghost icon" title={props.deleteLabel} aria-label={props.deleteLabel} onClick={props.onDelete}>
        <Trash2 size={18} />
      </button>
    </div>
  );
}

function Title(props: { f: NoteFile; placeholder: string }) {
  const [title, setTitle] = useState(String(props.f.data().title ?? ""));
  return (
    <textarea
      className="task-title-input"
      rows={1}
      value={title}
      placeholder={props.placeholder}
      aria-label={props.placeholder}
      onChange={e => {
        const v = e.target.value.replace(/\n/g, " ");
        setTitle(v);
        props.f.editData({ title: v.trim() || undefined });
      }}
      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
    />
  );
}

/** Text input bound to one header field (saved a moment after typing stops). */
function TextField(props: { f: NoteFile; name: string; type?: string; numeric?: boolean; placeholder?: string }) {
  const [v, setV] = useState(String(props.f.data()[props.name] ?? ""));
  return (
    <input
      className="field"
      type={props.type ?? "text"}
      inputMode={props.numeric ? "decimal" : undefined}
      value={props.type === "date" ? v.slice(0, 10) : v}
      placeholder={props.placeholder}
      onChange={e => {
        setV(e.target.value);
        const x = e.target.value.trim();
        props.f.editData({ [props.name]: props.numeric ? numOrUndef(x) : x || undefined });
      }}
    />
  );
}

function Body(props: { f: NoteFile; label: string; placeholder: string }) {
  const { f } = props;
  return (
    <>
      <div className="task-notes-head">
        <span className="fl">{props.label}</span>
      </div>
      <div className="task-notes">
        <Editor key={f.rev} text={f.note!.body} onChange={f.setBody} onSaveNow={f.saveNow} placeholder={props.placeholder} />
      </div>
    </>
  );
}

export function AssignmentPage(props: { assignment: Assignment; onBack(): void; onDelete(): void }) {
  const a = props.assignment;
  const { notes, platform, bump, toast, confirmDelete } = useApp();
  const f = useNoteFile(a.path);
  useBack(true, props.onBack);
  const input = useRef<HTMLInputElement>(null);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const d = f.note ? f.data() : {};
  const group = d.group === true;
  const status = String(d.status ?? a.status);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      for (const file of Array.from(list)) await addFile(notes.storage, a.dir, file.name, new Uint8Array(await file.arrayBuffer()));
      bump();
      toast({ text: t.school.filesAdded(list.length) });
    } catch (e) {
      fail(e);
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  const open = (name: string) => platform.openFile?.(`${a.dir}/${name}`).catch(fail);
  const remove = async (name: string) => {
    const path = `${a.dir}/${name}`;
    if (!(await confirmDelete(name))) return;
    try {
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({ text: t.school.fileDeleted, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="note-editor">
      <Bar f={f} onBack={props.onBack} deleteLabel={t.school.deleteAssignment} onDelete={props.onDelete} />
      {f.note && (
        <div className="page task-page">
          <div className="page-inner stack">
            <Title f={f} placeholder={t.school.assignmentTitle} />
            <div className="task-fields">
              <span className="fl">{t.school.fStatus}</span>
              <select className="field" value={status} onChange={e => f.setData({ status: e.target.value })}>
                {ASSIGNMENT_STATUSES.map(x => (
                  <option key={x} value={x}>
                    {t.school.status[x]}
                  </option>
                ))}
              </select>
              <span className="fl">{t.school.fDue}</span>
              <TextField f={f} name="due" type="date" />
              <span className="fl">{t.school.fWho}</span>
              <div className="segmented">
                <button aria-pressed={!group} onClick={() => f.setData({ group: undefined })}>
                  {t.school.solo}
                </button>
                <button aria-pressed={group} onClick={() => f.setData({ group: true })}>
                  {t.school.groupWork}
                </button>
              </div>
              {group && (
                <>
                  <span className="fl">{t.school.fMembers}</span>
                  <TextField f={f} name="members" placeholder={t.school.membersHint} />
                </>
              )}
              <span className="fl">{t.school.fGrade}</span>
              <TextField f={f} name="grade" numeric placeholder="0–10" />
              <span className="fl">{t.school.fWeight}</span>
              <TextField f={f} name="weight" numeric placeholder="1" />
            </div>

            <div className="task-notes-head row" style={{ justifyContent: "space-between" }}>
              <h2>{t.school.filesTitle}</h2>
              <input ref={input} type="file" multiple hidden onChange={e => pick(e.target.files)} />
              <button className="btn ghost" onClick={() => input.current?.click()}>
                <FileUp size={16} /> {t.school.addFiles}
              </button>
            </div>
            {a.files.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {t.school.noFiles}
              </p>
            ) : (
              <ul className="list">
                {a.files.map(name => (
                  <li key={name} className="row file-row">
                    <button className="list-item" onClick={() => open(name)} disabled={!platform.openFile}>
                      <span className="list-title one-line">{name}</span>
                      <span className="list-meta">
                        <ExternalLink size={12} /> {t.school.openFile}
                      </span>
                    </button>
                    <button className="btn ghost icon" aria-label={t.common.delete} title={t.common.delete} onClick={() => remove(name)}>
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Body f={f} label={t.school.description} placeholder={t.school.descriptionHint} />
          </div>
        </div>
      )}
      {f.dialog}
    </div>
  );
}

export function ExamPage(props: { path: string; onBack(): void; onDelete(): void }) {
  const f = useNoteFile(props.path);
  useBack(true, props.onBack);
  return (
    <div className="note-editor">
      <Bar f={f} onBack={props.onBack} deleteLabel={t.school.deleteExam} onDelete={props.onDelete} />
      {f.note && (
        <div className="page task-page">
          <div className="page-inner stack">
            <Title f={f} placeholder={t.school.examTitle} />
            <div className="task-fields">
              <span className="fl">{t.school.fDate}</span>
              <TextField f={f} name="date" type="date" />
              <span className="fl">{t.school.fTime}</span>
              <TextField f={f} name="time" type="time" />
              <span className="fl">{t.school.fRoom}</span>
              <TextField f={f} name="room" />
              <span className="fl">{t.school.fGrade}</span>
              <TextField f={f} name="grade" numeric placeholder="0–10" />
              <span className="fl">{t.school.fWeight}</span>
              <TextField f={f} name="weight" numeric placeholder="1" />
            </div>
            <Body f={f} label={t.school.whatToStudy} placeholder={t.school.whatToStudyHint} />
          </div>
        </div>
      )}
      {f.dialog}
    </div>
  );
}
