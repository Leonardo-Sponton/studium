// USB sync, device side (SPEC 6): the phone's data folder reached through adb. Every call runs
// the adb program; the page never builds shell commands itself.
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const SDK_ADB = path.join(os.homedir(), "Android/Sdk/platform-tools/adb");

let adbPath = null;

function run(file, args, { binary = false, timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: binary ? "buffer" : "utf8", maxBuffer: 256 << 20, timeout }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.message = String(stderr || stdout || err.message).trim() || err.message;
        reject(err);
      } else resolve(stdout);
    });
  });
}

/** adb from PATH, else the Android SDK's copy (SPEC 6.1). Null when there is none. */
async function findAdb() {
  if (adbPath) return adbPath;
  for (const candidate of ["adb", SDK_ADB]) {
    try {
      await run(candidate, ["version"], { timeout: 10_000 });
      return (adbPath = candidate);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

async function adb(args, opts) {
  const bin = await findAdb();
  if (!bin) throw new Error("adb was not found. Install android-tools (sudo pacman -S android-tools).");
  return run(bin, args, opts);
}

/** Quotes a path for the device's shell. */
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** `adb devices -l` → [{ serial, state, model }]. state: device, unauthorized, offline… */
async function devices() {
  if (!(await findAdb())) return { adb: false, list: [] };
  const out = await adb(["devices", "-l"]);
  const list = out
    .split("\n")
    .slice(1)
    .map(l => l.trim().split(/\s+/))
    .filter(w => w.length >= 2 && w[0])
    .map(([serial, state, ...rest]) => {
      const model = rest.find(r => r.startsWith("model:"));
      return { serial, state, model: model ? model.slice(6).replace(/_/g, "-") : serial };
    });
  return { adb: true, list };
}

const shell = (serial, cmd, opts) => adb(["-s", serial, "shell", cmd], opts);

// Paths: `root` is the device's data folder (absolute), `rel` a path inside it. The same checks
// as the PC side, so a path can never leave the folder.
function abs(root, rel) {
  if (typeof root !== "string" || !root.startsWith("/") || root.split("/").includes("..")) throw new Error(`Invalid folder: ${root}`);
  if (typeof rel !== "string" || rel.startsWith("/") || rel.split("/").some(p => p === ".." || p === ".")) {
    throw new Error(`Invalid path: ${rel}`);
  }
  return rel ? `${root.replace(/\/+$/, "")}/${rel.replace(/\/+$/, "")}` : root.replace(/\/+$/, "");
}

/** sha256 of every file in the device folder except the trash: { path: hash }. */
async function deviceHashes(serial, root) {
  const dir = abs(root, "");
  const out = await shell(
    serial,
    `cd ${q(dir)} || exit 3; find . -path ./.trash -prune -o -type f -exec sha256sum {} +`,
    { timeout: 300_000 },
  ).catch(e => {
    if (e.code === 3) throw new Error(`The folder ${dir} was not found on the device. Open Studium there once.`);
    throw e;
  });
  const files = {};
  for (const line of out.split("\n")) {
    const m = /^([0-9a-f]{64}) {2}\.\/(.+)$/.exec(line);
    if (m) files[m[2]] = m[1];
  }
  return files;
}

/** Same for the PC's data folder, computed here (fast, and no file goes through the page). */
async function localHashes(dataDir) {
  const files = {};
  async function walk(rel) {
    let entries;
    try {
      entries = await fsp.readdir(path.join(dataDir, rel), { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (r !== ".trash") await walk(r);
      } else if (e.isFile()) {
        files[r] = crypto.createHash("sha256").update(await fsp.readFile(path.join(dataDir, r))).digest("hex");
      }
    }
  }
  await walk("");
  return files;
}

const tmpFile = () => path.join(os.tmpdir(), `studium-sync-${process.pid}-${crypto.randomBytes(6).toString("hex")}`);

// The Storage interface (src/storage/types.ts) over adb, for one device folder.
const deviceFs = {
  async stat(serial, root, rel) {
    const p = abs(root, rel);
    const out = await shell(serial, `stat -c '%F|%s|%Y' ${q(p)} 2>/dev/null || echo missing`);
    const line = out.trim();
    if (line === "missing") return null;
    const [kind, size, mtime] = line.split("|");
    return { name: p.slice(p.lastIndexOf("/") + 1), isDir: kind === "directory", size: Number(size), mtime: Number(mtime) * 1000 };
  },
  async list(serial, root, rel) {
    const p = abs(root, rel);
    const out = await shell(serial, `cd ${q(p)} 2>/dev/null || exit 0; for f in .* *; do [ -e "$f" ] && [ "$f" != . ] && [ "$f" != .. ] && stat -c '%F|%s|%Y|%n' -- "$f"; done; true`);
    return out
      .split("\n")
      .filter(Boolean)
      .map(l => {
        const [kind, size, mtime, ...name] = l.split("|");
        return { name: name.join("|"), isDir: kind === "directory", size: Number(size), mtime: Number(mtime) * 1000 };
      })
      .filter(f => !f.name.includes(".tmp-"));
  },
  async readBinary(serial, root, rel) {
    const tmp = tmpFile();
    try {
      await adb(["-s", serial, "pull", abs(root, rel), tmp], { timeout: 300_000 });
      return new Uint8Array(await fsp.readFile(tmp));
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
  },
  async read(serial, root, rel) {
    return Buffer.from(await deviceFs.readBinary(serial, root, rel)).toString("utf8");
  },
  /** Atomic like the app's own writes: push to a temp name, rename, then check what arrived. */
  async writeBinary(serial, root, rel, data) {
    const target = abs(root, rel);
    const remoteTmp = `${target}.tmp-sync-${Date.now()}`;
    const tmp = tmpFile();
    const buf = Buffer.from(data);
    try {
      await fsp.writeFile(tmp, buf);
      await shell(serial, `mkdir -p ${q(path.posix.dirname(target))}`);
      await adb(["-s", serial, "push", tmp, remoteTmp], { timeout: 300_000 });
      const out = await shell(serial, `mv -f ${q(remoteTmp)} ${q(target)} && sha256sum ${q(target)}`);
      const want = crypto.createHash("sha256").update(buf).digest("hex");
      if (out.slice(0, 64) !== want) throw new Error(`Copying ${rel} to the device failed (the file arrived different)`);
    } catch (e) {
      await shell(serial, `rm -f ${q(remoteTmp)}`).catch(() => {});
      throw e;
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
  },
  async write(serial, root, rel, text) {
    return deviceFs.writeBinary(serial, root, rel, Buffer.from(String(text), "utf8"));
  },
  async move(serial, root, from, to) {
    const dst = abs(root, to);
    await shell(serial, `mkdir -p ${q(path.posix.dirname(dst))} && mv ${q(abs(root, from))} ${q(dst)}`);
  },
  async remove(serial, root, rel) {
    const p = abs(root, rel);
    if (p === abs(root, "")) throw new Error("Refusing to remove the whole data folder");
    await shell(serial, `rm -rf ${q(p)}`);
  },
};

module.exports = { devices, deviceHashes, localHashes, deviceFs };
