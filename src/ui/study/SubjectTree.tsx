import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Ellipsis, FileText, FileType2, Folder, FolderOpen, Hammer, Layers, Link2, NotebookText } from "lucide-react";
import { childrenOf, LINKS_FILE, rootsOf, type Material, type StudyNote, type Subject } from "../../data/study";
import { useHold } from "../useHold";
import { menuPointOf } from "../ContextMenu";
import { usePref } from "./prefs";
import { t } from "../../i18n";

// Personal study as a file tree (like Obsidian's): groups and subjects are the folders (a subject
// can hold sub-subjects), and inside each subject are its materials, PDFs, notes and workbench
// projects. Everything is in A–Z order so rows stay put while you study. A branch opened stays
// open on this device.
//
// A WAI-ARIA tree: one row takes Tab (roving focus); ↑ ↓ move, → opens or goes in, ← closes or
// goes up, Home/End, Enter opens, F2 renames, Delete deletes, Shift+F10 or the Menu key opens the
// row's options. With the mouse: right-click or the "⋯" button; on a phone: hold. Notes and
// subjects can be dragged onto a subject or a group to move them there.

export type TreeNode =
  | { kind: "group"; key: string; name: string }
  | { kind: "subject"; key: string; s: Subject }
  | { kind: "note"; key: string; s: Subject; n: StudyNote }
  | { kind: "material"; key: string; s: Subject; m: Material }
  | { kind: "leaf"; key: string; s: Subject; title: string; open: string };

export const groupKey = (name: string) => `group:${name}`;

/** The name a node shows (and is renamed from). */
export function nodeTitle(n: TreeNode): string {
  switch (n.kind) {
    case "group":
      return n.name || t.study.noGroup;
    case "subject":
      return n.s.title;
    case "note":
      return n.n.title || t.common.untitled;
    case "material":
      return n.m.title;
    case "leaf":
      return n.title;
  }
}

interface Props {
  subjects: Subject[];
  /** Groups in their order (Study → Groups), including groups with no subject yet. */
  groups: string[];
  /** Path open in the detail pane, highlighted. */
  active?: string;
  onSubject(s: Subject): void;
  onOpen(path: string): void;
  /** The options of a row, at a point on the screen. */
  onMenu(node: TreeNode, at: { x: number; y: number }): void;
  /** The row being renamed in place, by key. */
  renaming?: string | null;
  /** F2 on a row. */
  onRenameStart?(node: TreeNode): void;
  /** The new name, or null when renaming was cancelled. */
  onRename?(node: TreeNode, title: string | null): void;
  /** Delete on a row. */
  onDelete?(node: TreeNode): void;
  /** A row dropped on a subject or a group. */
  onDrop?(dragged: TreeNode, onto: TreeNode): void;
  /** Accessible name of the tree. */
  label?: string;
}

const byTitle = <T,>(title: (x: T) => string) => (a: T, b: T) => title(a).localeCompare(title(b), undefined, { numeric: true, sensitivity: "base" });

/** Keys of the expanded branches (subjects by slug, groups closed by name): kept per device. */
export function useTreeOpen() {
  const [open, setOpen] = usePref<string[]>("studium.study.tree", []);
  const [closedGroups, setClosedGroups] = usePref<string[]>("studium.study.closedGroups", []);
  return {
    isOpen: (n: TreeNode) => (n.kind === "group" ? !closedGroups.includes(n.name) : n.kind === "subject" ? open.includes(n.s.slug) : false),
    set(n: TreeNode, on: boolean) {
      if (n.kind === "group") setClosedGroups(on ? closedGroups.filter(g => g !== n.name) : [...new Set([...closedGroups, n.name])]);
      else if (n.kind === "subject") setOpen(on ? [...new Set([...open, n.s.slug])] : open.filter(x => x !== n.s.slug));
    },
    /** Opens the branches down to a subject (its parents and group), so the open item shows. */
    reveal(slugs: string[], group?: string) {
      const add = slugs.filter(x => !open.includes(x));
      if (add.length) setOpen([...open, ...add]);
      if (group !== undefined && closedGroups.includes(group)) setClosedGroups(closedGroups.filter(g => g !== group));
    },
    collapseAll(groups: string[]) {
      setOpen([]);
      setClosedGroups(groups);
    },
    expandAll(slugs: string[]) {
      setOpen(slugs);
      setClosedGroups([]);
    },
    /** Whether any branch among these is open (so the toggle offers "collapse"). */
    anyOpen: (slugs: string[], groups: string[]) => slugs.some(x => open.includes(x)) || groups.some(g => !closedGroups.includes(g)),
  };
}

export function SubjectTree(props: Props) {
  const branches = useTreeOpen();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragged = useRef<TreeNode | null>(null);
  const tree = useRef<HTMLUListElement>(null);
  const nodes = useRef(new Map<string, { node: TreeNode; parent: string | null; expandable: boolean }>());
  nodes.current.clear();

  const roots = rootsOf(props.subjects).sort(byTitle(s => s.title));
  const used = new Set(roots.map(s => s.group));
  // Subjects with no group are rows of their own after the groups, with no "No group" folder.
  const groups = [...props.groups, ...[...used].filter(g => g && !props.groups.includes(g)).sort((a, b) => a.localeCompare(b))];

  const focusRow = (key: string | undefined) => {
    if (!key) return;
    setFocusKey(key);
    tree.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys with Ctrl, Alt or ⌘ are the app's shortcuts (back, new note…), not the tree's.
    if ((e.target as HTMLElement).tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
    const rows = [...(tree.current?.querySelectorAll<HTMLElement>("[role=treeitem]") ?? [])];
    const el = (e.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
    const key = el?.dataset.key;
    const info = key ? nodes.current.get(key) : undefined;
    if (!el || !key || !info) return;
    const i = rows.indexOf(el);
    const open = info.expandable && branches.isOpen(info.node);
    switch (e.key) {
      case "ArrowDown":
        focusRow(rows[i + 1]?.dataset.key);
        break;
      case "ArrowUp":
        focusRow(rows[i - 1]?.dataset.key);
        break;
      case "Home":
        focusRow(rows[0]?.dataset.key);
        break;
      case "End":
        focusRow(rows.at(-1)?.dataset.key);
        break;
      case "ArrowRight":
        if (info.expandable && !open) branches.set(info.node, true);
        else if (open) focusRow(rows[i + 1]?.dataset.key);
        break;
      case "ArrowLeft":
        if (open) branches.set(info.node, false);
        else focusRow(info.parent ?? undefined);
        break;
      case "Enter":
      case " ":
        activate(info.node);
        break;
      case "F2":
        if (info.node.kind !== "leaf" && (info.node.kind !== "group" || info.node.name)) props.onRenameStart?.(info.node);
        break;
      case "Delete":
        props.onDelete?.(info.node);
        break;
      case "ContextMenu":
        props.onMenu(info.node, menuPointOf(el.querySelector(".tree-line") ?? el));
        break;
      case "F10":
        if (!e.shiftKey) return;
        props.onMenu(info.node, menuPointOf(el.querySelector(".tree-line") ?? el));
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const activate = (n: TreeNode) => {
    if (n.kind === "group") branches.set(n, !branches.isOpen(n));
    else if (n.kind === "subject") props.onSubject(n.s);
    else if (n.kind === "note") props.onOpen(n.n.path);
    else if (n.kind === "material") props.onOpen(n.m.path);
    else props.onOpen(n.open);
  };

  // The row that takes Tab: the focused one, else the open item, else the first.
  const tabKey = (() => {
    const k = focusKey ?? props.active ?? null;
    return k;
  })();

  const drag = (n: TreeNode) =>
    props.onDrop && (n.kind === "note" || n.kind === "subject")
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            dragged.current = n;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", nodeTitle(n));
          },
          onDragEnd: () => {
            dragged.current = null;
            setDropKey(null);
          },
        }
      : {};
  const drop = (n: TreeNode) =>
    props.onDrop && (n.kind === "subject" || n.kind === "group")
      ? {
          onDragOver: (e: React.DragEvent) => {
            const d = dragged.current;
            if (!d || d.key === n.key) return;
            e.preventDefault();
            e.stopPropagation();
            setDropKey(n.key);
          },
          onDragLeave: () => setDropKey(k => (k === n.key ? null : k)),
          onDrop: (e: React.DragEvent) => {
            const d = dragged.current;
            e.preventDefault();
            e.stopPropagation();
            setDropKey(null);
            dragged.current = null;
            if (d && d.key !== n.key) props.onDrop!(d, n);
          },
        }
      : {};

  const row = (n: TreeNode, level: number, parent: string | null, opts: { expandable: boolean; icon: React.ReactNode; meta?: string; children?: React.ReactNode }) => {
    nodes.current.set(n.key, { node: n, parent, expandable: opts.expandable });
    const open = opts.expandable && branches.isOpen(n);
    return (
      <TreeRow
        key={n.key}
        node={n}
        level={level}
        open={opts.expandable ? open : undefined}
        active={props.active === n.key}
        tab={tabKey === n.key}
        drop={dropKey === n.key}
        icon={opts.icon}
        meta={opts.meta}
        renaming={props.renaming === n.key}
        onRename={title => props.onRename?.(n, title)}
        onToggle={() => branches.set(n, !open)}
        onActivate={() => activate(n)}
        onFocus={() => setFocusKey(n.key)}
        onMenu={at => props.onMenu(n, at)}
        dnd={{ ...drag(n), ...drop(n) }}
      >
        {open && opts.children}
      </TreeRow>
    );
  };

  const subjectNode = (s: Subject, level: number, parent: string | null, seen: Set<string>): React.ReactNode => {
    if (seen.has(s.slug)) return null;
    const inner = new Set(seen).add(s.slug);
    const kids = childrenOf(props.subjects, s.slug)
      .filter(k => !inner.has(k.slug))
      .sort(byTitle(x => x.title));
    const notes = s.notes.filter(n => n.kind !== "cards").sort(byTitle(n => n.title || ""));
    const cardsNote = s.notes.find(n => n.kind === "cards");
    const cards = s.notes.reduce((k, x) => k + x.cards.length, 0);
    const node: TreeNode = { kind: "subject", key: s.path, s };
    const leaf = (n: TreeNode, icon: React.ReactNode) => row(n, level + 1, s.path, { expandable: false, icon });
    return row(node, level, parent, {
      expandable: true,
      icon: null,
      children: (
        <>
          {kids.map(k => subjectNode(k, level + 1, s.path, inner))}
          {s.materials.map(m => leaf({ kind: "material", key: m.path, s, m }, <BookOpen size={15} />))}
          {s.pdfs.length > 0 && leaf({ kind: "leaf", key: `${s.dir}/pdfs`, s, title: t.study.pdfsCount(s.pdfs.length), open: s.pdfs[0].path }, <FileType2 size={15} />)}
          {notes.map(n => leaf({ kind: "note", key: n.path, s, n }, <FileText size={15} />))}
          {cardsNote && leaf({ kind: "leaf", key: cardsNote.path, s, title: t.study.cards(cards), open: cardsNote.path }, <Layers size={15} />)}
          {s.links.length > 0 &&
            leaf({ kind: "leaf", key: `${s.dir}/${LINKS_FILE}`, s, title: t.study.linksCount(s.links.length), open: `${s.dir}/${LINKS_FILE}` }, <Link2 size={15} />)}
          {s.workbench.map(w => leaf({ kind: "leaf", key: w.path, s, title: w.title, open: w.path }, <Hammer size={15} />))}
          {s.hasSummary && leaf({ kind: "leaf", key: `summary:${s.path}`, s, title: t.study.summary, open: `summary:${s.path}` }, <NotebookText size={15} />)}
        </>
      ),
    });
  };

  const body = [
    ...groups.map(g => {
        const inGroup = roots.filter(s => s.group === g);
        const node: TreeNode = { kind: "group", key: groupKey(g), name: g };
        return row(node, 1, null, {
          expandable: true,
          icon: branches.isOpen(node) ? <FolderOpen size={16} /> : <Folder size={16} />,
          children: inGroup.length ? inGroup.map(s => subjectNode(s, 2, node.key, new Set())) : <li className="muted small tree-empty" role="none">{t.study.groupEmpty}</li>,
        });
      }),
    ...roots.filter(s => !s.group).map(s => subjectNode(s, 1, null, new Set())),
  ];

  // Keep a focusable row: if none matches the roving key, the first row takes Tab.
  useEffect(() => {
    const el = tree.current;
    if (!el || el.querySelector('[role=treeitem][tabindex="0"]')) return;
    el.querySelector<HTMLElement>("[role=treeitem]")?.setAttribute("tabindex", "0");
  });

  return (
    <ul className="tree" role="tree" aria-label={props.label ?? t.explorer.tree} ref={tree} onKeyDown={onKeyDown}>
      {body}
    </ul>
  );
}

function TreeRow(props: {
  node: TreeNode;
  level: number;
  /** undefined = not a branch. */
  open?: boolean;
  active: boolean;
  tab: boolean;
  drop: boolean;
  icon: React.ReactNode;
  meta?: string;
  renaming: boolean;
  onRename(title: string | null): void;
  onToggle(): void;
  onActivate(): void;
  onFocus(): void;
  onMenu(at: { x: number; y: number }): void;
  dnd: Record<string, unknown>;
  children?: React.ReactNode;
}) {
  const { node } = props;
  const hold = useHold((_, at) => props.onMenu(at));
  // After renaming in place, the row takes the focus back (the field it came from is gone).
  const li = useRef<HTMLLIElement>(null);
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && !props.renaming) li.current?.focus({ preventScroll: true });
    wasRenaming.current = props.renaming;
  }, [props.renaming]);
  const title = nodeTitle(node);
  const branch = props.open !== undefined;
  return (
    <li
      ref={li}
      role="treeitem"
      data-key={node.key}
      aria-level={props.level}
      aria-expanded={branch ? props.open : undefined}
      aria-selected={props.active}
      aria-label={props.meta ? `${title}, ${t.study.due(Number(props.meta))}` : undefined}
      tabIndex={props.tab ? 0 : -1}
      className={`tree-item kind-${node.kind}`}
      onFocus={e => e.target === e.currentTarget && props.onFocus()}
    >
      <div
        className={`tree-line${props.active ? " active" : ""}${props.drop ? " drop" : ""}`}
        style={{ paddingLeft: (props.level - 1) * 14 + 4 }}
        {...hold.handlers}
        {...props.dnd}
        onClick={e => {
          if (hold.eaten() || props.renaming) return;
          // A click on the arrow only opens or closes the branch.
          if (branch && (e.target as HTMLElement).closest(".tree-twisty")) props.onToggle();
          else if (!(e.target as HTMLElement).closest(".tree-more")) props.onActivate();
        }}
      >
        <span className="tree-twisty" aria-hidden="true">
          {branch ? props.open ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : null}
        </span>
        {props.icon && (
          <span className="tree-icon" aria-hidden="true">
            {props.icon}
          </span>
        )}
        {props.renaming ? (
          <RenameField initial={node.kind === "note" ? node.n.title : title} onDone={props.onRename} />
        ) : (
          <span className="tree-title one-line">{title}</span>
        )}
        {props.meta && (
          <span className="tree-badge" aria-hidden="true" title={t.study.due(Number(props.meta))}>
            {props.meta}
          </span>
        )}
        <button
          className="tree-more"
          tabIndex={-1}
          aria-hidden="true"
          title={t.explorer.options(title)}
          onClick={e => props.onMenu(menuPointOf(e.currentTarget))}
        >
          <Ellipsis size={15} />
        </button>
      </div>
      {branch && props.open && props.children && (
        <ul role="group" className="tree">
          {props.children}
        </ul>
      )}
    </li>
  );
}

/** The name typed in place of a row: Enter or leaving the field keeps it, Escape cancels. */
function RenameField(props: { initial: string; onDone(title: string | null): void }) {
  const [text, setText] = useState(props.initial);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    props.onDone(v === null || !v.trim() || v.trim() === props.initial ? null : v.trim());
  };
  return (
    <input
      className="tree-rename"
      autoFocus
      value={text}
      aria-label={t.explorer.rename}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setText(e.target.value)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === "Enter") finish(text);
        else if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(text)}
    />
  );
}
