import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { AskText } from "../Dialog";
import { onFlush } from "../../data/pending";
import { moveToTrash } from "../../data/trash";
import { drawingTitle, forgetDrawingIndex, loadDrawing, renameDrawing, saveDrawing, type DrawingFile } from "../../data/drawings";
import { drawingSaved, loadExcalidraw } from "./excalidraw";
import { modeOf, pauseCssZoom } from "../appearance";
import { lang, t } from "../../i18n";

// A drawing open on the whole screen: the Excalidraw editor, saved a moment after each change
// and when leaving (back, closing the app).

/** Scene settings kept in the file (the rest of Excalidraw's state is per session). */
const KEEP = /^(currentItem|viewBackgroundColor$|gridSize$|gridStep$|gridModeEnabled$|scrollX$|scrollY$|zoom$|theme$|objectsSnapModeEnabled$|frameRendering$)/;

type Lib = Awaited<ReturnType<typeof loadExcalidraw>>;

export function DrawingEditor({ path: startPath, onClose }: { path: string; onClose(): void }) {
  const { platform, settings, toast, confirmDelete, bump } = useApp();
  const [lib, setLib] = useState<Lib | null>(null);
  const [file, setFile] = useState<DrawingFile | null>(null);
  const [path, setPath] = useState(startPath);
  const [status, setStatus] = useState<"saved" | "saving" | "changed">("saved");
  const [renaming, setRenaming] = useState(false);
  const latest = useRef<{ elements: readonly any[]; appState: Record<string, unknown>; files: Record<string, any> } | null>(null);
  const savedVersion = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pathRef = useRef(path);
  pathRef.current = path;
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  useEffect(() => {
    let alive = true;
    Promise.all([loadExcalidraw(), loadDrawing(platform.storage, startPath)]).then(([l, d]) => {
      if (!alive) return;
      setLib(l);
      setFile(d);
    }, fail);
    return () => {
      alive = false;
    };
  }, [platform, startPath]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const now = latest.current;
    if (!now || !file || !lib) return;
    const version = lib.hashElementsVersion(now.elements as never);
    if (version === savedVersion.current) return;
    setStatus("saving");
    try {
      const appState = Object.fromEntries(Object.entries(now.appState).filter(([k]) => KEEP.test(k)));
      file.scene = { elements: [...now.elements], appState, files: { ...now.files } };
      await saveDrawing(platform.storage, pathRef.current, file);
      savedVersion.current = version;
      drawingSaved(pathRef.current);
      setStatus("saved");
    } catch (e) {
      setStatus("changed");
      fail(e);
    }
  }, [file, lib, platform]);

  useEffect(() => onFlush(save), [save]);
  useEffect(() => pauseCssZoom(), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const close = async () => {
    await save();
    bump();
    onClose();
  };
  useBack(true, () => void close());

  const remove = async () => {
    if (!(await confirmDelete(drawingTitle(path)))) return;
    clearTimeout(timer.current);
    latest.current = null;
    try {
      await moveToTrash(platform.storage, path);
      forgetDrawingIndex(platform.storage);
      drawingSaved(path);
      bump();
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const rename = async (name: string) => {
    setRenaming(false);
    try {
      await save();
      const to = await renameDrawing(platform.storage, path, name);
      setPath(to);
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const Excalidraw = lib?.Excalidraw as ComponentType<any> | undefined;
  return (
    <div className="drawing-editor">
      <div className="note-bar drawing-bar">
        <button className="btn ghost icon" aria-label={t.common.back} title={t.common.back} onClick={() => void close()}>
          <ArrowLeft size={20} />
        </button>
        <button className="btn ghost drawing-title" title={t.drawings.rename} onClick={() => setRenaming(true)}>
          {drawingTitle(path)}
        </button>
        <span className="note-status">{status === "saved" ? t.note.status.saved : status === "saving" ? t.note.status.saving : t.note.status.unsaved}</span>
        <button className="btn ghost icon" aria-label={t.common.delete} title={t.common.delete} onClick={() => void remove()}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="drawing-canvas">
        {Excalidraw && file ? (
          <Excalidraw
            initialData={{ elements: file.scene.elements, appState: { ...file.scene.appState, collaborators: new Map() }, files: file.scene.files, scrollToContent: true }}
            theme={modeOf(settings.theme)}
            langCode={lang === "pt-BR" ? "pt-BR" : "en"}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: null } }}
            excalidrawAPI={(api: any) => {
              // A drawing bigger than the screen (a phone) opens fitted, not cut at the sides.
              if (!api || !file.scene.elements.length) return;
              requestAnimationFrame(() => {
                const [x1, y1, x2, y2] = lib!.getCommonBounds(file.scene.elements.filter(e => !e.isDeleted));
                const box = document.querySelector(".drawing-canvas")?.getBoundingClientRect();
                if (box && (x2 - x1 > box.width * 0.9 || y2 - y1 > box.height * 0.8))
                  api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 });
              });
            }}
            onChange={(elements: readonly any[], appState: Record<string, unknown>, files: Record<string, any>) => {
              latest.current = { elements, appState, files };
              const version = lib!.hashElementsVersion(elements as never);
              // The first call after opening only reports what was loaded.
              if (savedVersion.current === null) savedVersion.current = version;
              if (version === savedVersion.current) return;
              setStatus("changed");
              clearTimeout(timer.current);
              timer.current = setTimeout(() => void save(), 1200);
            }}
          />
        ) : (
          <p className="muted" style={{ padding: 20 }}>
            {t.common.loading}
          </p>
        )}
      </div>
      {renaming && <AskText title={t.drawings.rename} initial={drawingTitle(path)} onClose={() => setRenaming(false)} onOk={name => void rename(name)} />}
    </div>
  );
}
