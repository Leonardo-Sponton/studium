import type { Storage } from "../../storage/types";
import { loadDrawing } from "../../data/drawings";

// The Excalidraw library is big: it loads the first time a drawing is opened or shown.
// Its fonts come from the app's own files (tools/excalidraw-fonts.mjs), never from the web.

type Lib = typeof import("@excalidraw/excalidraw");
let lib: Promise<Lib> | null = null;

export function loadExcalidraw(): Promise<Lib> {
  if (!lib) {
    (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL("excalidraw/", location.href).href;
    lib = Promise.all([import("@excalidraw/excalidraw"), import("@excalidraw/excalidraw/index.css")]).then(([m]) => m);
    lib.catch(() => (lib = null));
  }
  return lib;
}

const isDark = () => document.documentElement.dataset.theme !== "light";

/** Drawn pictures by path + file change + theme. */
const svgs = new Map<string, { key: string; svg: Promise<string> }>();

/** A drawing as SVG text, for notes and PDF export (`dark`: colors turned for a dark page). */
export async function drawingSvg(s: Storage, path: string, dark = isDark()): Promise<string> {
  const st = await s.stat(path);
  const key = `${st?.mtime}:${st?.size}:${dark}`;
  const old = svgs.get(`${path}|${dark}`);
  if (old && old.key === key) return old.svg;
  const svg = (async () => {
    const [{ exportToSvg }, d] = await Promise.all([loadExcalidraw(), loadDrawing(s, path)]);
    const elements = d.scene.elements.filter(e => !e.isDeleted);
    if (!elements.length) return "";
    const el = await exportToSvg({
      elements,
      appState: { ...d.scene.appState, exportBackground: false, exportWithDarkMode: dark, exportEmbedScene: false },
      files: d.scene.files as never,
      exportPadding: 12,
    });
    return el.outerHTML;
  })();
  svgs.set(`${path}|${dark}`, { key, svg });
  svg.catch(() => svgs.delete(`${path}|${dark}`));
  return svg;
}

// Notes showing a drawing redraw it when it is saved.
const listeners = new Set<(path: string) => void>();
export const onDrawingSaved = (cb: (path: string) => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
export const drawingSaved = (path: string) => listeners.forEach(cb => cb(path));
