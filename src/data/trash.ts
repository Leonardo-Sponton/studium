import type { Storage } from "../storage/types";
import { t } from "../i18n";
import { isoMinute } from "./dates";
import { walkFiles } from "./files";

// Deleting moves a file to .trash/ at the same relative path (SPEC 2.4); nothing is erased
// until the user deletes it from the Trash screen. Where each file came from and when it was
// deleted is kept in .trash/.deleted.json (a file moved by hand is still listed, guessed).
// A folder (a book with its cover and quotes) is deleted and restored as one item.

const TRASH = ".trash";
const INDEX = `${TRASH}/.deleted.json`;

type Index = Record<string, { from: string; at: string }>;

export interface Trashed {
  /** Path inside .trash/. */
  path: string;
  /** Where it was before deleting. */
  from: string;
  /** Deleting time (2026-10-17T21:52), or "" when unknown. */
  at: string;
}

async function readIndex(s: Storage): Promise<Index> {
  try {
    return (await s.stat(INDEX)) ? JSON.parse(await s.read(INDEX)) : {};
  } catch {
    return {};
  }
}

async function writeIndex(s: Storage, index: Index) {
  if (Object.keys(index).length) await s.write(INDEX, JSON.stringify(index, null, 2) + "\n");
  else await s.remove(INDEX);
}

/** .trash/todo/a-2.md → todo/a.md */
const guessFrom = (trashed: string) => trashed.slice(TRASH.length + 1).replace(/-\d+(\.[^./]*)?$/, "$1");

/** A free path: `path` itself, or with -2, -3… before the extension. */
async function freeName(s: Storage, path: string) {
  const m = /^(.*?)(\.[^./]*)?$/.exec(path)!;
  let to = path;
  for (let i = 2; await s.stat(to); i++) to = `${m[1]}-${i}${m[2] ?? ""}`;
  return to;
}

export async function moveToTrash(s: Storage, path: string, now = new Date()): Promise<string> {
  const to = await freeName(s, `${TRASH}/${path}`);
  await s.move(path, to);
  const index = await readIndex(s);
  index[to] = { from: path, at: isoMinute(now) };
  await writeIndex(s, index);
  return to;
}

/** Undo: puts a trashed file back where it was. */
export async function restoreFromTrash(s: Storage, trashed: string, original: string) {
  if (await s.stat(original)) throw new Error(t.errors.exists(original));
  await s.move(trashed, original);
  const index = await readIndex(s);
  delete index[trashed];
  await writeIndex(s, index);
}

/** Everything in the trash, last deleted first. */
export async function listTrash(s: Storage): Promise<Trashed[]> {
  const index = await readIndex(s);
  const files = (await walkFiles(s, TRASH)).filter(p => p !== INDEX);
  // A deleted folder (a book) is one item: its files are listed under the folder.
  const folders = Object.keys(index).filter(k => files.some(f => f.startsWith(`${k}/`)));
  const paths = new Set(files.map(f => folders.find(k => f.startsWith(`${k}/`)) ?? f));
  return [...paths]
    .map(path => ({ path, from: index[path]?.from ?? guessFrom(path), at: index[path]?.at ?? "" }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.from.localeCompare(b.from));
}

/**
 * Puts a file back. If its old place is taken (a new file with the same name), it comes back
 * next to it with -2, -3… Returns the path it got.
 */
export async function restore(s: Storage, item: Trashed): Promise<string> {
  const to = await freeName(s, item.from);
  await restoreFromTrash(s, item.path, to);
  return to;
}

export async function deleteForever(s: Storage, item: Trashed) {
  await s.remove(item.path);
  const index = await readIndex(s);
  delete index[item.path];
  await writeIndex(s, index);
}

export async function emptyTrash(s: Storage) {
  await s.remove(TRASH);
}
