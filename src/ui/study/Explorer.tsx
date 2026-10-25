import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronsDownUp, ChevronsUpDown, FilePlus, FileText, FolderPlus, Hammer, Home, NotebookText, PanelLeftClose, PanelLeftOpen, Pin } from "lucide-react";
import { isSchool, workbenchProjectOf, type Subject } from "../../data/study";
import { recentFiles } from "../../editor/memory";
import { shortcutLabel } from "../shortcuts";
import { t } from "../../i18n";

// The side panel of Personal study (Obsidian's file explorer): the way back and forward, new
// note / new subject, the pinned items, the last ones opened and the tree (ui/study/SubjectTree).
// It stays beside whatever is open on wide screens; Ctrl+Shift+E (or its button) hides it to a
// thin rail. Phones show the tree on the Personal home instead.

export interface StudyItem {
  path: string;
  title: string;
  icon: ReactNode;
  /** Where it is: the subject (and group) for a note, the group for a subject. */
  where: string;
  subject: Subject;
}

/** What a study path is, for lists outside the tree (pinned, recent, the palette). */
export function studyItem(subjects: Subject[], path: string): StudyItem | null {
  const dir = path.replace(/^summary:/, "").split("/").slice(0, 2).join("/");
  const s = subjects.find(x => x.dir === dir);
  if (!s) return null;
  // A subject is shown under its parent subject, or its group.
  const parent = s.parent ? subjects.find(x => x.slug === s.parent && !isSchool(x)) : undefined;
  const home = isSchool(s) ? t.area.school : (parent?.title ?? (s.group || t.study.noGroup));
  if (path === s.path) return { path, title: s.title, icon: <BookOpen size={15} />, where: home, subject: s };
  if (path === `summary:${s.path}`) return { path, title: t.study.summary, icon: <NotebookText size={15} />, where: s.title, subject: s };
  const n = s.notes.find(x => x.path === path);
  if (n) return { path, title: n.title || t.common.untitled, icon: <FileText size={15} />, where: s.title, subject: s };
  const m = s.materials.find(x => x.path === path);
  if (m) return { path, title: m.title, icon: <BookOpen size={15} />, where: s.title, subject: s };
  const w = s.workbench.find(x => x.path === workbenchProjectOf(path));
  if (w) return { path: w.path, title: w.title, icon: <Hammer size={15} />, where: s.title, subject: s };
  return null;
}

export interface NavButtons {
  canBack: boolean;
  canForward: boolean;
  back(): void;
  forward(): void;
}

function NavArrows({ nav }: { nav: NavButtons }) {
  return (
    <>
      <button className="btn ghost icon" disabled={!nav.canBack} onClick={nav.back} title={`${t.explorer.back} (${shortcutLabel("back")})`} aria-label={t.explorer.back}>
        <ArrowLeft size={17} />
      </button>
      <button
        className="btn ghost icon"
        disabled={!nav.canForward}
        onClick={nav.forward}
        title={`${t.explorer.forward} (${shortcutLabel("forward")})`}
        aria-label={t.explorer.forward}
      >
        <ArrowRight size={17} />
      </button>
    </>
  );
}

interface Props {
  subjects: Subject[];
  pins: string[];
  active?: string;
  nav: NavButtons;
  onHome(): void;
  onOpen(path: string): void;
  /** New note in the open subject (or asks where). */
  onNewNote(): void;
  onNewSubject(): void;
  /** Some branch is open: the toggle collapses all, else it expands all. */
  expanded: boolean;
  onToggleAll(): void;
  onHide(): void;
  /** The tree itself. */
  tree: ReactNode;
}

export function Explorer(props: Props) {
  const pinned = props.pins.map(p => studyItem(props.subjects, p)).filter((x): x is StudyItem => !!x);
  const recent = recentFiles()
    .filter(p => p.startsWith("study/") && !props.pins.includes(p))
    .map(p => studyItem(props.subjects, p))
    .filter((x, i, l): x is StudyItem => !!x && !isSchool(x.subject) && l.findIndex(y => y?.path === x.path) === i)
    .slice(0, 5);
  const list = (label: string, items: StudyItem[], icon?: ReactNode) =>
    items.length > 0 && (
      <section className="explorer-sec" aria-label={label}>
        <h2 className="explorer-sec-head">
          {icon}
          {label}
        </h2>
        <ul className="list explorer-list">
          {items.map(x => (
            <li key={x.path}>
              <button className={`explorer-link${props.active === x.path ? " active" : ""}`} onClick={() => props.onOpen(x.path)} title={`${x.title} — ${x.where}`}>
                <span className="tree-icon" aria-hidden="true">
                  {x.icon}
                </span>
                <span className="one-line">{x.title}</span>
                <span className="explorer-where one-line">{x.where}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <aside className="list-pane explorer" aria-label={t.explorer.title}>
      <div className="explorer-top">
        <div className="explorer-head">
          <button className="btn ghost study-home-link" onClick={props.onHome} title={t.study.home}>
            <Home size={17} /> <h1>{t.area.personal}</h1>
          </button>
          <span className="row explorer-tools">
            <NavArrows nav={props.nav} />
            <button className="btn ghost icon" onClick={props.onHide} title={`${t.explorer.hide} (${shortcutLabel("explorer")})`} aria-label={t.explorer.hide}>
              <PanelLeftClose size={17} />
            </button>
          </span>
        </div>
        <div className="explorer-actions">
          <button className="btn ghost" onClick={props.onNewNote} title={`${t.explorer.newNote} (${shortcutLabel("newNote")})`}>
            <FilePlus size={16} /> {t.explorer.newNote}
          </button>
          <button className="btn ghost icon" onClick={props.onNewSubject} title={`${t.explorer.newSubject} (${shortcutLabel("newSubject")})`} aria-label={t.explorer.newSubject}>
            <FolderPlus size={16} />
          </button>
          <button
            className="btn ghost icon"
            onClick={props.onToggleAll}
            title={props.expanded ? t.explorer.collapseAll : t.explorer.expandAll}
            aria-label={props.expanded ? t.explorer.collapseAll : t.explorer.expandAll}
          >
            {props.expanded ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
          </button>
        </div>
      </div>
      {list(t.explorer.pinned, pinned, <Pin size={13} />)}
      {list(t.explorer.recent, recent)}
      <section className="explorer-sec explorer-tree" aria-label={t.explorer.tree}>
        {(pinned.length > 0 || recent.length > 0) && <h2 className="explorer-sec-head">{t.explorer.all}</h2>}
        {props.tree}
      </section>
    </aside>
  );
}

/** The panel hidden: a thin rail that brings it back, with the way back and forward. */
export function ExplorerRail(props: { nav: NavButtons; onShow(): void }) {
  return (
    <aside className="explorer-rail" aria-label={t.explorer.title}>
      <button className="btn ghost icon" onClick={props.onShow} title={`${t.explorer.show} (${shortcutLabel("explorer")})`} aria-label={t.explorer.show}>
        <PanelLeftOpen size={18} />
      </button>
      <NavArrows nav={props.nav} />
    </aside>
  );
}
