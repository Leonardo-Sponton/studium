// Reads what git says about a workbench project's local folder (electron/main.cjs repo:status):
// `git status --porcelain=v2 --branch -z` and the last commits of `git log`
// (format %h US %s US %cI RS). Nothing here runs git; it only parses its output.

/** One changed file. `staged`/`changed`: git's letter for the index / the working folder
 *  (M modified, A added, D deleted, R renamed, C copied, T type changed), or "" when none. */
export interface GitFile {
  path: string;
  /** Renamed or copied from. */
  from?: string;
  staged: string;
  changed: string;
  untracked?: boolean;
  conflict?: boolean;
}

export interface GitStatus {
  /** Branch name, or null when detached. */
  branch: string | null;
  /** No commit yet. */
  initial: boolean;
  /** The current commit (changes when you commit, pull or switch branch). */
  oid: string | null;
  /** e.g. origin/main, or null when the branch has none. */
  upstream: string | null;
  /** Commits to push / to pull, compared with the remote as of the last fetch. */
  ahead: number;
  behind: number;
  files: GitFile[];
}

export interface GitCommit {
  hash: string;
  subject: string;
  /** ISO date (committer). */
  date: string;
  /** Branches and tags pointing here, as git decorates them ("HEAD -> main", "origin/main", "tag: v1"). */
  refs: string[];
  author: string;
}

const letter = (c: string) => (c === "." ? "" : c);

export function parseStatus(out: string): GitStatus {
  const st: GitStatus = { branch: null, initial: false, oid: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) continue;
    if (line.startsWith("# ")) {
      const [key, ...rest] = line.slice(2).split(" ");
      const val = rest.join(" ");
      if (key === "branch.oid") {
        st.initial = val === "(initial)";
        st.oid = st.initial ? null : val;
      }
      else if (key === "branch.head") st.branch = val === "(detached)" ? null : val;
      else if (key === "branch.upstream") st.upstream = val;
      else if (key === "branch.ab") {
        const m = /^\+(\d+) -(\d+)$/.exec(val);
        if (m) [st.ahead, st.behind] = [Number(m[1]), Number(m[2])];
      }
      continue;
    }
    const kind = line[0];
    // Fields before the path: "1": 8, "2": 9 (+ the old path in the next part), "u": 10.
    const skip = kind === "1" ? 8 : kind === "2" ? 9 : kind === "u" ? 10 : 0;
    if (skip) {
      const f = line.split(" ");
      const xy = f[1] ?? "..";
      const file: GitFile = { path: f.slice(skip).join(" "), staged: letter(xy[0]), changed: letter(xy[1]) };
      if (kind === "2") file.from = parts[++i];
      if (kind === "u") file.conflict = true;
      st.files.push(file);
    } else if (kind === "?") {
      st.files.push({ path: line.slice(2), staged: "", changed: "", untracked: true });
    }
    // "!" (ignored) never comes: status leaves ignored files out by default.
  }
  return st;
}

/** `git log --format=%h US %s US %cI US %D US %an RS`. */
export function parseLog(out: string): GitCommit[] {
  return out
    .split("\x1e")
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => {
      const [hash = "", subject = "", date = "", refs = "", author = ""] = r.split("\x1f");
      return { hash, subject, date, refs: refs ? refs.split(", ").filter(x => x !== "origin/HEAD" && !x.endsWith("/HEAD")) : [], author };
    });
}

export interface GitBranch {
  /** "main", or "origin/main" for a remote one. */
  name: string;
  remote: boolean;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** The upstream branch was deleted on the remote. */
  gone: boolean;
  date: string;
  subject: string;
}

/** `git for-each-ref` of refs/heads and refs/remotes (format in electron/main.cjs repo:status).
 *  Local branches first (the current one on top), then the remote ones; symbolic refs left out. */
export function parseBranches(out: string): GitBranch[] {
  const list: GitBranch[] = [];
  for (const rec of out.split("\x1e")) {
    const [ref = "", head = "", upstream = "", track = "", date = "", subject = "", symref = ""] = rec.replace(/^\n/, "").split("\x1f");
    if (!ref || symref) continue;
    const remote = ref.startsWith("refs/remotes/");
    const name = ref.replace(/^refs\/(heads|remotes)\//, "");
    const n = (w: string) => Number(new RegExp(`${w} (\\d+)`).exec(track)?.[1] ?? 0);
    list.push({ name, remote, current: head === "*", upstream: upstream || null, ahead: n("ahead"), behind: n("behind"), gone: track.includes("gone"), date, subject });
  }
  return list.sort((a, b) => Number(a.remote) - Number(b.remote) || Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
}

/** A folder or file of the project, for the file tree. `code`: the git letter of a changed file
 *  (M, A, D, R…, "?" new, "!" conflict); a folder has `changed` when something inside it has. */
export interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
  code?: string;
  /** Which group of the Changes list the file is in (its color). */
  kind?: ChangeKind;
  changed?: boolean;
}

export type ChangeKind = "conflict" | "staged" | "changed" | "untracked";

export const changeKind = (f: GitFile): ChangeKind => (f.conflict ? "conflict" : f.untracked ? "untracked" : f.changed ? "changed" : "staged");

/** The letter shown for a changed file: conflict, then not-yet-added change, then staged, then new. */
export const fileCode = (f: GitFile) => (f.conflict ? "!" : f.untracked ? "?" : f.changed || f.staged);

/** The project's files (`git ls-files -z --cached --others --exclude-standard`) as a tree,
 *  folders first, A–Z; changed files carry their letter. Files deleted and already staged are
 *  added back so the tree shows them too. */
export function buildTree(lsFiles: string, files: GitFile[] = []): TreeNode {
  const root: TreeNode = { name: "", path: "", dir: true, children: [] };
  const codes = new Map<string, { code: string; kind: ChangeKind }>();
  const newDirs: string[] = [];
  for (const f of files) {
    if (f.untracked && f.path.endsWith("/")) newDirs.push(f.path);
    else codes.set(f.path, { code: fileCode(f), kind: changeKind(f) });
  }
  const paths = new Set(lsFiles.split("\0").filter(Boolean));
  for (const p of codes.keys()) paths.add(p);
  const dirs = new Map<string, TreeNode>([["", root]]);
  const dirOf = (path: string): TreeNode => {
    const known = dirs.get(path);
    if (known) return known;
    const slash = path.lastIndexOf("/");
    const parent = dirOf(slash < 0 ? "" : path.slice(0, slash));
    const node: TreeNode = { name: path.slice(slash + 1), path, dir: true, children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const p of paths) {
    const slash = p.lastIndexOf("/");
    const mark = codes.get(p) ?? (newDirs.some(d => p.startsWith(d)) ? { code: "?", kind: "untracked" as const } : undefined);
    dirOf(slash < 0 ? "" : p.slice(0, slash)).children.push({ name: p.slice(slash + 1), path: p, dir: false, children: [], ...mark });
  }
  const finish = (n: TreeNode): boolean => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    let changed = false;
    for (const c of n.children) if (c.dir ? finish(c) : c.code) changed = true;
    if (changed) n.changed = true;
    return changed;
  };
  finish(root);
  return root;
}

/** The changed files in the groups the screen shows: staged (ready to commit), changed (not
 *  staged yet), new (untracked) and conflicts. A file staged and changed again is in both. */
export function groupFiles(files: GitFile[]) {
  return {
    conflicts: files.filter(f => f.conflict),
    staged: files.filter(f => !f.conflict && f.staged),
    changed: files.filter(f => !f.conflict && f.changed),
    untracked: files.filter(f => f.untracked),
  };
}

/** A new project id for linking (repo_id in project.md). */
export const newRepoId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join("") + Date.now().toString(36);
