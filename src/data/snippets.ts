import type { Storage } from "../storage/types";

// CSS snippets (as Obsidian's .obsidian/snippets): .css files in .studium/snippets. They go to
// the other devices with sync; which ones are on is kept per device (Appearance.snippets).

export const SNIPPETS_DIR = ".studium/snippets";

/** Names of the snippet files (without ".css"), sorted. */
export async function listSnippets(s: Storage): Promise<string[]> {
  return (await s.list(SNIPPETS_DIR))
    .filter(f => !f.isDir && f.name.endsWith(".css"))
    .map(f => f.name.slice(0, -4))
    .sort((a, b) => a.localeCompare(b));
}

const pathOf = (name: string) => `${SNIPPETS_DIR}/${safeSnippetName(name)}.css`;

/** A file name without characters that are not allowed in file names. */
export const safeSnippetName = (name: string) => name.replace(/[\\/:*?"<>|\n\r\t]/g, "-").replace(/^\.+/, "").trim() || "snippet";

export const readSnippet = (s: Storage, name: string) => s.read(pathOf(name));
export const saveSnippet = (s: Storage, name: string, css: string) => s.write(pathOf(name), css);
export const removeSnippet = (s: Storage, name: string) => s.remove(pathOf(name));

/** The text of the snippets that are on (missing files are skipped). */
export async function loadSnippets(s: Storage, on: string[] | undefined): Promise<{ name: string; css: string }[]> {
  const have = new Set(await listSnippets(s));
  const out: { name: string; css: string }[] = [];
  for (const name of on ?? []) if (have.has(name)) out.push({ name, css: await readSnippet(s, name).catch(() => "") });
  return out;
}

export const SNIPPET_EXAMPLE = `/* Studium CSS snippet. Colors are variables: --bg, --surface, --text, --strong,
   --muted, --accent, --h1, --h2, --h3, --ok, --err. Note text: .cm-content */

.cm-content {
  /* letter-spacing: 0.01em; */
}
`;
