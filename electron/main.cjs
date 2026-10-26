// Electron main process: opens the window and gives the page a small, restricted file API.
// The page itself has no Node.js access (contextIsolation on, nodeIntegration off).
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const adb = require("./adb.cjs");

const configFile = () => path.join(app.getPath("userData"), "config.json");

// The PDF saved last (opened by the toast's "Open") and its folder (offered next time).
let lastPdf = null;
let lastPdfDir = null;

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

let dataDir = readConfig().dataDir || null;

// Turns a relative data path into an absolute one, refusing anything outside the data folder.
function resolve(rel) {
  if (!dataDir) throw new Error("No data folder chosen");
  if (typeof rel !== "string" || rel.startsWith("/") || rel.split("/").some(p => p === ".." || p === ".")) {
    throw new Error(`Invalid path: ${rel}`);
  }
  const abs = path.resolve(dataDir, rel);
  if (abs !== dataDir && !abs.startsWith(dataDir + path.sep)) throw new Error(`Invalid path: ${rel}`);
  return abs;
}

async function atomicWrite(rel, data) {
  const abs = resolve(rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  const fh = await fsp.open(tmp, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, abs);
}

const info = (name, st) => ({ name, isDir: st.isDirectory(), size: st.size, mtime: Math.floor(st.mtimeMs) });

// Workbench ↔ a local git repository (ui/study/RepoBox). The page only knows the project's
// `repo_id`; the folder's path lives in this PC's config.json (`repos`), is picked here with the
// folder dialog and is never sent by the page. Git only reads: status and log, with optional
// locks off so it does not even touch the index.
const REPO_ID = /^[a-z0-9]{8,32}$/;
// A branch name as git prints it (never starting with "-", so it cannot pass as an option).
const REF = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,200}$/;
const REPO_LOG_PAGE = 50;
// ls-files output kept, in characters (about 40 000 paths).
const REPO_FILES_MAX = 2_000_000;
// The file viewer reads at most this much text; pictures up to REPO_IMAGE_MAX.
const REPO_VIEW_MAX = 512 * 1024;
const REPO_IMAGE_MAX = 5 * 1024 * 1024;
const REPO_IMAGES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon" };

function repoPath(id) {
  if (!REPO_ID.test(String(id))) throw new Error("Invalid project id");
  return (readConfig().repos || {})[id] || null;
}

function setRepoPath(id, dir) {
  const cfg = readConfig();
  const repos = { ...(cfg.repos || {}) };
  if (dir) repos[id] = dir;
  else delete repos[id];
  writeConfig({ ...cfg, repos });
}

const git = (dir, args) =>
  new Promise((done, fail) =>
    require("child_process").execFile(
      "git",
      ["-C", dir, ...args],
      { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" }, maxBuffer: 8 << 20, timeout: 15000 },
      (err, out, errOut) => (err ? fail(Object.assign(err, { stderr: String(errOut || "").trim() })) : done(out)),
    ),
  );

// A program on PATH (absolute path), or null.
function findProgram(name) {
  const ok = p => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (name.includes("/")) return path.isAbsolute(name) && ok(name) ? name : null;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const p = path.join(dir, name);
    if (dir && ok(p)) return p;
  }
  return null;
}

const TERMINALS = ["xdg-terminal-exec", "kitty", "foot", "alacritty", "wezterm", "ghostty", "konsole", "gnome-terminal", "xfce4-terminal", "xterm"];

async function repoDirOrThrow(id) {
  const dir = repoPath(id);
  if (!dir) throw new Error("No folder linked");
  if (!(await fsp.stat(dir).catch(() => null))?.isDirectory()) throw new Error(`Folder not found: ${dir}`);
  return dir;
}

const handlers = {
  "config:get": () => ({ dataDir, defaultDataDir: path.join(os.homedir(), "Studium"), platform: "electron" }),
  "config:setDataDir": async (_e, dir) => {
    if (typeof dir !== "string" || !path.isAbsolute(dir)) throw new Error("Folder must be an absolute path");
    await fsp.mkdir(dir, { recursive: true });
    dataDir = path.resolve(dir);
    writeConfig({ ...readConfig(), dataDir });
    startWatch();
    return dataDir;
  },
  "dialog:pickFolder": async e => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled ? null : r.filePaths[0];
  },
  "dialog:saveBackup": async (e, name, data) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: path.join(os.homedir(), path.basename(String(name))),
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, Buffer.from(data));
    return r.filePath;
  },
  "fs:list": async (_e, dir) => {
    const abs = dir ? resolve(dir) : resolve("");
    let names;
    try {
      names = await fsp.readdir(abs);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    const out = [];
    for (const n of names) {
      if (n.includes(".tmp-")) continue;
      try {
        out.push(info(n, await fsp.stat(path.join(abs, n))));
      } catch {
        /* removed meanwhile */
      }
    }
    return out;
  },
  "fs:stat": async (_e, rel) => {
    try {
      const abs = resolve(rel);
      return info(path.basename(abs), await fsp.stat(abs));
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
  "fs:read": (_e, rel) => fsp.readFile(resolve(rel), "utf8"),
  "fs:readBinary": async (_e, rel) => new Uint8Array(await fsp.readFile(resolve(rel))),
  "fs:write": (_e, rel, text) => atomicWrite(rel, text),
  "fs:writeBinary": (_e, rel, data) => atomicWrite(rel, Buffer.from(data)),
  "fs:move": async (_e, from, to) => {
    const dst = resolve(to);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(resolve(from), dst);
  },
  "fs:remove": (_e, rel) => fsp.rm(resolve(rel), { recursive: true, force: true }),
  "shell:openFolder": () => dataDir && shell.openPath(dataDir),
  // PDF export (ui/pdf.ts): the page shows only the note when printed; its CSS sets the page
  // size and margins.
  "print:pdf": async (e, { name, landscape, pageSize }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    // The page margins show the window's own background: white for paper while printing.
    const bg = win.getBackgroundColor();
    win.setBackgroundColor("#ffffff");
    let data;
    try {
      data = await e.sender.printToPDF({ printBackground: true, preferCSSPageSize: true, landscape: !!landscape, pageSize: pageSize || "A4" });
    } finally {
      win.setBackgroundColor(bg);
    }
    const safe = String(name || "Studium").replace(/[\\/:*?"<>|\n\r\t]/g, "-").trim().slice(0, 120) || "Studium";
    // Test helper: STUDIUM_PDF_OUT saves there without asking.
    const { canceled, filePath } = process.env.STUDIUM_PDF_OUT ? { canceled: false, filePath: process.env.STUDIUM_PDF_OUT } : await dialog.showSaveDialog(win, {
      defaultPath: path.join(lastPdfDir || app.getPath("documents"), `${safe}.pdf`),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, data);
    lastPdf = filePath;
    lastPdfDir = path.dirname(filePath);
    return filePath;
  },
  "print:openLast": () => lastPdf && shell.openPath(lastPdf),
  "shell:openSnippets": async () => {
    if (!dataDir) return;
    const dir = path.join(dataDir, ".studium", "snippets");
    await fsp.mkdir(dir, { recursive: true });
    return shell.openPath(dir);
  },
  // Font families installed on the PC (Settings → Appearance), from fontconfig.
  "fonts:list": () =>
    new Promise(done =>
      require("child_process").execFile("fc-list", [":", "family"], { maxBuffer: 4 << 20 }, (err, out) => {
        if (err) return done([]);
        const names = new Set();
        for (const line of out.split("\n")) {
          const name = line.split(",")[0].trim();
          if (name && !/emoji|fangsong|awesome|symbol|dingbat|cursor/i.test(name)) names.add(name);
        }
        done([...names].sort((a, b) => a.localeCompare(b)));
      }),
    ),
  // Only web links: the page never gets to open files or other programs this way.
  "shell:openLink": (_e, url) => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error("Not a web link");
    return shell.openExternal(String(url));
  },
  // Attachments (school assignments) open in the system's app for their type; anything that
  // could run as a program is refused.
  "shell:openFile": async (_e, rel) => {
    const abs = resolve(rel);
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error("Not a file");
    if (/\.(desktop|sh|bash|zsh|run|bin|appimage|exe|bat|cmd|com|msi|jar|py|pl|rb)$/i.test(abs) || st.mode & 0o111)
      throw new Error("This file could run as a program; open it from the folder instead");
    const err = await shell.openPath(abs);
    if (err) throw new Error(err);
  },
  "repo:link": async (e, id) => {
    repoPath(id);
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: repoPath(id) || path.join(os.homedir(), "Development"),
      properties: ["openDirectory"],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const picked = r.filePaths[0];
    let top;
    try {
      top = (await git(picked, ["rev-parse", "--show-toplevel"])).trim();
    } catch (err) {
      return { error: err.code === "ENOENT" ? "git-missing" : "not-repo", path: picked };
    }
    setRepoPath(id, top);
    return { path: top };
  },
  "repo:unlink": (_e, id) => {
    repoPath(id);
    setRepoPath(id, null);
  },
  // { state: "none" } | { state: "missing", path } | { state: "git-missing", path }
  // | { state: "error", path, message } | { state: "ok", path, status, branches, files, filesCut }
  // status = `git status --porcelain=v2 --branch -z`; data/gitstatus parses all of it.
  "repo:status": async (_e, id) => {
    const dir = repoPath(id);
    if (!dir) return { state: "none" };
    if (!(await fsp.stat(dir).catch(() => null))?.isDirectory()) return { state: "missing", path: dir };
    let status;
    try {
      status = await git(dir, ["status", "--porcelain=v2", "--branch", "-z"]);
    } catch (err) {
      if (err.code === "ENOENT") return { state: "git-missing", path: dir };
      return { state: "error", path: dir, message: err.stderr || err.message };
    }
    // Branches here and on the remotes (symbolic ones like origin/HEAD left out), and every
    // file git sees: tracked plus new ones not ignored. A repository with no commit has none.
    const branches = await git(dir, [
      "for-each-ref",
      "--format=%(refname)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track)%1f%(committerdate:iso-strict)%1f%(subject)%1f%(symref)%1e",
      "refs/heads",
      "refs/remotes",
    ]).catch(() => "");
    let files = await git(dir, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).catch(() => "");
    // A huge folder: keep the first entries (the screen says so).
    const cut = files.length > REPO_FILES_MAX;
    if (cut) files = files.slice(0, files.lastIndexOf("\0", REPO_FILES_MAX));
    return { state: "ok", path: dir, status, branches, files, filesCut: cut };
  },
  // One page of history: `ref` is a branch name (or HEAD), `skip` how many came already.
  // The first page also says how many commits there are.
  "repo:log": async (_e, id, ref, skip) => {
    const dir = await repoDirOrThrow(id);
    ref = String(ref || "HEAD");
    if (!REF.test(ref) || ref.includes("..")) throw new Error("Invalid branch name");
    skip = Math.max(0, Math.floor(Number(skip) || 0));
    const log = await git(dir, ["log", `--skip=${skip}`, "-n", String(REPO_LOG_PAGE), "--format=%h%x1f%s%x1f%cI%x1f%D%x1f%an%x1e", ref, "--"]).catch(() => "");
    const total = skip ? null : Number((await git(dir, ["rev-list", "--count", ref, "--"]).catch(() => "0")).trim()) || 0;
    return { log, total, page: REPO_LOG_PAGE };
  },
  // One file of the project for the viewer, read only: { text, size, cut } | { image, size }
  // | { binary, size } | { missing }. Paths that lead out of the folder (also by a link) are refused.
  "repo:readFile": async (_e, id, rel) => {
    const top = await fsp.realpath(await repoDirOrThrow(id));
    let abs;
    try {
      abs = await fsp.realpath(path.resolve(top, String(rel ?? "")));
    } catch (err) {
      if (err.code === "ENOENT") return { missing: true };
      throw err;
    }
    if (!abs.startsWith(top + path.sep)) throw new Error("Outside the project folder");
    // git's own folder (its config can hold a token in the remote's address) is not a project file.
    if (path.relative(top, abs).split(path.sep).includes(".git")) throw new Error("Not a project file");
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error("Not a file");
    const type = REPO_IMAGES[path.extname(abs).slice(1).toLowerCase()];
    if (type && st.size <= REPO_IMAGE_MAX) return { image: `data:${type};base64,${(await fsp.readFile(abs)).toString("base64")}`, size: st.size };
    const fh = await fsp.open(abs, "r");
    try {
      const buf = Buffer.alloc(Math.min(st.size, REPO_VIEW_MAX));
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const data = buf.subarray(0, bytesRead);
      // A NUL byte near the start: not text (class files, jars, zips...).
      if (type || data.subarray(0, 8000).includes(0)) return { binary: true, size: st.size };
      return { text: data.toString("utf8"), size: st.size, cut: st.size > REPO_VIEW_MAX };
    } finally {
      await fh.close();
    }
  },
  "repo:openFolder": async (_e, id) => {
    const err = await shell.openPath(await repoDirOrThrow(id));
    if (err) throw new Error(err);
  },
  // A terminal in the project folder: $TERMINAL first, then the usual ones.
  "repo:openTerminal": async (_e, id) => {
    const dir = await repoDirOrThrow(id);
    const term = [process.env.TERMINAL, ...TERMINALS].filter(Boolean).map(findProgram).find(Boolean);
    if (!term) throw new Error("No terminal program found");
    const child = require("child_process").spawn(term, [], { cwd: dir, detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  },
  "sync:devices": () => adb.devices(),
  "sync:pcName": () => os.hostname(),
  "sync:localHashes": () => adb.localHashes(resolve("")),
  "sync:deviceHashes": (_e, serial, root) => adb.deviceHashes(String(serial), root),
  ...Object.fromEntries(
    Object.entries(adb.deviceFs).map(([op, fn]) => [`dev:${op}`, (_e, serial, root, ...args) => fn(String(serial), root, ...args)]),
  ),
};

const ICON = path.join(__dirname, "../resources/icon.png");
let watcher = null;
let mainWindow = null;

const PAGE = path.join(__dirname, "../dist/index.html");

function load(win) {
  if (process.env.VITE_DEV_URL) win.loadURL(process.env.VITE_DEV_URL);
  else win.loadFile(PAGE);
}

const webPreferences = () => ({
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
});

// 100% offline: never open or load anything from the network.
function lockDown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
}

function attachShot(win) {
  if (!process.env.STUDIUM_SHOT) return;
  // Test helper: save a screenshot and quit (used to check the UI without a person watching).
  // STUDIUM_SHOT_JS: a script run in the page first (clicks, typing), awaited if it returns a promise.
  // STUDIUM_SHOT_ZOOM: page zoom, e.g. 0.7 to see the wide layout in a small tiled window.
  win.webContents.once("did-finish-load", () =>
    setTimeout(async () => {
      if (process.env.STUDIUM_SHOT_ZOOM) win.webContents.setZoomFactor(Number(process.env.STUDIUM_SHOT_ZOOM));
      if (process.env.STUDIUM_SHOT_JS) {
        await win.webContents.executeJavaScript(process.env.STUDIUM_SHOT_JS).catch(e => console.error(e));
        await new Promise(r => setTimeout(r, Number(process.env.STUDIUM_SHOT_WAIT || 800)));
      }
      // STUDIUM_SHOT=close: close the window the way the window manager does (tests saving on close).
      if (process.env.STUDIUM_SHOT === "close") {
        if (process.env.STUDIUM_SHOT_ZOOM && !win.isDestroyed()) win.webContents.setZoomFactor(1);
        return win.isDestroyed() || win.close();
      }
      if (!win.isDestroyed()) fs.writeFileSync(process.env.STUDIUM_SHOT, (await win.webContents.capturePage()).toPNG());
      // Chromium keeps a page's zoom for the next runs: put it back so the app opens at 100%.
      if (process.env.STUDIUM_SHOT_ZOOM && !win.isDestroyed()) win.webContents.setZoomFactor(1);
      app.quit();
    }, Number(process.env.STUDIUM_SHOT_DELAY || 1500)),
  );
}

// Tells the page when a file changes outside the app (another editor, sync…).
function startWatch() {
  watcher?.close();
  watcher = null;
  if (!dataDir) return;
  try {
    watcher = fs.watch(dataDir, { recursive: true }, (_ev, file) => {
      if (!file || file.includes(".tmp-")) return;
      mainWindow?.webContents.send("fs:changed", file.split(path.sep).join("/"));
    });
  } catch {
    /* watching is a convenience; the app also checks files before saving */
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: ICON,
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: "#010a29",
    title: "Studium",
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  lockDown(mainWindow);
  // Ctrl+= / Ctrl+- / Ctrl+0 size the interface through the app's setting (Settings →
  // Appearance), not through the built-in zoom of the default menu.
  mainWindow.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown" || !input.control || input.alt || input.meta) return;
    if (!["=", "+", "-", "0"].includes(input.key)) return;
    e.preventDefault();
    mainWindow.webContents.send("zoom:key", input.key);
  });
  load(mainWindow);
  attachShot(mainWindow);
  // Closing: give the page up to 3 s to write unsaved edits, then close.
  let closing = false;
  mainWindow.on("close", e => {
    if (closing) return;
    e.preventDefault();
    closing = true;
    const win = mainWindow;
    let finished = false;
    const done = () => {
      if (finished || win.isDestroyed()) return;
      finished = true;
      ipcMain.removeListener("app:flushed", done);
      win.destroy();
    };
    ipcMain.on("app:flushed", done);
    setTimeout(done, 3000);
    win.webContents.send("app:closing");
  });
  mainWindow.on("closed", () => (mainWindow = null));
}

if (process.env.STUDIUM_CONFIG_DIR) app.setPath("userData", process.env.STUDIUM_CONFIG_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch brings this running instance to the front and exits.
  app.on("second-instance", () => {
    if (!mainWindow) return createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    dataDir = readConfig().dataDir || null;
    for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
    startWatch();
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
