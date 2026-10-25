import { useRef, useState } from "react";
import { Brain, ChevronRight, Circle, CircleCheck, Ellipsis, FilePlus2, FolderInput, Library, NotebookPen, PenLine, Sparkles } from "lucide-react";
import { importFolder, nextChapterPrefix, notebookAt, notebookOf, setFinished, type ImportMode, type Pick } from "../../data/notebook";
import type { PickedFile } from "../../data/drawings";
import type { StudyNote, Subject } from "../../data/study";
import { AskText, Dialog } from "../Dialog";
import { useApp } from "../context";
import { menuPointOf } from "../ContextMenu";
import { useHold } from "../useHold";
import { PointBadge } from "./Recall";
import { t } from "../../i18n";

// "My notebook" on a subject's page (data/notebook): the numbered notes in order, where reading
// stopped, the chapters still to write, a circle to mark one finished and the note's menu; bringing an Obsidian folder in; and the few things
// suggested for today (TodayPicks), with no counts.

export function NotebookBox(props: {
  subject: Subject;
  all: Subject[];
  onNote(path: string): void;
  onNewNote(title: string): void;
  /** The note's menu (the same as its row in the tree), at the pointer. */
  onMenu(n: StudyNote, at: { x: number; y: number }): void;
}) {
  const s = props.subject;
  const book = notebookOf(s);
  const at = notebookAt(s);
  const [importing, setImporting] = useState(false);
  const [naming, setNaming] = useState(false);
  return (
    <section className="stack subj-notebook" style={{ gap: 8 }} aria-labelledby="notebook-h">
      <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
        <h2 className="subj-h" id="notebook-h" style={{ flex: 1 }}>
          {t.notebook.title}
        </h2>
        <button className="btn ghost" onClick={() => setImporting(true)}>
          <FolderInput size={16} /> <span className="hide-narrow">{t.notebook.import}</span>
        </button>
        <button className="btn ghost" onClick={() => setNaming(true)}>
          <FilePlus2 size={16} /> <span className="hide-narrow">{t.notebook.newChapter}</span>
        </button>
      </div>
      {book.length === 0 ? (
        <p className="muted small">{t.notebook.emptyHint}</p>
      ) : (
        <>
          <ol className="notebook-list">
            {book.map(n => (
              <NotebookRow key={n.path} n={n} here={n === at} onOpen={props.onNote} onMenu={props.onMenu} />
            ))}
          </ol>
          <p className="muted small">{t.notebook.rowHint}</p>
        </>
      )}
      {importing && <ImportFolder subject={s} all={props.all} onClose={() => setImporting(false)} />}
      {naming && (
        <AskText
          title={t.notebook.newChapter}
          initial={nextChapterPrefix(s)}
          placeholder={t.notebook.chapterName}
          onClose={() => setNaming(false)}
          onOk={title => {
            setNaming(false);
            props.onNewNote(title);
          }}
        />
      )}
    </section>
  );
}

/** A chapter: the circle marks it finished, a click opens it, right-click / hold / ⋯ give its menu. */
function NotebookRow(props: { n: StudyNote; here: boolean; onOpen(path: string): void; onMenu(n: StudyNote, at: { x: number; y: number }): void }) {
  const { n } = props;
  const { notes, bump, toast } = useApp();
  const hold = useHold((_, at) => props.onMenu(n, at));
  const hard = n.points.some(p => p.kind === "difficulty");
  const toggle = () =>
    void setFinished(notes, n.path, !n.finished).then(bump, e => toast({ text: e instanceof Error ? e.message : String(e), error: true }));
  const mark = n.finished ? t.notebook.unfinish : t.notebook.finish;
  return (
    <li className={`notebook-row${props.here ? " here" : ""}${n.empty ? " todo" : ""}${n.finished ? " finished" : ""}`} {...hold.handlers}>
      <button className="btn ghost icon notebook-check" role="checkbox" aria-checked={n.finished} title={mark} aria-label={`${mark}: ${n.title}`} onClick={toggle}>
        {n.finished ? <CircleCheck size={18} /> : <Circle size={18} />}
      </button>
      <button className="notebook-name" onClick={() => !hold.eaten() && props.onOpen(n.path)}>
        <span className="one-line">{n.title}</span>
        {props.here && <span className="small here-tag">{t.study.stoppedHere}</span>}
        {n.empty && <span className="small muted">{t.notebook.toWrite}</span>}
        {hard && <PointBadge kind="difficulty" />}
      </button>
      <button className="btn ghost icon notebook-more" title={t.common.more} aria-label={`${t.common.more}: ${n.title}`} onClick={e => props.onMenu(n, menuPointOf(e.currentTarget))}>
        <Ellipsis size={17} />
      </button>
    </li>
  );
}

/** A picked file as data/drawings reads it: its path inside the folder, read on demand. */
const asPicked = (f: File): PickedFile => ({
  path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
  read: async () => new Uint8Array(await f.arrayBuffer()),
});

export function ImportFolder(props: { subject: Subject; all: Subject[]; onClose(): void }) {
  const { notes, bump, toast } = useApp();
  const [mode, setMode] = useState<ImportMode>("notebook");
  const [busy, setBusy] = useState(false);
  const folder = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);

  const run = async (fileList: FileList | null) => {
    // Copied first: clearing the input empties its list.
    const list = Array.from(fileList ?? []);
    if (folder.current) folder.current.value = "";
    if (files.current) files.current.value = "";
    if (!list.length) return;
    setBusy(true);
    try {
      const r = await importFolder(notes, props.subject, props.all, list.map(asPicked), mode);
      bump();
      toast({ text: mode === "material" ? t.notebook.importedMaterial : t.notebook.imported(r) });
      props.onClose();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const choice = (m: ImportMode, icon: React.ReactNode, title: string, hint: string) => (
    <label className={`import-choice${mode === m ? " on" : ""}`}>
      <input type="radio" name="import-mode" checked={mode === m} onChange={() => setMode(m)} />
      <span className="subj-panel-icon">{icon}</span>
      <span className="stack" style={{ gap: 2 }}>
        <span className="list-title">{title}</span>
        <span className="small muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <Dialog title={t.notebook.importTitle(props.subject.title)} onClose={props.onClose}>
      <div className="stack" style={{ gap: 10 }}>
        <p className="small muted">{t.notebook.importHint}</p>
        {choice("notebook", <NotebookPen size={18} />, t.notebook.asNotebook, t.notebook.asNotebookHint)}
        {choice("material", <Library size={18} />, t.notebook.asMaterial, t.notebook.asMaterialHint)}
        <input ref={folder} type="file" hidden multiple {...{ webkitdirectory: "", directory: "" }} onChange={e => run(e.target.files)} />
        <input ref={files} type="file" hidden multiple accept=".md,.markdown,image/*,.pdf,.excalidraw" onChange={e => run(e.target.files)} />
        <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" disabled={busy} onClick={() => files.current?.click()}>
            {t.notebook.pickFiles}
          </button>
          <button className="btn primary" disabled={busy} onClick={() => folder.current?.click()}>
            <FolderInput size={16} /> {busy ? t.notebook.importing : t.notebook.pickFolder}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Up to three things for today (data/notebook todayPicks); nothing when there is nothing. */
export function TodayPicks(props: { picks: Pick[]; onPick(p: Pick): void; showSubject?: boolean }) {
  if (!props.picks.length) return null;
  const row = (p: Pick) => {
    const where = props.showSubject ? p.subject.title : "";
    switch (p.kind) {
      case "continue-material":
        return { icon: <ChevronRight size={18} />, kicker: t.study.continueReading, title: p.title || t.study.chapter(p.chapter), meta: [p.material.title, where] };
      case "continue-notebook":
        return { icon: <PenLine size={18} />, kicker: t.study.continueReading, title: p.note.title, meta: [t.notebook.title, where] };
      case "recall":
        return { icon: <Brain size={18} />, kicker: t.picks.recall, title: p.note.title, meta: [p.due ? t.picks.recallDue : t.picks.recallFresh, where] };
      case "todo":
        return { icon: <Sparkles size={18} />, kicker: t.picks.todo, title: p.note.title, meta: [where] };
    }
  };
  return (
    <section className="today-picks" aria-label={t.picks.title}>
      {props.picks.map(p => {
        const r = row(p);
        const key = p.kind + ("note" in p ? p.note.path : p.material.path);
        return (
          <button key={key} className={`subj-panel pick pick-${p.kind}`} onClick={() => props.onPick(p)}>
            <span className="subj-panel-icon">{r.icon}</span>
            <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <span className="subj-kicker">{r.kicker}</span>
              <span className="list-title one-line">{r.title}</span>
              <span className="list-meta one-line">{r.meta.filter(Boolean).join(" · ")}</span>
            </span>
            <ChevronRight size={18} className="muted" />
          </button>
        );
      })}
    </section>
  );
}
