import { unzipSync, zipSync, type Zippable } from "fflate";
import { t } from "../i18n";
import { checkPath, type Storage } from "../storage/types";
import { isoMinute, stamp } from "./dates";
import { walkFiles } from "./files";
import { SETTINGS_PATH } from "./settings";

// Backup (SPEC 4.4): the whole data folder in one .zip, and restoring it.
// Restoring checks the zip first, then moves the current data aside to
// .studium/before-restore/ (nothing is erased), then writes the backup's files.

const MANIFEST = "studium-backup.json";
export const BEFORE_RESTORE = ".studium/before-restore";

export interface Backup {
  created: string;
  files: Map<string, Uint8Array>;
}

export class BackupError extends Error {}

const inBeforeRestore = (p: string) => p === BEFORE_RESTORE || p.startsWith(BEFORE_RESTORE + "/");

export const backupName = (at = new Date()) => `studium-backup-${stamp(at)}.zip`;

export async function exportBackup(s: Storage, at = new Date()): Promise<Uint8Array> {
  const zip: Zippable = {};
  const paths = await walkFiles(s, "", inBeforeRestore);
  for (const p of paths) {
    // Text compresses well; images (covers) are already compressed.
    zip[p] = [await s.readBinary(p), { level: /\.(md|json|txt)$/.test(p) ? 6 : 0 }];
  }
  const manifest = { app: "studium", format: 1, created: isoMinute(at), files: paths.length };
  zip[MANIFEST] = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");
  return zipSync(zip);
}

/** Opens and checks a backup without touching the data folder. */
export function readBackup(data: Uint8Array): Backup {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    throw new BackupError(t.errors.notZip);
  }
  let manifest: { app?: string; created?: string };
  try {
    manifest = JSON.parse(new TextDecoder().decode(entries[MANIFEST]));
  } catch {
    manifest = {};
  }
  if (manifest.app !== "studium") throw new BackupError(t.errors.notBackup);
  const files = new Map<string, Uint8Array>();
  for (const [p, bytes] of Object.entries(entries)) {
    if (p === MANIFEST || p.endsWith("/")) continue;
    try {
      checkPath(p);
    } catch {
      throw new BackupError(t.errors.unsafePath(p));
    }
    if (!inBeforeRestore(p)) files.set(p, bytes);
  }
  return { created: manifest.created ?? "", files };
}

/**
 * Replaces the data with a backup. The settings of this device are kept (they are per device).
 * The old data ends up in .studium/before-restore/ (only the latest one is kept).
 */
export async function restoreBackup(s: Storage, b: Backup) {
  await s.remove(BEFORE_RESTORE);
  for (const f of await s.list("")) {
    if (f.name !== ".studium") await s.move(f.name, `${BEFORE_RESTORE}/${f.name}`);
  }
  for (const f of await s.list(".studium")) {
    const p = `.studium/${f.name}`;
    if (p === BEFORE_RESTORE) continue;
    if (p === SETTINGS_PATH) await s.writeBinary(`${BEFORE_RESTORE}/${p}`, await s.readBinary(p));
    else await s.move(p, `${BEFORE_RESTORE}/${p}`);
  }
  for (const [p, bytes] of b.files) {
    if (p === SETTINGS_PATH) continue;
    await s.writeBinary(p, bytes);
    if ((await s.stat(p))?.size !== bytes.length) throw new BackupError(t.errors.writeFailed(p));
  }
}
