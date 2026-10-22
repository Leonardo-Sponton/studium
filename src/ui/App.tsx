import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Platform } from "../platform/types";
import { Notes } from "../data/notes";
import { initDataFolder, loadSettings, saveSettings, type Settings } from "../data/settings";
import { flushAll } from "../data/pending";
import { Ctx, type AppCtx, type Toast } from "./context";
import { FileAccess, FirstRun } from "./FirstRun";
import { Shell, type OpenRequest } from "./Shell";
import { SyncLock } from "./SyncView";
import { Confirm } from "./Dialog";
import { DrawingEditor } from "./drawing/DrawingEditor";
import { lang, setLang, t } from "../i18n";
import { applyAppearance, applySnippets } from "./appearance";
import { clamp, DEFAULTS, LIMITS, type Appearance } from "../data/appearance";

/** Language of the screens. */
function applyLang(s: Settings["language"]) {
  setLang(s);
}

type Boot =
  | { step: "loading" }
  | { step: "choose" }
  | { step: "access" }
  | { step: "ready"; settings: Settings }
  | { step: "error"; message: string };

export function App({ platform }: { platform: Platform }) {
  const [boot, setBoot] = useState<Boot>({ step: "loading" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<{ text: string; done(ok: boolean): void } | null>(null);
  const [version, setVersion] = useState(0);
  const [openRequest, setOpenRequest] = useState<OpenRequest>();
  // After a language change the screens are drawn anew; this keeps the user in Settings.
  const [startArea, setStartArea] = useState<"settings">();
  const [drawing, setDrawing] = useState<string | null>(null);
  const nextId = useRef(1);
  const notes = useMemo(() => new Notes(platform.storage), [platform]);

  const start = useCallback(async () => {
    try {
      if (!(await platform.getDataDir())) return setBoot({ step: "choose" });
      if (platform.hasFileAccess && !(await platform.hasFileAccess())) return setBoot({ step: "access" });
      await initDataFolder(platform.storage);
      const settings = await loadSettings(platform.storage);
      applyAppearance(settings.theme, settings.appearance, platform);
      void applySnippets(platform, settings.appearance?.snippets);
      applyLang(settings.language);
      setBoot({ step: "ready", settings });
    } catch (e) {
      setBoot({ step: "error", message: String(e) });
    }
  }, [platform]);

  useEffect(() => {
    start();
  }, [start]);

  // Android: coming back from the settings page may have granted file access.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && boot.step === "access" && start();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [boot.step, start]);

  useEffect(() => {
    if (boot.step !== "ready" || !platform.onFileChanged) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = platform.onFileChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setVersion(v => v + 1), 300);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [boot.step, platform]);

  // Unsaved edits are written when the app goes to the background (Android) or closes (desktop).
  useEffect(() => {
    platform.onClosing?.(flushAll);
    const onHide = () => document.visibilityState === "hidden" && flushAll();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [platform]);

  useEffect(() => platform.onOpenRequest?.(target => setOpenRequest({ target, key: Date.now() })), [platform]);

  // Android: files may have changed while the app was in the background (USB sync, a file
  // manager): reload on return.
  useEffect(() => {
    if (boot.step !== "ready" || !platform.onResume) return;
    return platform.onResume(() => setVersion(v => v + 1));
  }, [boot.step, platform]);

  const bump = useCallback(() => setVersion(v => v + 1), []);

  // PC: Ctrl+= / Ctrl+- / Ctrl+0 size the interface; Ctrl+wheel sizes the text of a note (or
  // the interface elsewhere). Seen at once, saved a moment after the last step.
  const live = useRef<{ settings: Settings; update: AppCtx["updateSettings"] } | null>(null);
  useEffect(() => {
    if (platform.name !== "electron") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Appearance | null = null;
    const step = (patch: (a: Appearance) => Partial<Appearance>) => {
      const cur = live.current;
      if (!cur) return;
      const a = { ...(pending ?? cur.settings.appearance ?? {}) };
      Object.assign(a, patch(a));
      for (const k of Object.keys(a) as (keyof Appearance)[]) if (a[k] === undefined) delete a[k];
      pending = a;
      applyAppearance(cur.settings.theme, a);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = pending!;
        pending = null;
        void live.current?.update({ appearance: next });
      }, 400);
    };
    const zoom = (d: number) => (a: Appearance) => {
      const z = d === 0 ? 1 : Math.round(clamp((a.zoom ?? 1) + d, LIMITS.zoom) * 100) / 100;
      return { zoom: z === 1 ? undefined : z };
    };
    const onZoomKey = (key: string) => step(zoom(key === "-" ? -0.1 : key === "0" ? 0 : 0.1));
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const up = e.deltaY < 0;
      const inNote = (e.target as Element | null)?.closest?.(".cm-editor");
      if (inNote && live.current?.settings.appearance?.ctrlWheel !== false)
        step(a => {
          const size = clamp((a.textSize ?? DEFAULTS.textSize) + (up ? 1 : -1), LIMITS.textSize);
          return { textSize: size === DEFAULTS.textSize ? undefined : size };
        });
      else step(zoom(up ? 0.1 : -0.1));
    };
    const stopKeys = platform.onZoomKey?.(onZoomKey);
    addEventListener("wheel", onWheel, { passive: false });
    return () => {
      clearTimeout(timer);
      stopKeys?.();
      removeEventListener("wheel", onWheel);
    };
  }, [platform]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts(list => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), t.action ? 6000 : 3500);
  }, []);

  const confirmDelete = useCallback(
    (what = "", text?: string) =>
      new Promise<boolean>(done => setAsk({ text: text ?? t.common.deleteText(what.trim()), done })),
    [],
  );
  const answer = (ok: boolean) => {
    ask?.done(ok);
    setAsk(null);
  };

  if (boot.step === "loading") return null;
  if (boot.step === "error")
    return (
      <div className="center-screen">
        <div className="card stack">
          <h1>{t.common.somethingWrong}</h1>
          <p className="err mono">{boot.message}</p>
          <button className="btn" onClick={start}>
            {t.common.tryAgain}
          </button>
        </div>
      </div>
    );
  if (boot.step === "choose") return <FirstRun platform={platform} onDone={start} />;
  if (boot.step === "access") return <FileAccess platform={platform} onCheck={start} />;

  const ctx: AppCtx = {
    platform,
    notes,
    settings: boot.settings,
    updateSettings: async s => {
      const settings = { ...boot.settings, ...s };
      await saveSettings(platform.storage, settings);
      applyAppearance(settings.theme, settings.appearance);
      if (settings.appearance?.snippets !== boot.settings.appearance?.snippets) void applySnippets(platform, settings.appearance?.snippets);
      if (settings.language !== boot.settings.language) {
        applyLang(settings.language);
        setStartArea("settings");
        setOpenRequest(undefined); // the new Shell must not open it again
      }
      setBoot({ step: "ready", settings });
    },
    toast,
    confirmDelete,
    version,
    bump,
    openDrawing: path => void flushAll().then(() => setDrawing(path)),
  };
  live.current = { settings: boot.settings, update: ctx.updateSettings };

  return (
    <Ctx.Provider value={ctx}>
      {/* A new language draws every screen again (they read `t` while rendering). */}
      <Shell key={lang} startArea={startArea} openRequest={openRequest} />
      <SyncLock />
      {drawing && <DrawingEditor key={drawing} path={drawing} onClose={() => setDrawing(null)} />}
      {ask && <Confirm title={t.common.deleteTitle} text={ask.text} okLabel={t.common.delete} danger onOk={() => answer(true)} onClose={() => answer(false)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  setToasts(list => list.filter(x => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
