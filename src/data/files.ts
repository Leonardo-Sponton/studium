import type { Storage } from "../storage/types";

/**
 * Every file under `dir` (recursive), as paths relative to the data folder.
 * `skip` gets each folder path and can leave it out.
 */
export async function walkFiles(s: Storage, dir = "", skip?: (path: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (const f of await s.list(dir)) {
    const path = dir ? `${dir}/${f.name}` : f.name;
    if (f.isDir) {
      if (!skip?.(path)) out.push(...(await walkFiles(s, path, skip)));
    } else out.push(path);
  }
  return out;
}

/** The area a file belongs to: the first folder of its path (study, drawings, templates…). */
export const areaOf = (path: string) => path.split("/")[0];

/** App folders that are not content: .trash, .studium, and any other hidden folder. */
export const isHidden = (path: string) => areaOf(path).startsWith(".");
