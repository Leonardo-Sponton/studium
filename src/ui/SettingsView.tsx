import { useEffect, useRef, useState } from "react";
import { Download, FileText, FolderOpen, Upload } from "lucide-react";
import { useApp } from "./context";
import { BEFORE_RESTORE, backupName, exportBackup, readBackup, restoreBackup, type Backup } from "../data/backup";
import { flushAll } from "../data/pending";
import { Confirm, Dialog } from "./Dialog";
import { deviceLang, LANGS, t } from "../i18n";
import { AppearanceCard } from "./AppearanceSettings";

export function SettingsView() {
  const { platform, settings, updateSettings, bump, toast } = useApp();
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const doExport = async () => {
    setBusy(true);
    try {
      await flushAll();
      const zip = await exportBackup(platform.storage);
      const where = await platform.saveBackup!(backupName(), zip);
      if (where) toast({ text: t.settings.backupSaved(where) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // The zip is checked before anything is asked or changed.
  const picked = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(readBackup(new Uint8Array(await f.arrayBuffer())));
    } catch (e) {
      fail(e);
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const doRestore = async (b: Backup) => {
    setPending(null);
    setBusy(true);
    try {
      await flushAll();
      await restoreBackup(platform.storage, b);
      bump();
      toast({ text: t.settings.backupRestored(b.files.size) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    platform.getDataDir().then(setDir);
  }, [platform]);

  return (
    <div className="page">
      <div className="page-inner">
        <h1>{t.settings.title}</h1>
        <AppearanceCard />

        <section className="card stack">
          <h2>{t.settings.language}</h2>
          <div className="stack" role="radiogroup" aria-label={t.settings.language} style={{ gap: 2 }}>
            {LANGS.map(l => (
              <label key={l.id} className="row radio-row">
                <input
                  type="radio"
                  name="language"
                  checked={(settings.language ?? "system") === l.id}
                  onChange={() => updateSettings({ language: l.id === "system" ? undefined : l.id })}
                />
                {l.id === "system" ? t.settings.systemLang(LANGS.find(x => x.id === deviceLang())!.label) : l.label}
              </label>
            ))}
          </div>
        </section>


        <section className="card stack">
          <h2>{t.settings.dataFolder}</h2>
          <p className="mono" style={{ wordBreak: "break-all", margin: 0 }}>
            {dir}
          </p>
          {platform.openDataFolder && (
            <div className="row">
              <button className="btn" onClick={() => platform.openDataFolder!()}>
                <FolderOpen size={18} /> {t.settings.openFolder}
              </button>
            </div>
          )}
        </section>

        <section className="card stack">
          <h2>{t.settings.backup}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.settings.backupText}
            {platform.name === "android" && t.settings.backupAndroid}
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {platform.saveBackup && (
              <button className="btn" disabled={busy} onClick={doExport}>
                <Download size={18} /> {t.settings.exportBackup}
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => file.current?.click()}>
              <Upload size={18} /> {t.settings.restoreBackup}
            </button>
            <input
              ref={file}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={e => picked(e.target.files?.[0])}
            />
          </div>
        </section>
        <Licenses />
      </div>
      {pending && (
        <Confirm
          title={t.settings.restoreTitle}
          text={t.settings.restoreText(pending.created.replace("T", " "), pending.files.size, BEFORE_RESTORE)}
          okLabel={t.common.restore}
          onClose={() => setPending(null)}
          onOk={() => doRestore(pending)}
        />
      )}
    </div>
  );
}

/** The open-source libraries inside the app and their licenses (public/licenses.txt, tools/licenses.mjs). */
function Licenses() {
  const [text, setText] = useState<string | null>(null);
  const open = () =>
    fetch("licenses.txt")
      .then(r => r.text())
      .then(setText, () => setText("—"));
  return (
    <section className="card stack">
      <h2>{t.settings.licenses}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t.settings.licensesHint}
      </p>
      <div className="row">
        <button className="btn" onClick={open}>
          <FileText size={18} /> {t.settings.showLicenses}
        </button>
      </div>
      {text !== null && (
        <Dialog title={t.settings.licenses} onClose={() => setText(null)}>
          <pre className="mono licenses-text">{text}</pre>
        </Dialog>
      )}
    </section>
  );
}
