import { useRef, useState } from "react";
import { ExternalLink, FileText, FileUp, NotebookPen, Trash2 } from "lucide-react";
import { addPdf, type Subject } from "../../data/study";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useApp } from "../context";
import { TitleFiles, titledName, type TitledFile } from "./TitleFiles";
import { t } from "../../i18n";

// A subject's PDFs (data/study pdfs/): added from a file, opened in the device's PDF app (the
// PC's viewer, or the phone's). Each one can get a study note, like a chapter of a material.

const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function PdfBox(props: { subject: Subject; onNote(pdf: string): void; heading?: React.ReactNode }) {
  const { notes, platform, bump, toast, confirmDelete } = useApp();
  const s = props.subject;
  const input = useRef<HTMLInputElement>(null);
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
      for (const f of list) await addPdf(notes, s.dir, titledName(f), new Uint8Array(await f.file.arrayBuffer()));
      bump();
      toast({ text: t.study.pdfsAdded(list.length) });
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (path: string, title: string) => {
    if (!(await confirmDelete(title))) return;
    try {
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({ text: t.study.pdfDeleted, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <div className={props.heading ? "subj-sub-head" : "task-notes-head row"} style={{ justifyContent: props.heading ? "space-between" : "flex-end" }}>
        {props.heading}
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => pick(e.target.files)} />
        <button className="btn ghost" onClick={() => input.current?.click()}>
          <FileUp size={16} /> {t.study.addPdf}
        </button>
      </div>
      {s.pdfs.length === 0 ? (
        <p className="muted small">{t.study.noPdfs}</p>
      ) : (
        <ul className="list">
          {s.pdfs.map(p => {
            const count = s.notes.filter(n => n.pdf === p.name).length;
            return (
              <li key={p.path} className="link-row">
                <button className="list-item" onClick={() => platform.openFile?.(p.path).catch(fail)} disabled={!platform.openFile} title={p.name}>
                  <span className="list-title">
                    <FileText size={14} className="muted" /> {p.title}
                  </span>
                  <span className="list-meta mono">
                    {[sizeText(p.size), count ? t.study.notesCount(count) : ""].filter(Boolean).join(" · ")} <ExternalLink size={12} />
                  </span>
                </button>
                <button className="btn ghost icon" title={t.study.noteOnPdf} aria-label={t.study.noteOnPdf} onClick={() => props.onNote(p.name)}>
                  <NotebookPen size={16} />
                </button>
                <button className="btn ghost icon" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(p.path, p.title)}>
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked && <TitleFiles files={picked} heading={t.study.addPdf} onOk={add} onClose={() => setPicked(null)} />}
    </>
  );
}
