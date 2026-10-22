import { useContext, useState } from "react";
import { FileDown } from "lucide-react";
import { useApp } from "./context";
import { LinksCtx } from "./links";
import { Dialog } from "./Dialog";
import { exportPdf, MARGINS, PAGE_SIZES, PDF_DEFAULTS, type PdfNote, type PdfOptions } from "./pdf";
import { t } from "../i18n";

/** The PDF options (remembered per device, as Obsidian does), then the export. */
export function PdfExport({ note, onClose }: { note: PdfNote; onClose(): void }) {
  const app = useApp();
  const links = useContext(LinksCtx);
  const [o, setO] = useState<PdfOptions>({ ...PDF_DEFAULTS, justify: !!app.settings.appearance?.justify, ...app.settings.pdf });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PdfOptions>) => setO({ ...o, ...patch });

  const run = async () => {
    setBusy(true);
    try {
      void app.updateSettings({ pdf: o });
      const where = await exportPdf(app, links, note, o);
      onClose();
      if (where)
        app.toast({
          text: t.pdf.saved(where),
          action: app.platform.openLastPdf ? { label: t.pdf.open, run: () => void app.platform.openLastPdf!() } : undefined,
        });
    } catch (e) {
      setBusy(false);
      app.toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <Dialog title={t.pdf.title} onClose={onClose}>
      <label className="row radio-row">
        <input type="checkbox" checked={o.title} onChange={e => set({ title: e.target.checked })} />
        {t.pdf.includeTitle}
      </label>
      <div className="appearance-cols">
        <label className="stack" style={{ gap: 4 }}>
          <span className="fl">{t.pdf.pageSize}</span>
          <select className="field" value={o.pageSize} onChange={e => set({ pageSize: e.target.value as PdfOptions["pageSize"] })}>
            {PAGE_SIZES.map(p => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="fl">{t.pdf.margins}</span>
          <select className="field" value={o.margin} onChange={e => set({ margin: e.target.value as PdfOptions["margin"] })}>
            {Object.keys(MARGINS).map(m => (
              <option key={m} value={m}>
                {t.pdf.marginNames[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <span className="fl">{t.pdf.orientation}</span>
        <div className="segmented" role="group" aria-label={t.pdf.orientation}>
          <button aria-pressed={!o.landscape} onClick={() => set({ landscape: false })}>
            {t.pdf.portrait}
          </button>
          <button aria-pressed={o.landscape} onClick={() => set({ landscape: true })}>
            {t.pdf.landscape}
          </button>
        </div>
      </div>
      <label className="stack slider" style={{ gap: 2 }}>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span className="fl">{t.pdf.scale}</span>
          <span className="mono small muted">{o.scale}%</span>
        </span>
        <input type="range" min={50} max={150} step={5} value={o.scale} onChange={e => set({ scale: Number(e.target.value) })} />
      </label>
      <label className="row radio-row">
        <input type="checkbox" checked={o.justify} onChange={e => set({ justify: e.target.checked })} />
        {t.pdf.justify}
      </label>
      {app.platform.name === "android" && <p className="muted small" style={{ margin: 0 }}>{t.pdf.androidHint}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={busy} onClick={() => void run()}>
          <FileDown size={18} /> {busy ? t.pdf.exporting : t.pdf.export}
        </button>
      </div>
    </Dialog>
  );
}
