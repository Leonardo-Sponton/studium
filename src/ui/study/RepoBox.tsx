import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CloudOff,
  Copy,
  Ellipsis,
  Eye,
  File,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderSearch,
  GitBranch,
  Maximize2,
  Minimize2,
  RefreshCw,
  SquareTerminal,
  Tag,
  TriangleAlert,
  Unlink,
  X,
} from "lucide-react";
import {
  buildTree,
  changeKind,
  fileCode,
  groupFiles,
  newRepoId,
  parseBranches,
  parseLog,
  parseStatus,
  type GitBranch as Branch,
  type GitCommit,
  type GitFile,
  type GitStatus,
  type TreeNode,
} from "../../data/gitstatus";
import type { RawRepoStatus, RepoFileView } from "../../platform/types";
import { highlightFile, markdownToHtml } from "../../editor/toHtml";
import { ContextMenu, menuPointOf, type MenuItem } from "../ContextMenu";
import { useApp } from "../context";
import type { NoteFile } from "../useNoteFile";
import { lang, t } from "../../i18n";

// A workbench project's folder on this PC (PC only): the path is kept in this PC's config by the
// main process, keyed by `repo_id` in project.md, so other devices ask to link their own copy.
// Shows the changes (git status), the whole history (git log, a page at a time while scrolling),
// the branches, the file tree (git ls-files) and one file at a time, colored by its type; it
// never changes the folder.

/** Files shown per group before "Show all". */
const FEW = 6;
/** Text longer than this is shown without colors (coloring it would make the screen slow). */
const COLOR_MAX = 200_000;

const homeShort = (p: string) => p.replace(/^\/home\/[^/]+(?=\/|$)/, "~");
const clock = (d: Date) => d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });

export function RepoBox(props: { f: NoteFile }) {
  const { platform, toast } = useApp();
  const repo = platform.repo;
  const id = String(props.f.data().repo_id ?? "");
  const [raw, setRaw] = useState<RawRepoStatus | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const load = useCallback(
    async (pid: string) => {
      if (!repo || !pid) return setRaw({ state: "none" });
      setBusy(true);
      try {
        setRaw(await repo.status(pid));
        setAt(new Date());
      } catch (e) {
        toast({
          text: e instanceof Error ? e.message : String(e),
          error: true,
        });
      } finally {
        setBusy(false);
      }
    },
    [repo, toast],
  );

  useEffect(() => {
    void load(id);
    // Back from the terminal or the editor: show what changed there.
    const onFocus = () => void load(id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, id]);

  if (!repo) return null;

  const link = async () => {
    let pid = id;
    if (!pid) {
      pid = newRepoId();
      props.f.setData({ repo_id: pid });
    }
    try {
      const r = await repo.link(pid);
      if (!r) return;
      if (r.error)
        return toast({
          text: r.error === "git-missing" ? t.study.repoGitMissing : t.study.repoNotRepo(r.path),
          error: true,
        });
      await load(pid);
    } catch (e) {
      fail(e);
    }
  };
  const unlink = async () => {
    try {
      await repo.unlink(id);
      setRaw({ state: "none" });
      toast({ text: t.study.repoUnlinked });
    } catch (e) {
      fail(e);
    }
  };

  const linked = raw && raw.state !== "none" ? raw : null;
  const missing = linked?.state === "missing";
  const items: MenuItem[] = [
    ...(missing
      ? []
      : [
          {
            icon: <FolderOpen size={16} />,
            label: t.study.repoOpenFolder,
            run: () => void repo.openFolder(id).catch(fail),
          },
          {
            icon: <SquareTerminal size={16} />,
            label: t.study.repoOpenTerminal,
            run: () => void repo.openTerminal(id).catch(fail),
          },
          {
            icon: <RefreshCw size={16} />,
            label: t.study.repoRefresh,
            run: () => void load(id),
          },
        ]),
    {
      icon: <FolderSearch size={16} />,
      label: t.study.repoChange,
      run: () => void link(),
      divide: !missing,
    },
    {
      icon: <Unlink size={16} />,
      label: t.study.repoUnlink,
      run: () => void unlink(),
      danger: true,
    },
  ];

  return (
    <section className="repo-box stack" aria-label={t.study.repoTitle}>
      <div className="task-notes-head row">
        <h2>{t.study.repoTitle}</h2>
      </div>

      {!linked ? (
        raw && (
          <div className="repo-card repo-empty">
            <span className="repo-icon" aria-hidden>
              <FolderGit2 size={22} />
            </span>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <strong>{t.study.repoEmptyTitle}</strong>
              <p className="muted small" style={{ margin: 0 }}>
                {t.study.repoIntro}
              </p>
              <span>
                <button className="btn primary" onClick={link}>
                  <FolderSearch size={16} /> {t.study.repoLink}
                </button>
              </span>
            </div>
          </div>
        )
      ) : (
        <div
          className="repo-card"
          onContextMenu={e => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <div className="repo-head">
            <span className="repo-icon" aria-hidden>
              <FolderGit2 size={22} />
            </span>
            <div className="repo-where">
              <strong className="one-line">{linked.path.split("/").pop()}</strong>
              <span className="muted small mono one-line" title={linked.path}>
                {homeShort(linked.path)}
              </span>
            </div>
            <div className="repo-head-actions">
              {!missing && (
                <>
                  <button className="btn" onClick={() => repo.openFolder(id).catch(fail)} title={t.study.repoOpenFolder}>
                    <FolderOpen size={16} /> <span className="repo-label">{t.study.repoFolderShort}</span>
                  </button>
                  <button className="btn" onClick={() => repo.openTerminal(id).catch(fail)} title={t.study.repoOpenTerminal}>
                    <SquareTerminal size={16} /> <span className="repo-label">{t.study.repoTerminalShort}</span>
                  </button>
                </>
              )}
              <button className="btn ghost icon" aria-label={t.common.more} title={t.common.more} aria-haspopup="menu" onClick={e => setMenu(menuPointOf(e.currentTarget))}>
                <Ellipsis size={18} />
              </button>
            </div>
          </div>

          {linked.state === "missing" && <Alert text={t.study.repoMissing} />}
          {linked.state === "git-missing" && <Alert text={t.study.repoGitMissing} />}
          {linked.state === "error" && <Alert text={linked.message} mono />}
          {linked.state === "ok" && <RepoStatus raw={linked} id={id} at={at} busy={busy} onRefresh={() => void load(id)} />}
        </div>
      )}
      {menu && <ContextMenu at={menu} label={t.study.repoTitle} items={items} onClose={() => setMenu(null)} />}
    </section>
  );
}

function Alert(props: { text: string; mono?: boolean }) {
  return (
    <div className="repo-alert" role="alert">
      <TriangleAlert size={16} />
      <span className={props.mono ? "mono small" : "small"}>{props.text}</span>
    </div>
  );
}

function SyncChip({ s }: { s: GitStatus }) {
  if (!s.upstream)
    return (
      <span className="repo-chip" title={t.study.repoNoUpstream}>
        <CloudOff size={13} /> {t.study.repoLocalOnly}
      </span>
    );
  const note = t.study.repoFetchNote(s.upstream);
  if (!s.ahead && !s.behind)
    return (
      <span className="repo-chip ok" title={`${t.study.repoInSync(s.upstream)}. ${note}`}>
        <CircleCheck size={13} /> {t.study.repoUpToDate}
      </span>
    );
  return (
    <>
      {s.ahead > 0 && (
        <span className="repo-chip push" title={`${t.study.repoAhead(s.ahead)}. ${note}`}>
          <ArrowUp size={13} /> {t.study.repoAheadShort(s.ahead)}
        </span>
      )}
      {s.behind > 0 && (
        <span className="repo-chip pull" title={`${t.study.repoBehind(s.behind)}. ${note}`}>
          <ArrowDown size={13} /> {t.study.repoBehindShort(s.behind)}
        </span>
      )}
    </>
  );
}

type RepoOk = Extract<RawRepoStatus, { state: "ok" }>;

function RepoStatus(props: { raw: RepoOk; id: string; at: Date | null; busy: boolean; onRefresh(): void }) {
  const { raw } = props;
  const s = useMemo(() => parseStatus(raw.status), [raw.status]);
  const branches = useMemo(() => parseBranches(raw.branches), [raw.branches]);
  const tree = useMemo(() => buildTree(raw.files, s.files), [raw.files, s]);
  const g = groupFiles(s.files);
  // The file open in the viewer (a path in the folder), from the tree or the Changes list.
  const [viewing, setViewing] = useState<string | null>(null);
  // "Expand": the viewer takes the tree's place too (long lines of code).
  const [wide, setWide] = useState(false);
  // The history shows HEAD (the current branch) unless another branch is picked.
  const [picked, setPicked] = useState("HEAD");
  const ref = picked === "HEAD" || branches.some(b => b.name === picked) ? picked : "HEAD";
  // More than one branch: "main" and "origin/main" are the same one, here and on the remote.
  const many = new Set(branches.map(b => (b.remote ? b.name.slice(b.name.indexOf("/") + 1) : b.name))).size > 1;
  return (
    <>
      <div className="repo-strip">
        <span className="repo-chip branch" title={t.study.repoBranch}>
          <GitBranch size={13} /> {s.branch ?? t.study.repoDetached}
        </span>
        <SyncChip s={s} />
        <span className="repo-updated muted small">
          {props.at && t.study.repoUpdated(clock(props.at))}
          <button className="btn ghost icon" onClick={props.onRefresh} disabled={props.busy} aria-label={t.study.repoRefresh} title={t.study.repoRefresh}>
            <RefreshCw size={15} className={props.busy ? "spin" : undefined} />
          </button>
        </span>
      </div>

      {/* Top: what changed + branches | the history, as tall as the left side. Below: the files | one file. */}
      <div className="repo-cols">
        <div className="repo-stack">
          <div className="repo-col">
            <span className="repo-col-title">{t.study.repoChanges}</span>
            {s.files.length === 0 ? (
              <div className="repo-clean">
                <CircleCheck size={18} />
                <span className="stack" style={{ gap: 0 }}>
                  <strong>{t.study.repoClean}</strong>
                  <span className="muted small">{t.study.repoCleanHint}</span>
                </span>
              </div>
            ) : (
              <>
                <FileGroup title={t.study.repoConflicts} hint={t.study.repoConflictsHint} files={g.conflicts} kind="conflict" onOpen={setViewing} />
                <FileGroup title={t.study.repoStaged} hint={t.study.repoStagedHint} files={g.staged} kind="staged" onOpen={setViewing} />
                <FileGroup title={t.study.repoChanged} hint={t.study.repoChangedHint} files={g.changed} kind="changed" onOpen={setViewing} />
                <FileGroup title={t.study.repoUntracked} hint={t.study.repoUntrackedHint} files={g.untracked} kind="untracked" onOpen={setViewing} />
              </>
            )}
          </div>
          {many && <BranchesCol branches={branches} gitRef={ref} onPick={setPicked} />}
        </div>

        <HistoryCol
          id={props.id}
          gitRef={ref}
          // A new commit, pull or branch switch loads the history again; other refreshes keep it.
          version={`${s.oid}|${raw.branches}`}
          branches={branches}
          current={s.branch}
          pickable={many}
          onRef={setPicked}
        />
      </div>

      <div className={`repo-browse${wide && viewing ? " wide" : ""}`}>
        {!(wide && viewing) && <FilesCol tree={tree} cut={raw.filesCut} viewing={viewing} onOpen={setViewing} />}
        <FileView
          id={props.id}
          path={viewing}
          version={props.at?.getTime() ?? 0}
          change={s.files.find(f => f.path === viewing)}
          wide={wide}
          onWide={setWide}
          onClose={() => setViewing(null)}
        />
      </div>

      <span className="muted small repo-source">{t.study.repoSource}</span>
    </>
  );
}

/** The whole history of a branch, 50 commits at a time: the next page loads when the list is
 *  scrolled near its end (or with the button under it). */
function HistoryCol(props: { id: string; gitRef: string; version: string; branches: Branch[]; current: string | null; pickable: boolean; onRef(ref: string): void }) {
  const { platform, toast } = useApp();
  const repo = platform.repo;
  const [list, setList] = useState<GitCommit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const have = useRef<GitCommit[]>([]);
  const busy = useRef(false);
  // A newer load (other branch, refresh) makes older answers stale.
  const gen = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const { id, gitRef } = props;

  const more = useCallback(
    async (reset: boolean) => {
      if (!repo || (busy.current && !reset)) return;
      const mine = reset ? ++gen.current : gen.current;
      busy.current = true;
      setLoading(true);
      try {
        const r = await repo.log(id, gitRef, reset ? 0 : have.current.length);
        if (mine !== gen.current) return;
        const page = parseLog(r.log);
        have.current = reset ? page : [...have.current, ...page];
        setList(have.current);
        if (r.total !== null) setTotal(r.total);
        setDone(page.length < r.page);
        if (reset) box.current?.scrollTo({ top: 0 });
      } catch (e) {
        toast({
          text: e instanceof Error ? e.message : String(e),
          error: true,
        });
      } finally {
        if (mine === gen.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [repo, id, gitRef, toast],
  );

  useEffect(() => {
    void more(true);
  }, [more, props.version]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!done && el.scrollTop + el.clientHeight > el.scrollHeight - 120) void more(false);
  };

  // Author only when the loaded commits have more than one.
  const authors = new Set(list.map(c => c.author)).size > 1;
  const rows: React.ReactNode[] = [];
  let day = "";
  for (const c of list) {
    const d = dayLabel(c.date);
    if (d !== day) {
      day = d;
      rows.push(
        <li key={`d:${c.hash}`} className="repo-day" aria-hidden>
          {d}
        </li>,
      );
    }
    rows.push(
      <li key={c.hash} className={c === list[0] ? "newest" : undefined}>
        <span className="repo-subject" title={c.subject}>
          {c.subject}
        </span>
        {c.refs.length > 0 && (
          <span className="repo-refs">
            {c.refs.map(r => (
              <RefChip key={r} r={r} />
            ))}
          </span>
        )}
        <span className="muted small">
          <code className="mono">{c.hash}</code>
          {authors && ` · ${c.author}`} · {clock(new Date(c.date))}
        </span>
      </li>,
    );
  }

  return (
    <div className="repo-col fill">
      <div className="repo-col-head">
        <span className="repo-col-title">{t.study.repoHistory}</span>
        {total !== null && total > 0 && <span className="repo-count plain">{total}</span>}
        {props.pickable && (
          <select className="field repo-ref" value={gitRef} aria-label={t.study.repoHistoryOf} title={t.study.repoHistoryOf} onChange={e => props.onRef(e.target.value)}>
            <option value="HEAD">
              {props.current ?? "HEAD"} · {t.study.repoCurrent}
            </option>
            {props.branches
              .filter(b => !b.current)
              .map(b => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
          </select>
        )}
      </div>
      <div className="repo-scroll fill" ref={box} onScroll={onScroll} tabIndex={0} aria-label={t.study.repoHistory}>
        {list.length === 0 && !loading ? <span className="muted small">{t.study.repoNoCommits}</span> : <ol className="repo-log">{rows}</ol>}
        {loading && <span className="muted small repo-end">{t.common.loading}</span>}
        {!loading && !done && list.length > 0 && (
          <button className="btn ghost repo-more" onClick={() => void more(false)}>
            {t.study.repoLoadMore}
          </button>
        )}
        {done && list.length > 0 && <span className="muted small repo-end">{t.study.repoHistoryStart}</span>}
      </div>
    </div>
  );
}

/** A branch or tag on a commit, as git decorates it ("HEAD -> main", "origin/main", "tag: v1"). */
function RefChip({ r }: { r: string }) {
  if (r.startsWith("tag: "))
    return (
      <span className="repo-chip tag">
        <Tag size={11} /> {r.slice(5)}
      </span>
    );
  const head = r.startsWith("HEAD -> ");
  const name = head ? r.slice(8) : r;
  return (
    <span className={`repo-chip ${head ? "branch" : r.includes("/") ? "remote" : "local"}`} title={head ? t.study.repoCurrent : undefined}>
      <GitBranch size={11} /> {name}
    </span>
  );
}

function BranchesCol(props: { branches: Branch[]; gitRef: string; onPick(ref: string): void }) {
  const { toast } = useApp();
  const [menu, setMenu] = useState<{
    at: { x: number; y: number };
    b: Branch;
  } | null>(null);
  const local = props.branches.filter(b => !b.remote);
  const remote = props.branches.filter(b => b.remote);
  const pick = (b: Branch) => props.onPick(b.current ? "HEAD" : b.name);
  const row = (b: Branch) => {
    const on = b.current ? props.gitRef === "HEAD" : props.gitRef === b.name;
    return (
      <li key={b.name}>
        <button
          className={`repo-branch-row${on ? " on" : ""}${b.current ? " current" : ""}`}
          aria-pressed={on}
          title={t.study.repoSeeHistory}
          onClick={() => pick(b)}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ at: { x: e.clientX, y: e.clientY }, b });
          }}
        >
          <span className="repo-branch-line">
            <GitBranch size={14} className="repo-branch-icon" />
            <span className="repo-branch-name mono one-line">{b.name}</span>
            {b.current && <span className="repo-chip branch">{t.study.repoCurrent}</span>}
            {b.ahead > 0 && (
              <span className="repo-chip push" title={t.study.repoAhead(b.ahead)}>
                <ArrowUp size={11} /> {b.ahead}
              </span>
            )}
            {b.behind > 0 && (
              <span className="repo-chip pull" title={t.study.repoBehind(b.behind)}>
                <ArrowDown size={11} /> {b.behind}
              </span>
            )}
            {b.gone && <span className="repo-chip gone">{t.study.repoGone}</span>}
          </span>
          <span className="muted small one-line repo-branch-sub">
            {b.subject} · {commitWhen(b.date)}
          </span>
        </button>
      </li>
    );
  };
  return (
    <div className="repo-col">
      <div className="repo-col-head">
        <span className="repo-col-title">{t.study.repoBranches}</span>
        <span className="repo-count plain">{props.branches.length}</span>
      </div>
      <div className="repo-scroll short">
        {local.length > 0 && (
          <>
            <span className="repo-sub-title muted small">{t.study.repoLocal}</span>
            <ul className="repo-branches">{local.map(row)}</ul>
          </>
        )}
        {remote.length > 0 && (
          <>
            <span className="repo-sub-title muted small">{t.study.repoRemote}</span>
            <ul className="repo-branches">{remote.map(row)}</ul>
          </>
        )}
      </div>
      {menu && (
        <ContextMenu
          at={menu.at}
          label={menu.b.name}
          items={[
            {
              icon: <GitBranch size={16} />,
              label: t.study.repoSeeHistory,
              run: () => pick(menu.b),
            },
            {
              icon: <Copy size={16} />,
              label: t.study.repoCopyName,
              run: () => void copy(menu.b.name, toast),
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function copy(text: string, toast: ReturnType<typeof useApp>["toast"]) {
  return navigator.clipboard.writeText(text).then(
    () => toast({ text: t.study.repoCopied }),
    e => toast({ text: String(e), error: true }),
  );
}

function countFiles(n: TreeNode): number {
  return n.dir ? n.children.reduce((a, c) => a + countFiles(c), 0) : 1;
}

/** The project's files as a tree: folders with changes start open; a file opens in the viewer. */
function FilesCol(props: { tree: TreeNode; cut: boolean; viewing: string | null; onOpen(path: string): void }) {
  const { toast } = useApp();
  const [open, setOpen] = useState<Set<string>>(() => changedDirs(props.tree));
  const [menu, setMenu] = useState<{
    at: { x: number; y: number };
    n: TreeNode;
  } | null>(null);
  const count = useMemo(() => countFiles(props.tree), [props.tree]);
  const anyOpen = open.size > 0;
  const toggle = (path: string) =>
    setOpen(o => {
      const next = new Set(o);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const rows: React.ReactNode[] = [];
  const walk = (n: TreeNode, depth: number) => {
    for (const c of n.children) {
      const isOpen = open.has(c.path);
      const onMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ at: { x: e.clientX, y: e.clientY }, n: c });
      };
      rows.push(
        <li key={c.path} style={{ paddingLeft: depth * 16 }}>
          {c.dir ? (
            <button className="repo-tree-row dir" aria-expanded={isOpen} onClick={() => toggle(c.path)} onContextMenu={onMenu}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={15} className="repo-tree-folder" />
              <span className="one-line">{c.name}</span>
              {c.changed && <span className="repo-tree-dot" title={t.study.repoHasChanges} aria-label={t.study.repoHasChanges} />}
            </button>
          ) : (
            <button
              className={`repo-tree-row file${c.kind ? ` ${c.kind}` : ""}${props.viewing === c.path ? " on" : ""}`}
              aria-pressed={props.viewing === c.path}
              title={`${c.path} · ${t.study.repoView}`}
              onClick={() => props.onOpen(c.path)}
              onContextMenu={onMenu}
            >
              <span className="repo-tree-pad" />
              <File size={14} className="muted" />
              <span className="one-line">{c.name}</span>
              {c.code && (
                <span className="repo-code mono" title={t.study.repoCodes[c.code] ?? c.code}>
                  {c.code}
                </span>
              )}
            </button>
          )}
        </li>,
      );
      if (c.dir && isOpen) walk(c, depth + 1);
    }
  };
  walk(props.tree, 0);
  return (
    <div className="repo-col">
      <div className="repo-col-head">
        <span className="repo-col-title">{t.study.repoFiles}</span>
        <span className="repo-count plain">{count}</span>
        <button className="btn ghost repo-more" style={{ marginLeft: "auto" }} onClick={() => setOpen(anyOpen ? new Set() : allDirs(props.tree))}>
          {anyOpen ? t.study.repoCollapseAll : t.study.repoExpandAll}
        </button>
      </div>
      <div className="repo-scroll" tabIndex={0} aria-label={t.study.repoFiles}>
        {count === 0 ? <span className="muted small">{t.study.repoNoFiles}</span> : <ul className="repo-tree">{rows}</ul>}
        {props.cut && <span className="muted small repo-end">{t.study.repoFilesCut}</span>}
      </div>
      {menu && (
        <ContextMenu
          at={menu.at}
          label={menu.n.name}
          items={[
            ...(menu.n.dir
              ? [
                  {
                    icon: <FolderOpen size={16} />,
                    label: open.has(menu.n.path) ? t.study.repoCollapse : t.study.repoExpand,
                    run: () => toggle(menu.n.path),
                  },
                ]
              : [
                  {
                    icon: <Eye size={16} />,
                    label: t.study.repoView,
                    run: () => props.onOpen(menu.n.path),
                  },
                ]),
            {
              icon: <Copy size={16} />,
              label: t.study.repoCopyPath,
              run: () => void copy(menu.n.path, toast),
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function changedDirs(n: TreeNode, out = new Set<string>()) {
  for (const c of n.children) if (c.dir && c.changed) (out.add(c.path), changedDirs(c, out));
  return out;
}

function allDirs(n: TreeNode, out = new Set<string>()) {
  for (const c of n.children) if (c.dir) (out.add(c.path), allDirs(c, out));
  return out;
}

const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

interface Shown {
  path: string;
  view: RepoFileView;
  /** The text colored by the file's type, one line per "\n". */
  html: string;
  lines: number;
  language: string | null;
  /** Markdown drawn as a note (README.md...). */
  rendered: string | null;
}

/** One file of the folder, read only: code colored by its type with line numbers, Markdown drawn
 *  as a note (or as code), pictures as pictures. Reads the file again on every refresh. */
function FileView(props: { id: string; path: string | null; version: number; change?: GitFile; wide: boolean; onWide(wide: boolean): void; onClose(): void }) {
  const { platform, toast } = useApp();
  const repo = platform.repo;
  const [shown, setShown] = useState<Shown | null>(null);
  const [source, setSource] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { id, path } = props;

  useEffect(() => {
    if (!repo || !path) return setShown(null);
    let live = true;
    void (async () => {
      const view = await repo.readFile(id, path);
      const name = path.split("/").pop() ?? path;
      let html = "";
      let lines = 0;
      let language: string | null = null;
      let rendered: string | null = null;
      if ("text" in view) {
        const text = view.text.replace(/\r\n/g, "\n").replace(/\n$/, "");
        ({ html, language } = await highlightFile(text, text.length > COLOR_MAX ? "" : name));
        lines = text.split("\n").length;
        if (language === "Markdown") rendered = await markdownToHtml(text, { dark: document.documentElement.dataset.theme !== "light" });
      }
      if (live) setShown({ path, view, html, lines, language, rendered });
    })().catch(e => live && toast({ text: e instanceof Error ? e.message : String(e), error: true }));
    return () => {
      live = false;
    };
  }, [repo, id, path, props.version, toast]);

  // Another file: back to the top, and into sight when the viewer sits under the tree.
  useEffect(() => {
    if (!path) return;
    box.current?.scrollTo({ top: 0, left: 0 });
    const r = box.current?.getBoundingClientRect();
    if (r && (r.top > window.innerHeight || r.bottom < 0)) box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [path]);

  if (!path)
    return (
      <div className="repo-col">
        <span className="repo-col-title">{t.study.repoViewTitle}</span>
        <div className="repo-view-empty">
          <FileText size={22} />
          <span>{t.study.repoViewEmpty}</span>
          <span className="muted small">{t.study.repoViewEmptyHint}</span>
        </div>
      </div>
    );

  const cur = shown?.path === path ? shown : null;
  const v = cur?.view;
  const slash = path.lastIndexOf("/");
  const kind = props.change ? changeKind(props.change) : null;
  const code = props.change ? fileCode(props.change) : null;
  const md = !!cur?.rendered;
  return (
    <div className="repo-col">
      <div className="repo-col-head">
        <span className="repo-col-title">{t.study.repoViewTitle}</span>
        {md && (
          <span className="segmented repo-seg" role="group">
            <button aria-pressed={!source} onClick={() => setSource(false)}>
              {t.study.repoViewRendered}
            </button>
            <button aria-pressed={source} onClick={() => setSource(true)}>
              {t.study.repoViewSource}
            </button>
          </span>
        )}
      </div>
      <div className="repo-view">
        <div className={`repo-view-head${kind ? ` ${kind}` : ""}`}>
          <File size={15} className="muted" />
          <span className="one-line" title={path}>
            <strong>{path.slice(slash + 1)}</strong>
            {slash > 0 && <span className="muted small"> {path.slice(0, slash + 1)}</span>}
          </span>
          {code && (
            <span className="repo-code mono" title={t.study.repoCodes[code] ?? code}>
              {code}
            </span>
          )}
          <button
            className="btn ghost icon"
            onClick={() => props.onWide(!props.wide)}
            aria-pressed={props.wide}
            aria-label={props.wide ? t.study.repoViewNarrow : t.study.repoViewWide}
            title={props.wide ? t.study.repoViewNarrow : t.study.repoViewWide}
          >
            {props.wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button className="btn ghost icon" onClick={props.onClose} aria-label={t.study.repoViewClose} title={t.study.repoViewClose}>
            <X size={16} />
          </button>
        </div>
        {v && "text" in v && (
          <div className="repo-view-meta muted small">
            {cur.language ?? t.study.repoViewPlain} · {t.study.repoViewLines(cur.lines)} · {sizeText(v.size)}
          </div>
        )}
        <div className="repo-view-body" ref={box} tabIndex={0} aria-label={path}>
          {!v ? (
            <span className="muted small repo-view-note">{t.common.loading}</span>
          ) : "missing" in v ? (
            <span className="muted small repo-view-note">{t.study.repoViewMissing}</span>
          ) : "binary" in v ? (
            <span className="muted small repo-view-note">
              {t.study.repoViewBinary} ({sizeText(v.size)})
            </span>
          ) : "image" in v ? (
            <div className="repo-view-image">
              <img src={v.image} alt={path} />
            </div>
          ) : md && !source ? (
            <div className="print-doc repo-view-md" dangerouslySetInnerHTML={{ __html: cur.rendered! }} />
          ) : (
            <div className="repo-view-code">
              <pre className="repo-view-nums" aria-hidden>
                {Array.from({ length: cur.lines }, (_, i) => i + 1).join("\n")}
              </pre>
              <pre className="repo-view-text">
                <code dangerouslySetInnerHTML={{ __html: cur.html }} />
              </pre>
            </div>
          )}
          {v && "cut" in v && v.cut && <span className="muted small repo-view-note">{t.study.repoViewCut(sizeText(v.size))}</span>}
        </div>
      </div>
    </div>
  );
}

type Kind = "conflict" | "staged" | "changed" | "untracked";

function FileGroup(props: { title: string; hint: string; files: GitFile[]; kind: Kind; onOpen(path: string): void }) {
  const [all, setAll] = useState(false);
  if (!props.files.length) return null;
  const shown = all ? props.files : props.files.slice(0, FEW);
  const code = (f: GitFile) => (props.kind === "staged" ? f.staged : props.kind === "changed" ? f.changed : props.kind === "untracked" ? "?" : "!");
  return (
    <div className={`repo-group ${props.kind}`}>
      <div className="repo-group-head">
        <span className="repo-dot" aria-hidden />
        <strong>{props.title}</strong>
        <span className="repo-count">{props.files.length}</span>
        <span className="muted small repo-hint">{props.hint}</span>
      </div>
      <ul className="repo-files">
        {shown.map(f => {
          // "src/dao/" (a new folder) keeps its slash; the name is the last part.
          const slash = f.path.replace(/\/$/, "").lastIndexOf("/");
          const dir = f.path.slice(0, slash + 1);
          const name = f.path.slice(slash + 1);
          const c = code(f);
          const word = t.study.repoCodes[c] ?? c;
          return (
            <li key={f.path}>
              {/* A new folder ("docs/") has no single file to show. */}
              <button
                className="repo-file-row"
                disabled={f.path.endsWith("/")}
                title={`${f.from ? `${f.from} → ${f.path}` : f.path}${f.path.endsWith("/") ? "" : ` · ${t.study.repoView}`}`}
                onClick={() => props.onOpen(f.path)}
              >
                <span className="repo-code mono" title={word} aria-label={word}>
                  {c}
                </span>
                <span className="repo-file one-line">
                  <span className="repo-name">{name}</span>
                  {dir && <span className="muted"> {dir}</span>}
                  {f.from && <span className="muted"> ← {f.from}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {props.files.length > FEW && (
        <button className="btn ghost repo-more" onClick={() => setAll(v => !v)}>
          {all ? t.study.repoShowFewer : t.study.repoShowAll(props.files.length)}
        </button>
      )}
    </div>
  );
}

/** "Hoje", "Ontem" or the date, for the day lines of the history. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return t.study.repoDayToday;
  if (days === 1) return t.study.repoDayYesterday;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function commitWhen(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? t.study.repoToday(clock(d)) : days === 1 ? t.study.repoYesterday(clock(d)) : t.study.repoDaysAgo(days);
}
