import { useRef, useState } from "react";
import { ArrowLeft, Eraser, ExternalLink, FileUp, FolderGit2, Hammer, Map as MapIcon, PencilRuler, Plus, Rocket, Trash2, X } from "lucide-react";
import { webLink } from "../../data/weblink";
import { GUIDES, guideBody, stripComments, type Guide, type GuideId } from "../../data/guides";
import {
  addProjectFile,
  DESCRIPTION_MAX,
  statusPatch,
  WORKBENCH_STATUSES,
  type Subject,
  type WorkbenchProject,
  type WorkbenchStatus,
} from "../../data/study";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { Editor } from "../../editor/Editor";
import { Dialog } from "../Dialog";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { LinksBox } from "./LinksBox";
import { TitleFiles, titledName, type TitledFile } from "./TitleFiles";
import { t, word } from "../../i18n";

// Workbench (data/study workbench/): projects made to study a subject in depth. The subject page
// lists them (WorkbenchBox); a project page has its description, status, the draw.io model, the
// GitHub repository, a demo, more links, files and the project notes. The notes start from a
// guide (data/guides: standard, small, medium, large, proof of concept, clone), picked when the
// project is made or later from the Guides button; its hints are %%comments%% removed in one tap.

const DRAWIO_NEW = "https://app.diagrams.net/";

/** The workbench section of a subject page. */
export function WorkbenchBox(props: { subject: Subject; onOpen(path: string): void; onNew(): void }) {
  const list = props.subject.workbench;
  return (
    <section className="workbench stack">
      <div className="task-notes-head row" style={{ justifyContent: "space-between" }}>
        <h2>
          <Hammer size={18} className="muted" /> {t.study.workbench}
        </h2>
        <button className="btn ghost" onClick={props.onNew}>
          <Plus size={16} /> {t.study.newProject}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="muted small">{t.study.noProjects}</p>
      ) : (
        <ul className="wb-list">
          {list.map(p => (
            <li key={p.path}>
              <ProjectCard p={p} onOpen={() => props.onOpen(p.path)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectCard(props: { p: WorkbenchProject; onOpen(): void }) {
  const { p } = props;
  return (
    <button className="wb-card" onClick={props.onOpen}>
      <span className="wb-card-head">
        <span className="list-title">{p.title}</span>
        <span className={`wb-status ${p.status}`}>{t.study.wbStatus[p.status]}</span>
      </span>
      {p.description ? <span className="wb-desc">{p.description}</span> : <span className="wb-desc muted">{t.study.noDescription}</span>}
      <span className="list-meta wb-meta">
        {p.drawio && (
          <span title="draw.io">
            <PencilRuler size={13} /> draw.io
          </span>
        )}
        {p.github && (
          <span title="GitHub">
            <FolderGit2 size={13} /> GitHub
          </span>
        )}
        {p.links.length > 0 && <span>{t.study.linksCount(p.links.length)}</span>}
        {p.files.length > 0 && <span>{t.study.filesCount(p.files.length)}</span>}
      </span>
    </button>
  );
}

/** Title + description (with the characters left), for a new project. */
export function NewProject(props: { onOk(title: string, description: string, guide: GuideId | ""): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [guide, setGuide] = useState<GuideId | "">("standard");
  const ok = () => title.trim() && props.onOk(title, desc, guide);
  return (
    <Dialog title={t.study.newProject} onClose={props.onClose}>
      <input
        className="field"
        autoFocus
        value={title}
        placeholder={t.study.projectTitle}
        aria-label={t.study.projectTitle}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ok()}
      />
      <DescriptionInput value={desc} onChange={setDesc} />
      <label className="stack" style={{ gap: 4 }}>
        <span className="fl">{t.study.guideField}</span>
        <select className="field" value={guide} onChange={e => setGuide(e.target.value as GuideId | "")}>
          {GUIDES.map(g => (
            <option key={g.id} value={g.id}>
              {word(g.name)} · {word(g.size)}
            </option>
          ))}
          <option value="">{t.study.guideBlank}</option>
        </select>
        {guide && <span className="muted small">{word(GUIDES.find(g => g.id === guide)!.when)}</span>}
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

function DescriptionInput(props: { value: string; onChange(v: string): void }) {
  const left = DESCRIPTION_MAX - props.value.length;
  return (
    <div className="wb-desc-input">
      <textarea
        className="field"
        rows={4}
        maxLength={DESCRIPTION_MAX}
        value={props.value}
        placeholder={t.study.projectDescription}
        aria-label={t.study.projectDescription}
        onChange={e => props.onChange(e.target.value.slice(0, DESCRIPTION_MAX))}
      />
      <span className={`muted small mono wb-count${left <= 20 ? " low" : ""}`}>
        {props.value.length}/{DESCRIPTION_MAX}
      </span>
    </div>
  );
}

/** A link kept in one header field, with a button that opens it (or `empty` when there is none). */
function UrlField(props: { f: NoteFile; name: string; label: string; icon: React.ReactNode; placeholder: string; empty?: { label: string; url: string } }) {
  const { platform, toast } = useApp();
  const [v, setV] = useState(String(props.f.data()[props.name] ?? ""));
  const href = webLink(v);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const go = (url: string) => platform.openLink?.(url).catch(fail);
  return (
    <div className="wb-url">
      <span className="fl">
        {props.icon} {props.label}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="field"
          inputMode="url"
          value={v}
          placeholder={props.placeholder}
          aria-label={props.label}
          onChange={e => {
            setV(e.target.value);
            props.f.editData({ [props.name]: e.target.value.trim() || undefined });
          }}
        />
        {href ? (
          <button className="btn" onClick={() => go(href)} title={t.study.openLink}>
            <ExternalLink size={16} /> {t.study.openLink}
          </button>
        ) : (
          props.empty &&
          !v.trim() && (
            <button className="btn ghost" onClick={() => go(props.empty!.url)}>
              <ExternalLink size={16} /> {props.empty.label}
            </button>
          )
        )}
      </div>
      {v.trim() && !href && <span className="err small">{t.study.linkBad}</span>}
    </div>
  );
}

export function WorkbenchPage(props: { project: WorkbenchProject; onBack(): void; onDelete(): void }) {
  const p = props.project;
  const { notes, platform, bump, toast, confirmDelete } = useApp();
  const f = useNoteFile(p.path);
  useBack(true, props.onBack);
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(p.title);
  const [desc, setDesc] = useState(p.description);
  const [guides, setGuides] = useState(false);
  // Bumped when the notes are replaced from here (a guide, hints removed): remounts the editor.
  const [edits, setEdits] = useState(0);
  const [hasHints, setHasHints] = useState(false);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const d = f.note ? f.data() : {};
  const status = (WORKBENCH_STATUSES as readonly string[]).includes(String(d.status)) ? (d.status as WorkbenchStatus) : p.status;

  // Picked files wait here for their titles.
  const [picked, setPicked] = useState<File[] | null>(null);
  const pick = (list: FileList | null) => {
    if (list?.length) setPicked(Array.from(list));
    if (input.current) input.current.value = "";
  };
  const add = async (list: TitledFile[]) => {
    setPicked(null);
    try {
      for (const x of list) await addProjectFile(notes, p.dir, titledName(x), new Uint8Array(await x.file.arrayBuffer()));
      bump();
      toast({ text: t.school.filesAdded(list.length) });
    } catch (e) {
      fail(e);
    }
  };
  const replaceNotes = (text: string, done: string) => {
    f.setBody(text);
    void f.saveNow();
    setEdits(n => n + 1);
    setHasHints(text.includes("%%"));
    toast({ text: done });
  };
  const applyGuide = (g: Guide) => {
    setGuides(false);
    const now = f.body().trimEnd();
    replaceNotes(now ? `${now}\n\n${guideBody(g, word)}` : guideBody(g, word), t.study.guideApplied);
  };

  const fileOpen = (name: string) => platform.openFile?.(`${p.dir}/files/${name}`).catch(fail);
  const fileRemove = async (name: string) => {
    const path = `${p.dir}/files/${name}`;
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
      <div className="note-bar">
        <button className="btn ghost icon back keep" onClick={props.onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`}>{f.note ? t.note.status[f.status] : ""}</span>
        <button className="btn ghost icon" title={t.study.deleteProject} aria-label={t.study.deleteProject} onClick={props.onDelete}>
          <Trash2 size={18} />
        </button>
      </div>
      {f.note && (
        <div className="page task-page">
          <div className="page-inner stack">
            <span className="muted small wb-kicker">
              <Hammer size={14} /> {t.study.workbench}
            </span>
            <textarea
              className="task-title-input"
              rows={1}
              value={title}
              placeholder={t.study.projectTitle}
              aria-label={t.study.projectTitle}
              onChange={e => {
                const v = e.target.value.replace(/\n/g, " ");
                setTitle(v);
                f.editData({ title: v.trim() || undefined });
              }}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
            />
            <DescriptionInput
              value={desc}
              onChange={v => {
                setDesc(v);
                f.editData({ description: v.trim() || undefined });
              }}
            />
            <div className="segmented wb-statuses" role="tablist" aria-label={t.study.fStatus}>
              {WORKBENCH_STATUSES.map(x => (
                <button key={x} role="tab" aria-pressed={status === x} onClick={() => f.setData(statusPatch(x))}>
                  {t.study.wbStatus[x]}
                </button>
              ))}
            </div>
            <div className="task-fields">
              <span className="fl">{t.study.fStarted}</span>
              <input className="field" type="date" value={String(d.started ?? "").slice(0, 10)} onChange={e => f.setData({ started: e.target.value || undefined })} />
              {status === "done" && (
                <>
                  <span className="fl">{t.study.fFinished}</span>
                  <input className="field" type="date" value={String(d.finished ?? "").slice(0, 10)} onChange={e => f.setData({ finished: e.target.value || undefined })} />
                </>
              )}
            </div>

            <div className="wb-urls">
              <UrlField
                f={f}
                name="drawio"
                label={t.study.fDrawio}
                icon={<PencilRuler size={15} />}
                placeholder="https://app.diagrams.net/#G…"
                empty={{ label: t.study.newDrawio, url: DRAWIO_NEW }}
              />
              <UrlField f={f} name="github" label="GitHub" icon={<FolderGit2 size={15} />} placeholder="https://github.com/…" />
              <UrlField f={f} name="demo" label={t.study.fDemo} icon={<Rocket size={15} />} placeholder="https://…" />
            </div>

            <LinksBox dir={p.dir} links={p.links} empty={t.study.noProjectLinks} />

            <div className="task-notes-head row" style={{ justifyContent: "space-between" }}>
              <h2>{t.school.filesTitle}</h2>
              <input ref={input} type="file" multiple hidden onChange={e => pick(e.target.files)} />
              <button className="btn ghost" onClick={() => input.current?.click()}>
                <FileUp size={16} /> {t.school.addFiles}
              </button>
            </div>
            {p.files.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {t.study.noProjectFiles}
              </p>
            ) : (
              <ul className="list">
                {p.files.map(name => {
                  const dot = name.lastIndexOf(".");
                  return (
                  <li key={name} className="row file-row">
                    <button className="list-item" onClick={() => fileOpen(name)} disabled={!platform.openFile} title={name}>
                      <span className="list-title one-line">
                        {dot > 0 && <span className="note-tag ex-tag">{name.slice(dot + 1).toLowerCase()}</span>}
                        {dot > 0 ? name.slice(0, dot) : name}
                      </span>
                      <span className="list-meta">
                        <ExternalLink size={12} /> {t.school.openFile}
                      </span>
                    </button>
                    <button className="btn ghost icon" aria-label={t.common.delete} title={t.common.delete} onClick={() => fileRemove(name)}>
                      <X size={16} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}

            <div className="task-notes-head row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
              <h2>{t.study.projectNotes}</h2>
              <span className="row" style={{ gap: 4 }}>
                {(hasHints || f.body().includes("%%")) && (
                  <button className="btn ghost" onClick={() => replaceNotes(stripComments(f.body()), t.study.hintsRemoved)}>
                    <Eraser size={16} /> {t.study.stripHints}
                  </button>
                )}
                <button className="btn ghost" onClick={() => setGuides(true)}>
                  <MapIcon size={16} /> {t.study.guides}
                </button>
              </span>
            </div>
            <div className="task-notes">
              <Editor
                key={`${f.rev}:${edits}`}
                text={f.body()}
                onChange={text => {
                  f.setBody(text);
                  setHasHints(text.includes("%%"));
                }}
                onSaveNow={f.saveNow}
                placeholder={t.study.projectNotesHint}
              />
            </div>
          </div>
        </div>
      )}
      {guides && <GuidesDialog empty={!f.body().trim()} onPick={applyGuide} onClose={() => setGuides(false)} />}
      {f.dialog}
      {picked && <TitleFiles files={picked} heading={t.school.addFiles} onOk={add} onClose={() => setPicked(null)} />}
    </div>
  );
}

/** The project guides: what each is for, examples, its headings; picking one adds it to the notes. */
function GuidesDialog(props: { empty: boolean; onPick(g: Guide): void; onClose(): void }) {
  return (
    <Dialog title={t.study.guidesTitle} onClose={props.onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {t.study.guidesIntro}
      </p>
      <ul className="guide-list">
        {GUIDES.map(g => (
          <li key={g.id} className="guide-card">
            <span className="wb-card-head">
              <span className="list-title">{word(g.name)}</span>
              <span className="wb-status">{word(g.size)}</span>
            </span>
            <span className="small">{word(g.when)}</span>
            <span className="muted small">
              <strong>{t.study.guideExamples}:</strong> {word(g.examples)}
            </span>
            <span className="muted mono guide-sections">{g.sections.map(x => word(x.title)).join(" · ")}</span>
            <span className="guide-actions">
              <button className="btn" onClick={() => props.onPick(g)}>
                {props.empty ? t.study.guideUse : t.study.guideAppend}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.close}
        </button>
      </div>
    </Dialog>
  );
}
