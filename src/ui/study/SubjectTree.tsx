import { ChevronDown, ChevronRight, FileText, Hammer, Layers, BookOpen, Link2, NotebookText, FileType2 } from "lucide-react";
import { cardCount, childrenOf, dueCards, LINKS_FILE, rootsOf, type Subject } from "../../data/study";
import { useHold } from "../useHold";
import { relativeDay } from "./SubjectPage";
import { usePref } from "./prefs";
import { t } from "../../i18n";

// Personal study as a file tree (like Obsidian's): groups, then subjects with their sub-subjects,
// and inside each subject its materials, PDFs, notes and workbench projects. Subjects come last studied first; a branch
// opened stays open on this device.

interface Props {
  subjects: Subject[];
  /** Groups in their order (Study → Groups), including groups with no subject yet. */
  groups: string[];
  /** Path open in the detail pane, highlighted. */
  active?: string;
  onSubject(s: Subject): void;
  onMenu(s: Subject): void;
  onOpen(path: string): void;
}

export function SubjectTree(props: Props) {
  const [open, setOpen] = usePref<string[]>("studium.study.tree", []);
  const toggle = (slug: string) => setOpen(open.includes(slug) ? open.filter(x => x !== slug) : [...open, slug]);
  const roots = rootsOf(props.subjects);
  const used = new Set(roots.map(s => s.group));
  const groups = [...props.groups, ...[...used].filter(g => g && !props.groups.includes(g)).sort((a, b) => a.localeCompare(b)), ...(used.has("") ? [""] : [])];

  const node = (s: Subject, depth: number, seen: Set<string>): React.ReactNode => {
    if (seen.has(s.slug)) return null;
    const inner = new Set(seen).add(s.slug);
    const kids = childrenOf(props.subjects, s.slug).filter(k => !inner.has(k.slug));
    const isOpen = open.includes(s.slug);
    const notes = s.notes.filter(n => n.kind !== "cards");
    const cards = cardCount(s);
    return (
      <li key={s.path}>
        <SubjectNode
          s={s}
          depth={depth}
          open={isOpen}
          active={props.active === s.path}
          due={dueCards([s]).length}
          cards={cards}
          onToggle={() => toggle(s.slug)}
          onOpen={() => props.onSubject(s)}
          onMenu={() => props.onMenu(s)}
        />
        {isOpen && (
          <ul className="tree">
            {kids.map(k => node(k, depth + 1, inner))}
            {s.materials.map(m => (
              <TreeLeaf
                key={m.path}
                depth={depth + 1}
                icon={<BookOpen size={15} />}
                title={m.title}
                active={props.active === m.path}
                onOpen={() => props.onOpen(m.path)}
              />
            ))}
            {s.pdfs.length > 0 && (
              <TreeLeaf
                depth={depth + 1}
                icon={<FileType2 size={15} />}
                title={t.study.pdfsCount(s.pdfs.length)}
                active={false}
                onOpen={() => props.onOpen(s.pdfs[0].path)}
              />
            )}
            {notes.map(n => (
              <TreeLeaf
                key={n.path}
                depth={depth + 1}
                icon={<FileText size={15} />}
                title={n.title || t.common.untitled}
                active={props.active === n.path}
                onOpen={() => props.onOpen(n.path)}
              />
            ))}
            {s.notes.some(n => n.kind === "cards") && (
              <TreeLeaf
                depth={depth + 1}
                icon={<Layers size={15} />}
                title={t.study.cards(cards)}
                active={false}
                onOpen={() => props.onOpen(s.notes.find(n => n.kind === "cards")!.path)}
              />
            )}
            {s.links.length > 0 && (
              <TreeLeaf
                depth={depth + 1}
                icon={<Link2 size={15} />}
                title={t.study.linksCount(s.links.length)}
                active={props.active === `${s.dir}/${LINKS_FILE}`}
                onOpen={() => props.onOpen(`${s.dir}/${LINKS_FILE}`)}
              />
            )}
            {s.workbench.map(w => (
              <TreeLeaf
                key={w.path}
                depth={depth + 1}
                icon={<Hammer size={15} />}
                title={w.title}
                active={props.active === w.path}
                onOpen={() => props.onOpen(w.path)}
              />
            ))}
            {s.hasSummary && (
              <TreeLeaf
                depth={depth + 1}
                icon={<NotebookText size={15} />}
                title={t.study.summary}
                active={false}
                onOpen={() => props.onOpen(`summary:${s.path}`)}
              />
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      {groups.map(g => {
        const inGroup = roots.filter(s => s.group === g);
        return (
          <section key={g || "-"} className="task-section">
            {(g || groups.length > 1) && <h3 className="section-head">{g || t.study.noGroup}</h3>}
            {inGroup.length === 0 ? <p className="muted small tree-empty">{t.study.groupEmpty}</p> : <ul className="list tree">{inGroup.map(s => node(s, 0, new Set()))}</ul>}
          </section>
        );
      })}
    </>
  );
}

function SubjectNode(props: {
  s: Subject;
  depth: number;
  open: boolean;
  active: boolean;
  due: number;
  cards: number;
  onToggle(): void;
  onOpen(): void;
  onMenu(): void;
}) {
  const { s } = props;
  const hold = useHold(props.onMenu);
  return (
    <div className={`tree-row${props.active ? " active" : ""}`} style={{ paddingLeft: props.depth * 16 }} {...hold.handlers}>
      <button className="btn ghost icon tree-twisty" aria-label={props.open ? t.study.collapse : t.study.expand} aria-expanded={props.open} onClick={props.onToggle}>
        {props.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <button className="tree-main" onClick={() => !hold.eaten() && props.onOpen()}>
        <span className="list-title">{s.title}</span>
        <span className="list-meta">
          {[relativeDay(s.modified), props.cards ? t.study.cards(props.cards) : "", props.due ? t.study.due(props.due) : ""].filter(Boolean).join(" · ")}
        </span>
      </button>
    </div>
  );
}

function TreeLeaf(props: { depth: number; icon: React.ReactNode; title: string; active: boolean; onOpen(): void }) {
  return (
    <li>
      <button className={`tree-leaf${props.active ? " active" : ""}`} style={{ paddingLeft: props.depth * 16 + 34 }} onClick={props.onOpen}>
        <span className="muted">{props.icon}</span>
        <span className="one-line">{props.title}</span>
      </button>
    </li>
  );
}
