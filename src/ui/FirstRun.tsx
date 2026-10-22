import { useEffect, useState } from "react";
import { FolderOpen, ShieldCheck } from "lucide-react";
import type { Platform } from "../platform/types";
import { t } from "../i18n";

// First run: choose where the notes live (SPEC 2.3).
export function FirstRun({ platform, onDone }: { platform: Platform; onDone: () => void }) {
  const [dir, setDir] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    platform.defaultDataDir().then(setDir);
  }, [platform]);

  const pick = async () => {
    const d = await platform.pickFolder?.();
    if (d) setDir(d);
  };

  const confirm = async () => {
    try {
      await platform.setDataDir(dir.trim());
      onDone();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="center-screen">
      <div className="card stack">
        <h1>{t.boot.welcome}</h1>
        <p>{t.boot.intro}</p>
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted">{t.boot.dataFolder}</span>
          <input className="field mono" value={dir} onChange={e => setDir(e.target.value)} spellCheck={false} />
        </label>
        <div className="row">
          {platform.pickFolder && (
            <button className="btn" onClick={pick}>
              <FolderOpen size={18} /> {t.boot.choose}
            </button>
          )}
          <button className="btn primary" disabled={!dir.trim()} onClick={confirm}>
            {t.boot.useFolder}
          </button>
        </div>
        <p className="muted">{t.boot.existing}</p>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}

// Android: the app needs "All files access" to see files copied by the PC (SPEC 2.3).
export function FileAccess({ platform, onCheck }: { platform: Platform; onCheck: () => void }) {
  return (
    <div className="center-screen">
      <div className="card stack">
        <h1>{t.boot.accessTitle}</h1>
        <p>
          {t.boot.accessText1} <b>{t.boot.accessAll}</b>.
        </p>
        <p className="muted">{t.boot.offline}</p>
        <div className="row">
          <button className="btn primary" onClick={() => platform.openFileAccessSettings?.()}>
            <ShieldCheck size={18} /> {t.boot.openSettings}
          </button>
          <button className="btn" onClick={onCheck}>
            {t.boot.turnedOn}
          </button>
        </div>
      </div>
    </div>
  );
}
