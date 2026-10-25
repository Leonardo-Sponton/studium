import { useRef, useState } from "react";
import { ExternalLink, FilePlus2, FileType2, FileUp, Trash2 } from "lucide-react";
import { addExerciseFile, EXERCISES_DIR, type Subject } from "../../data/study";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { Dialog } from "../Dialog";
import { useApp } from "../context";
import { LinksBox } from "./LinksBox";
import { TitleFiles, titledName, type TitledFile } from "./TitleFiles";
import { t } from "../../i18n";

// A subject's exercises (data/study exercises/): lists written in the app or imported as .md
// (opened in the editor), PDFs (opened in the device's PDF app) and links to exercise sites.

export function ExercisesBox(props: { subject: Subject; onOpen(path: string): void; onNew(title: string): void; heading?: React.ReactNode }) {
  const { notes, platform, bump, toast, confirmDelete } = useApp();
  const s = props.subject;
  const ex = s.exercises;
  const input = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState(false);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  // Picked files wait here for their titles.
  const [picked, setPicked] = useState<File[] | null>(null);

  const pick = (list: FileList | null) => {
    if (list?.length) setPicked(Array.from(list));
    if (input.current) input.current.value = "";
  };
  const add = async (list: TitledFile[]) => {
    setPicked(null);
    try {
      for (const f of list) await addExerciseFile(notes, s.dir, titledName(f), new Uint8Array(await f.file.arrayBuffer()), f.title);
      bump();
      toast({ text: t.study.exerciseFilesAdded(list.length) });
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (path: string, title: string) => {
    if (!(await confirmDelete(title))) return;
    try {
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({ text: t.study.exerciseDeleted, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <div className={props.heading ? "subj-sub-head" : "task-notes-head row"} style={{ justifyContent: props.heading ? "space-between" : "flex-end", flexWrap: "wrap", gap: 4 }}>
        {props.heading}
        <input ref={input} type="file" accept=".md,.markdown,text/markdown,application/pdf,.pdf" multiple hidden onChange={e => pick(e.target.files)} />
        <button className="btn ghost" onClick={() => setNaming(true)}>
          <FilePlus2 size={16} /> {t.study.newExercise}
        </button>
        <button className="btn ghost" onClick={() => input.current?.click()}>
          <FileUp size={16} /> {t.study.addExerciseFile}
        </button>
      </div>
      {ex.docs.length + ex.pdfs.length === 0 ? (
        <p className="muted small">{t.study.noExercises}</p>
      ) : (
        <ul className="list">
          {ex.docs.map(d => (
            <li key={d.path} className="link-row">
              <button className="list-item" onClick={() => props.onOpen(d.path)}>
                <span className="list-title">
                  <span className="note-tag ex-tag md">.md</span>
                  {d.title}
                </span>
                {d.preview && <span className="note-preview">{d.preview}</span>}
              </button>
              <button className="btn ghost icon" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(d.path, d.title)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {ex.pdfs.map(p => (
            <li key={p.path} className="link-row">
              <button className="list-item" onClick={() => platform.openFile?.(p.path).catch(fail)} disabled={!platform.openFile} title={p.name}>
                <span className="list-title">
                  <span className="note-tag ex-tag pdf">PDF</span>
                  {p.title}
                </span>
                <span className="list-meta mono">
                  <FileType2 size={12} /> {p.name} <ExternalLink size={12} />
                </span>
              </button>
              <button className="btn ghost icon" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(p.path, p.title)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="exercise-group stack" style={{ gap: 8 }}>
        <LinksBox dir={`${s.dir}/${EXERCISES_DIR}`} links={ex.links} heading={t.study.exerciseLinks} empty={t.study.noExerciseLinks} />
      </div>
      {picked && <TitleFiles files={picked} heading={t.study.addExerciseFile} onOk={add} onClose={() => setPicked(null)} />}
      {naming && (
        <NameDialog
          onOk={title => {
            setNaming(false);
            props.onNew(title);
          }}
          onClose={() => setNaming(false)}
        />
      )}
    </>
  );
}

function NameDialog(props: { onOk(title: string): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  const ok = () => title.trim() && props.onOk(title.trim());
  return (
    <Dialog title={t.study.newExercise} onClose={props.onClose}>
      <input
        className="field"
        autoFocus
        value={title}
        placeholder={t.study.exerciseTitle}
        aria-label={t.study.exerciseTitle}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ok()}
      />
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
