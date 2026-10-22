import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Monitor, Smartphone } from "lucide-react";
import { diffLines } from "../data/diff";
import { canKeepBoth, type Choice, type Step } from "../data/sync";
import type { Storage } from "../storage/types";
import { useBack } from "./useBack";
import { t } from "../i18n";

// The conflicts screen (SPEC 6.2): files changed on both sides since the last sync, shown side
// by side. The device stays locked while the user picks; nothing changes until Finish.

const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

type Version = { kind: "deleted" } | { kind: "text"; lines: string[] } | { kind: "image"; url: string };

async function load(s: Storage, path: string, exists: boolean): Promise<Version> {
  if (!exists) return { kind: "deleted" };
  const data = await s.readBinary(path);
  if (IMAGE.test(path)) {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return { kind: "image", url: URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: MIME[ext] })) };
  }
  return { kind: "text", lines: new TextDecoder().decode(data).replace(/\n$/, "").split("\n") };
}

export function SyncConflicts(p: {
  conflicts: Step[];
  pc: Storage;
  device: Storage;
  model: string;
  onDone(choices: Map<string, Choice>): void;
}) {
  useBack(true, () => {});
  const [i, setI] = useState(0);
  const [choices, setChoices] = useState(() => new Map<string, Choice>());
  const s = p.conflicts[i];

  const pick = (c: Choice) => {
    const next = new Map(choices).set(s.path, c);
    setChoices(next);
    // On to the next file still to decide, if any.
    const n = p.conflicts.length;
    for (let k = 1; k < n; k++) {
      const j = (i + k) % n;
      if (!next.has(p.conflicts[j].path)) return setI(j);
    }
  };

  const left = p.conflicts.length - choices.size;
  return (
    <div className="dialog-backdrop sync-lock">
      <div className="card stack dialog sync-conflict" role="dialog" aria-label={t.sync.bothSides}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{t.sync.bothSides}</h2>
          {p.conflicts.length > 1 && (
            <span className="row">
              <button className="btn ghost icon" title={t.common.previous} onClick={() => setI((i + p.conflicts.length - 1) % p.conflicts.length)}>
                <ChevronLeft size={18} />
              </button>
              <span className="small">
                {t.common.nOfM(i + 1, p.conflicts.length)}
              </span>
              <button className="btn ghost icon" title={t.common.next} onClick={() => setI((i + 1) % p.conflicts.length)}>
                <ChevronRight size={18} />
              </button>
            </span>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {t.sync.chooseText}
        </p>
        <Compare key={s.path} step={s} {...p} choice={choices.get(s.path)} onPick={pick} />
        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          {left > 0 && choices.size > 0 && (
            <span className="muted small">
              {t.sync.notDecided(left)}
            </span>
          )}
          <button className="btn primary" onClick={() => p.onDone(choices)}>
            {choices.size === 0 ? t.sync.decideLater : t.sync.finish}
          </button>
        </div>
      </div>
    </div>
  );
}

function Compare(p: { step: Step; pc: Storage; device: Storage; model: string; choice?: Choice; onPick(c: Choice): void }) {
  const { step: s } = p;
  const [pc, setPc] = useState<Version | null>(null);
  const [dev, setDev] = useState<Version | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let urls: string[] = [];
    Promise.all([load(p.pc, s.path, !!s.pc), load(p.device, s.path, !!s.device)]).then(
      ([a, b]) => {
        urls = [a, b].flatMap(v => (v.kind === "image" ? [v.url] : []));
        setPc(a);
        setDev(b);
      },
      e => setErr(e instanceof Error ? e.message : String(e)),
    );
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [p.pc, p.device, s]);

  const marks = useMemo(
    () => (pc?.kind === "text" && dev?.kind === "text" ? diffLines(pc.lines, dev.lines) : null),
    [pc, dev],
  );

  const both = !!s.pc && !!s.device && canKeepBoth(s.path);
  const opt = (c: Choice, label: string, title?: string) => (
    <button className={`btn${p.choice === c ? " primary" : ""}`} aria-pressed={p.choice === c} title={title} onClick={() => p.onPick(c)}>
      {label}
    </button>
  );

  return (
    <>
      <p className="mono small" style={{ margin: 0, overflowWrap: "anywhere" }}>
        {s.path}
      </p>
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      <div className="conflict-sides">
        <Side icon={<Monitor size={16} />} name={t.sync.thisPc} v={pc} marks={marks?.a} />
        <Side icon={<Smartphone size={16} />} name={t.sync.theDevice(p.model)} v={dev} marks={marks?.b} />
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {opt("pc", s.pc ? t.sync.keepPc : t.sync.deleteAsPc)}
        {opt("device", s.device ? t.sync.keepDevice(p.model) : t.sync.deleteAsDevice(p.model))}
        {both && (
          <button
            className={`btn${p.choice === "both" ? " primary" : ""}`}
            aria-pressed={p.choice === "both"}
            title={t.sync.keepBothHint}
            onClick={() => p.onPick("both")}
          >
            <Copy size={16} /> {t.sync.keepBoth}
          </button>
        )}
      </div>
    </>
  );
}

function Side(p: { icon: React.ReactNode; name: string; v: Version | null; marks?: boolean[] }) {
  return (
    <section className="conflict-side">
      <h3 className="row small">
        {p.icon} {p.name}
        {p.v?.kind === "deleted" && <span className="err">{t.sync.deleted}</span>}
      </h3>
      <div className="conflict-body">
        {!p.v ? (
          <p className="muted small">{t.common.loading}</p>
        ) : p.v.kind === "deleted" ? (
          <p className="muted small">{t.sync.deletedHere}</p>
        ) : p.v.kind === "image" ? (
          <img src={p.v.url} alt={p.name} />
        ) : (
          <pre className="mono small">
            {p.v.lines.map((l, k) => (
              <div key={k} className={p.marks?.[k] ? "changed" : undefined}>
                {l || " "}
              </div>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}
