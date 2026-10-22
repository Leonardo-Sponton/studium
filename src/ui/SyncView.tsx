import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { flushAll } from "../data/pending";
import { DEVICE_DIR, LOCK_PATH, LOCK_POLL_MS, loadDeviceLast, loadLast, syncDevice, type Choice, type LastSync, type Result, type Step } from "../data/sync";
import type { Storage } from "../storage/types";
import type { Device } from "../platform/types";
import { AskText } from "./Dialog";
import { SyncConflicts } from "./SyncConflicts";
import { useApp } from "./context";
import { useBack } from "./useBack";
import { t } from "../i18n";

// USB sync (SPEC 6). The PC runs it; Android only shows the last sync and, while a sync runs,
// the "Syncing from PC…" screen (SyncLock).

const when = (at: string) => at.replace("T", " ");

export function SyncView() {
  const { platform } = useApp();
  return platform.sync ? <PcSync /> : <DeviceSync />;
}

function PcSync() {
  const { platform, settings, updateSettings, bump, toast } = useApp();
  const sync = platform.sync!;
  const dir = settings.syncDeviceDir || DEVICE_DIR;
  const [devices, setDevices] = useState<{ adb: boolean; list: Device[] } | null>(null);
  const [lasts, setLasts] = useState<Record<string, LastSync | null>>({});
  const [progress, setProgress] = useState<{ text: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<(Result & { model: string }) | null>(null);
  const [editDir, setEditDir] = useState(false);
  const [ask, setAsk] = useState<{ conflicts: Step[]; device: Storage; model: string; done(c: Map<string, Choice>): void } | null>(null);

  const fail = useCallback((e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }), [toast]);

  const refresh = useCallback(async () => {
    try {
      const d = await sync.devices();
      setDevices(d);
      const out: Record<string, LastSync | null> = {};
      for (const dev of d.list) out[dev.serial] = await loadLast(platform.storage, dev.serial);
      setLasts(out);
    } catch (e) {
      fail(e);
    }
  }, [sync, platform, fail]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = async (d: Device) => {
    setResult(null);
    setProgress({ text: t.sync.starting, done: 0, total: 0 });
    try {
      await flushAll();
      const pc = { storage: platform.storage, hashes: () => sync.localHashes() };
      const device = { storage: sync.deviceStorage(d.serial, dir), hashes: () => sync.deviceHashes(d.serial, dir) };
      // Only a folder the app has set up: a wrong path must not receive a copy of everything.
      if (!(await device.storage.stat(".studium"))) {
        throw new Error(t.sync.noFolder(dir, d.model));
      }
      // Conflicts are decided while the device is still locked.
      const resolve = (conflicts: Step[]) =>
        new Promise<Map<string, Choice>>(done =>
          setAsk({ conflicts, device: device.storage, model: d.model, done: c => (setAsk(null), done(c)) }),
        );
      const r = await syncDevice(
        pc,
        device,
        { serial: d.serial, model: d.model, pcName: await sync.pcName() },
        (text, done, total) => setProgress({ text, done, total }),
        undefined,
        resolve,
      );
      setResult({ ...r, model: d.model });
    } catch (e) {
      fail(e);
    } finally {
      setProgress(null);
      bump();
      refresh();
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <h1>{t.sync.title}</h1>

        <section className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>{t.sync.devices}</h2>
            <button className="btn ghost" onClick={refresh} title={t.sync.lookAgain}>
              <RefreshCw size={18} /> {t.sync.refresh}
            </button>
          </div>
          {devices && !devices.adb && (
            <p className="err" style={{ margin: 0 }}>
              {t.sync.noAdb1} <span className="mono">sudo pacman -S android-tools</span>.
            </p>
          )}
          {devices?.adb && devices.list.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              {t.sync.noDevice}
            </p>
          )}
          {devices?.list.map(d => (
            <div key={d.serial} className="sync-device">
              <Smartphone size={22} />
              <span className="what">
                <b>{d.model}</b>
                <span className="muted small">
                  {d.state === "device"
                    ? lasts[d.serial]
                      ? t.sync.lastSync(when(lasts[d.serial]!.at))
                      : t.sync.notYet
                    : d.state === "unauthorized"
                      ? t.sync.unauthorized
                      : t.sync.notReady(d.state)}
                </span>
              </span>
              <button className="btn primary" disabled={d.state !== "device" || !!progress} onClick={() => start(d)}>
                {t.sync.syncNow}
              </button>
            </div>
          ))}
        </section>

        {result && <SyncResult r={result} />}

        <section className="card stack">
          <h2>{t.sync.deviceFolder}</h2>
          <p className="mono" style={{ wordBreak: "break-all", margin: 0 }}>
            {dir}
          </p>
          <div className="row">
            <button className="btn" onClick={() => setEditDir(true)}>
              {t.common.change}
            </button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {t.sync.howItWorks}
          </p>
        </section>
      </div>
      {progress && !ask && <SyncProgress {...progress} />}
      {ask && <SyncConflicts conflicts={ask.conflicts} pc={platform.storage} device={ask.device} model={ask.model} onDone={ask.done} />}
      {editDir && (
        <AskText
          title={t.sync.deviceFolderTitle}
          initial={dir}
          okLabel={t.common.save}
          onClose={() => setEditDir(false)}
          onOk={text => {
            setEditDir(false);
            if (!text.startsWith("/")) return toast({ text: t.sync.mustStartSlash, error: true });
            const d = text.replace(/\/+$/, "");
            updateSettings({ syncDeviceDir: d === DEVICE_DIR ? undefined : d }).catch(fail);
          }}
        />
      )}
    </div>
  );
}

function SyncResult({ r }: { r: Result & { model: string } }) {
  const c = r.counts;
  const lines = [
    c.toDevice && t.sync.sent(c.toDevice, r.model),
    c.toPC && t.sync.received(c.toPC, r.model),
    c.trashDevice && t.sync.trashedDevice(c.trashDevice, r.model),
    c.trashPC && t.sync.trashedPc(c.trashPC),
    r.settled && t.sync.settled(r.settled),
  ].filter(Boolean);
  return (
    <section className="card stack" aria-label={t.sync.result}>
      <h2>{t.sync.syncedWith(r.model)}</h2>
      <p style={{ margin: 0 }}>{lines.length ? lines.join(" · ") : t.sync.allSame}</p>
      {r.conflicts.length > 0 && (
        <>
          <p className="err" style={{ margin: 0 }}>
            {t.sync.leftUntouched(r.conflicts.length)}
          </p>
          <ul className="sync-conflicts mono small">
            {r.conflicts.map(s => (
              <li key={s.path}>
                {s.path}
                {!s.pc && t.sync.deletedPc}
                {!s.device && t.sync.deletedDevice}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SyncProgress(p: { text: string; done: number; total: number }) {
  useBack(true, () => {});
  return (
    <div className="dialog-backdrop">
      <div className="card stack dialog" role="dialog" aria-label={t.sync.syncing}>
        <h2>{t.sync.syncing}</h2>
        <p className="muted small one-line" style={{ margin: 0 }}>
          {p.text}
        </p>
        {p.total > 0 && <progress max={p.total} value={p.done} style={{ width: "100%" }} />}
        <p className="muted small" style={{ margin: 0 }}>
          {t.sync.keepCable}
        </p>
      </div>
    </div>
  );
}

function DeviceSync() {
  const { platform, version } = useApp();
  const [last, setLast] = useState<LastSync | null | undefined>();
  useEffect(() => {
    loadDeviceLast(platform.storage).then(setLast, () => setLast(null));
  }, [platform, version]);
  return (
    <div className="page">
      <div className="page-inner">
        <h1>{t.sync.title}</h1>
        <section className="card stack">
          <h2>{last ? t.sync.lastSync(when(last.at)) : last === null ? t.sync.notYet : "…"}</h2>
          {last && <p style={{ margin: 0 }}>{t.sync.withPc(last.with)}</p>}
          <p className="muted" style={{ margin: 0 }}>
            {platform.name === "android" ? t.sync.startedOnPc : t.sync.linuxAndroid}
          </p>
        </section>
      </div>
    </div>
  );
}

/** A lock older than this is from a sync that broke off (cable pulled, PC closed). */
const STALE_MS = 10 * 60_000;

/**
 * Android, while the PC syncs (SPEC 6.3): unsaved edits are written, then the app waits behind
 * this screen; when the lock goes away everything is reloaded.
 */
export function SyncLock() {
  const { platform, bump } = useApp();
  const [lock, setLock] = useState<{ pc: string; stale: boolean } | null>(null);

  useEffect(() => {
    if (platform.name !== "android") return;
    let locked = false;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const st = await platform.storage.stat(LOCK_PATH);
        if (st) {
          let pc = t.sync.thePc;
          try {
            pc = JSON.parse(await platform.storage.read(LOCK_PATH)).pc || pc;
          } catch {
            /* written half or by hand: the name is not needed */
          }
          setLock({ pc, stale: Date.now() - st.mtime > STALE_MS });
          if (!locked) {
            locked = true;
            await flushAll();
          }
        } else if (locked) {
          locked = false;
          setLock(null);
          bump();
        }
      } catch {
        /* checked again soon */
      } finally {
        busy = false;
      }
    };
    check();
    const timer = setInterval(check, LOCK_POLL_MS);
    const stop = platform.onResume?.(check);
    return () => {
      clearInterval(timer);
      stop?.();
    };
  }, [platform, bump]);

  if (!lock) return null;
  return <LockScreen pc={lock.pc} stale={lock.stale} onUnlock={() => platform.storage.remove(LOCK_PATH)} />;
}

function LockScreen(p: { pc: string; stale: boolean; onUnlock(): void }) {
  useBack(true, () => {});
  return (
    <div className="dialog-backdrop sync-lock">
      <div className="card stack dialog" role="dialog" aria-label={t.sync.syncingFromPc}>
        <h2>{t.sync.syncingFrom(p.pc)}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t.sync.editsSaved}
        </p>
        {p.stale && (
          <>
            <p className="err" style={{ margin: 0 }}>
              {t.sync.stale}
            </p>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={p.onUnlock}>
                {t.sync.stopWaiting}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
