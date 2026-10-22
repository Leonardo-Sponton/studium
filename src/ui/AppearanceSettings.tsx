import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useApp } from "./context";
import type { Theme } from "../data/settings";
import {
  clamp,
  COLOR_TOKENS,
  colorsFor,
  DEFAULTS,
  flagsFor,
  LIMITS,
  PALETTES,
  paletteOf,
  type Appearance,
  type ColorToken,
  type HeadingFont,
} from "../data/appearance";
import { listSnippets, readSnippet, removeSnippet, safeSnippetName, saveSnippet, SNIPPET_EXAMPLE } from "../data/snippets";
import { applyAppearance, applySnippets, modeOf } from "./appearance";
import { AskText, Confirm, Dialog } from "./Dialog";
import { t } from "../i18n";

// Settings → Appearance: Obsidian's Appearance page (mode, accent, fonts, sizes, snippets) and,
// under "Customize", what the Style Settings plugin gave (single colors, headings, corners…).

const ACCENTS = ["#a67cff", "#f5bde6", "#ed8796", "#f5a97f", "#eed49f", "#a6da95", "#8bd5ca", "#7dc4e4", "#8aadf4"];
const GENERIC_FONTS = ["system-ui", "sans-serif", "serif", "monospace"];

export function AppearanceCard() {
  const { platform, settings, updateSettings } = useApp();
  const [a, setA] = useState<Appearance>(settings.appearance ?? {});
  const [open, setOpen] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [fonts, setFonts] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(a);
  const sent = useRef(new WeakSet<Appearance>());

  useEffect(() => {
    void platform.listFonts?.().then(setFonts, () => setFonts([]));
  }, [platform]);

  // Seen at once; written to settings.json a moment after the last change (sliders send many).
  const change = useCallback(
    (patch: Partial<Appearance>) => {
      const next = { ...latest.current, ...patch };
      for (const k of Object.keys(patch) as (keyof Appearance)[]) if (next[k] === undefined) delete next[k];
      latest.current = next;
      setA(next);
      applyAppearance(settings.theme, next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        sent.current.add(latest.current);
        void updateSettings({ appearance: latest.current });
      }, 350);
    },
    [settings.theme, updateSettings],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  // Ctrl+wheel / Ctrl+= elsewhere in the app changed it: follow.
  useEffect(() => {
    if (settings.appearance && sent.current.has(settings.appearance)) return;
    if (settings.appearance !== latest.current) {
      latest.current = settings.appearance ?? {};
      setA(latest.current);
    }
  }, [settings.appearance]);

  const mode = modeOf(settings.theme);
  const colors = colorsFor(a, mode);
  const palette = paletteOf(a.palette);
  const flags = flagsFor(a);
  const modes: Theme[] = ["dark", "light", "system"];

  const setColor = (k: ColorToken, v: string | undefined) => {
    const own = { ...a.colors?.[mode] };
    if (v) own[k] = v;
    else delete own[k];
    change({ colors: { ...a.colors, [mode]: own } });
  };

  const fontSelect = (key: "uiFont" | "textFont" | "monoFont", label: string) => (
    <div className="stack" style={{ gap: 4 }}>
      <ItemHead label={label} onReset={a[key] ? () => change({ [key]: undefined }) : undefined} />
      <select className="field" aria-label={label} value={a[key] ?? ""} onChange={e => change({ [key]: e.target.value || undefined })}>
        <option value="">{t.appearance.fontDefault}</option>
        {GENERIC_FONTS.map(f => (
          <option key={f} value={f}>
            {t.appearance.fontGeneric[f]}
          </option>
        ))}
        {a[key] && !GENERIC_FONTS.includes(a[key]!) && !fonts.includes(a[key]!) && <option value={a[key]}>{a[key]}</option>}
        {fonts.length > 0 && (
          <optgroup label={t.appearance.installed}>
            {fonts.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );

  return (
    <section className="card stack appearance">
      <h2>{t.appearance.title}</h2>

      <Field label={t.appearance.mode} onReset={settings.theme !== "dark" ? () => updateSettings({ theme: "dark" }) : undefined}>
        <div className="segmented" role="group" aria-label={t.appearance.mode}>
          {modes.map(m => (
            <button key={m} aria-pressed={settings.theme === m} onClick={() => updateSettings({ theme: m })}>
              {t.appearance.modes[m]}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t.appearance.palette} onReset={a.palette ? () => change({ palette: undefined }) : undefined}>
        <div className="palette-grid">
          {PALETTES.map(p => {
            const col = p[mode];
            return (
              <button
                key={p.id}
                className="palette-btn"
                aria-pressed={palette.id === p.id}
                onClick={() => change({ palette: p.id === "studium" ? undefined : p.id })}
                style={{ background: col.bg, color: col.text, borderColor: palette.id === p.id ? col.accent : col.line }}
              >
                <span className="palette-dots">
                  {(["accent", "h1", "h2", "h3", "ok", "cyan"] as const).map(k => (
                    <i key={k} style={{ background: col[k] }} />
                  ))}
                </span>
                <span style={{ color: col.strong }}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={t.appearance.accent} onReset={a.accent ? () => change({ accent: undefined }) : undefined}>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button className={`swatch-btn wide${a.accent ? "" : " on"}`} onClick={() => change({ accent: undefined })}>
            <i style={{ background: palette[mode].accent }} /> {t.appearance.accentDefault}
          </button>
          {ACCENTS.map(c => (
            <button key={c} className={`swatch-btn${a.accent === c ? " on" : ""}`} aria-label={c} onClick={() => change({ accent: c })}>
              <i style={{ background: c }} />
            </button>
          ))}
          <label className="swatch-btn" title={t.appearance.pickColor}>
            <input type="color" value={colors.accent} onChange={e => change({ accent: e.target.value })} aria-label={t.appearance.pickColor} />
          </label>
        </div>
      </Field>

      <div className="appearance-cols">
        {fontSelect("uiFont", t.appearance.uiFont)}
        {fontSelect("textFont", t.appearance.textFont)}
        {fontSelect("monoFont", t.appearance.monoFont)}
      </div>

      <Slider label={t.appearance.textSize} value={a.textSize ?? DEFAULTS.textSize} limits={LIMITS.textSize} step={1} show={v => `${v}px`} onChange={v => change({ textSize: v === DEFAULTS.textSize ? undefined : v })} onReset={a.textSize !== undefined ? () => change({ textSize: undefined }) : undefined} />
      <Slider
        label={t.appearance.zoom}
        hint={platform.name === "electron" ? t.appearance.zoomHint : undefined}
        value={a.zoom ?? DEFAULTS.zoom}
        limits={LIMITS.zoom}
        step={0.05}
        show={v => `${Math.round(v * 100)}%`}
        onChange={v => change({ zoom: Math.abs(v - 1) < 0.001 ? undefined : v })}
        onReset={a.zoom !== undefined ? () => change({ zoom: undefined }) : undefined}
      />
      <Toggle label={t.appearance.readable} hint={t.appearance.readableHint} on={(a.lineWidth ?? DEFAULTS.lineWidth) !== 0} set={on => change({ lineWidth: on ? undefined : 0 })} onReset={a.lineWidth === 0 ? () => change({ lineWidth: undefined }) : undefined} />
      {(a.lineWidth ?? DEFAULTS.lineWidth) !== 0 && (
        <Slider label={t.appearance.lineWidth} value={a.lineWidth ?? DEFAULTS.lineWidth} limits={LIMITS.lineWidth} step={20} show={v => `${v}px`} onChange={v => change({ lineWidth: v === DEFAULTS.lineWidth ? undefined : v })} onReset={a.lineWidth !== undefined ? () => change({ lineWidth: undefined }) : undefined} />
      )}
      <Slider label={t.appearance.lineHeight} value={a.lineHeight ?? DEFAULTS.lineHeight} limits={LIMITS.lineHeight} step={0.05} show={v => v.toFixed(2)} onChange={v => change({ lineHeight: Math.abs(v - DEFAULTS.lineHeight) < 0.001 ? undefined : v })} onReset={a.lineHeight !== undefined ? () => change({ lineHeight: undefined }) : undefined} />
      {platform.name === "electron" && <Toggle label={t.appearance.ctrlWheel} on={a.ctrlWheel !== false} set={on => change({ ctrlWheel: on ? undefined : false })} onReset={a.ctrlWheel === false ? () => change({ ctrlWheel: undefined }) : undefined} />}

      <button className="btn ghost fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />} {t.appearance.customize}
      </button>
      {open && (
        <div className="stack customize">
          <p className="muted small" style={{ margin: 0 }}>
            {t.appearance.customizeHint}
          </p>
          <h3>{t.appearance.headings}</h3>
          <Field label={t.appearance.headingFont} onReset={a.headingFont ? () => change({ headingFont: undefined }) : undefined}>
            <div className="segmented" role="group">
              {(["mono", "text", "ui"] as HeadingFont[]).map(f => (
                <button key={f} aria-pressed={(a.headingFont ?? DEFAULTS.headingFont) === f} onClick={() => change({ headingFont: f === DEFAULTS.headingFont ? undefined : f })}>
                  {t.appearance.headingFonts[f]}
                </button>
              ))}
            </div>
          </Field>
          <Slider label={t.appearance.headingScale} value={a.headingScale ?? DEFAULTS.headingScale} limits={LIMITS.headingScale} step={0.05} show={v => `${Math.round(v * 100)}%`} onChange={v => change({ headingScale: Math.abs(v - 1) < 0.001 ? undefined : v })} onReset={a.headingScale !== undefined ? () => change({ headingScale: undefined }) : undefined} />
          <Toggle label={t.appearance.headingColors} on={!flags.plainHeadings} set={on => change({ headingColors: on === !palette.plainHeadings ? undefined : on })} onReset={a.headingColors !== undefined ? () => change({ headingColors: undefined }) : undefined} />
          <Toggle label={t.appearance.flat} on={flags.flat} set={on => change({ flat: on === !!palette.flat ? undefined : on })} onReset={a.flat !== undefined ? () => change({ flat: undefined }) : undefined} />
          <Slider label={t.appearance.radius} value={a.radius ?? (palette.flat ? 6 : DEFAULTS.radius)} limits={LIMITS.radius} step={1} show={v => `${v}px`} onChange={v => change({ radius: v })} onReset={a.radius !== undefined ? () => change({ radius: undefined }) : undefined} />
          <Toggle label={t.appearance.justify} on={flags.justify} set={on => change({ justify: on || undefined })} onReset={a.justify ? () => change({ justify: undefined }) : undefined} />
          <Toggle label={t.appearance.centerImages} on={flags.centerImages} set={on => change({ centerImages: on || undefined })} onReset={a.centerImages ? () => change({ centerImages: undefined }) : undefined} />

          <h3>{t.appearance.colors(t.appearance.modes[mode].toLowerCase())}</h3>
          <div className="color-grid">
            {COLOR_TOKENS.map(k => {
              const own = a.colors?.[mode]?.[k];
              return (
                <div key={k} className="color-row">
                  <label className="swatch-btn">
                    <input type="color" value={colors[k]} onChange={e => setColor(k, e.target.value)} aria-label={t.appearance.colorNames[k]} />
                  </label>
                  <span className={own ? "" : "muted"}>{t.appearance.colorNames[k]}</span>
                  {own && (
                    <ResetButton onClick={() => setColor(k, undefined)} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="row">
            <button className="btn" onClick={() => setAskReset(true)}>
              <RotateCcw size={18} /> {t.appearance.resetAll}
            </button>
          </div>
        </div>
      )}

      <Snippets on={a.snippets ?? []} set={snippets => change({ snippets: snippets.length ? snippets : undefined })} />

      {askReset && (
        <Confirm
          title={t.appearance.resetAll}
          text={t.appearance.resetAllText}
          okLabel={t.appearance.reset}
          onClose={() => setAskReset(false)}
          onOk={() => {
            setAskReset(false);
            change(Object.fromEntries(Object.keys(latest.current).filter(k => k !== "snippets").map(k => [k, undefined])));
          }}
        />
      )}
    </section>
  );
}

/** Shown only when the item differs from the default: puts that one item back. */
function ResetButton({ onClick }: { onClick(): void }) {
  return (
    <button className="btn ghost icon reset-one" title={t.appearance.resetItem} aria-label={t.appearance.resetItem} onClick={onClick}>
      <RotateCcw size={15} />
    </button>
  );
}

function ItemHead({ label, htmlFor, value, onReset }: { label: string; htmlFor?: string; value?: string; onReset?: () => void }) {
  return (
    <span className="row item-head">
      {htmlFor ? (
        <label className="fl" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="fl">{label}</span>
      )}
      {onReset && <ResetButton onClick={onReset} />}
      {value !== undefined && <span className="mono small muted" style={{ marginLeft: "auto" }}>{value}</span>}
    </span>
  );
}

function Field({ label, onReset, children }: { label: string; onReset?: () => void; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <ItemHead label={label} onReset={onReset} />
      {children}
    </div>
  );
}

function Slider(p: { label: string; hint?: string; value: number; limits: readonly [number, number]; step: number; show(v: number): string; onChange(v: number): void; onReset?: () => void }) {
  const id = useId();
  return (
    <div className="stack slider" style={{ gap: 2 }}>
      <ItemHead label={p.label} htmlFor={id} value={p.show(p.value)} onReset={p.onReset} />
      <input id={id} type="range" min={p.limits[0]} max={p.limits[1]} step={p.step} value={clamp(p.value, p.limits)} onChange={e => p.onChange(Number(e.target.value))} />
      {p.hint && <span className="muted small">{p.hint}</span>}
    </div>
  );
}

function Toggle(p: { label: string; hint?: string; on: boolean; set(on: boolean): void; onReset?: () => void }) {
  return (
    <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 4 }}>
      <label className="row radio-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <input type="checkbox" checked={p.on} onChange={e => p.set(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          {p.label}
          {p.hint && <span className="muted small" style={{ display: "block" }}>{p.hint}</span>}
        </span>
      </label>
      {p.onReset && <ResetButton onClick={p.onReset} />}
    </div>
  );
}

/** CSS snippets: turn on/off, write in the app (handy on the phone), delete. */
function Snippets({ on, set }: { on: string[]; set(list: string[]): void }) {
  const { platform, toast, confirmDelete } = useApp();
  const [names, setNames] = useState<string[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState<{ name: string; css: string } | null>(null);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const reload = useCallback(() => listSnippets(platform.storage).then(setNames, fail), [platform]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = (name: string, yes: boolean) => set(yes ? [...on.filter(n => n !== name), name] : on.filter(n => n !== name));
  const edit = (name: string) => readSnippet(platform.storage, name).then(css => setEditing({ name, css }), fail);
  const save = async () => {
    if (!editing) return;
    try {
      await saveSnippet(platform.storage, editing.name, editing.css);
      setEditing(null);
      await reload();
      if (!on.includes(editing.name)) toggle(editing.name, true);
      else await applySnippets(platform, on);
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (name: string) => {
    if (!(await confirmDelete(`${name}.css`))) return;
    await removeSnippet(platform.storage, name).catch(fail);
    toggle(name, false);
    await reload();
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3>{t.appearance.snippets}</h3>
      <p className="muted small" style={{ margin: 0 }}>
        {t.appearance.snippetsHint}
      </p>
      {names?.length === 0 && <p className="muted small" style={{ margin: 0 }}>{t.appearance.noSnippets}</p>}
      {names?.map(name => (
        <div key={name} className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
          <label className="row radio-row" style={{ flex: 1, minWidth: 0 }}>
            <input type="checkbox" checked={on.includes(name)} onChange={e => toggle(name, e.target.checked)} />
            <span className="mono" style={{ overflowWrap: "anywhere" }}>{name}</span>
          </label>
          <button className="btn ghost icon" aria-label={t.common.edit} title={t.common.edit} onClick={() => edit(name)}>
            <Pencil size={16} />
          </button>
          <button className="btn ghost icon" aria-label={t.common.delete} title={t.common.delete} onClick={() => remove(name)}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setAsking(true)}>
          <Plus size={18} /> {t.appearance.newSnippet}
        </button>
        {platform.openSnippetsFolder && (
          <button className="btn" onClick={() => platform.openSnippetsFolder!().catch(fail)}>
            <FolderOpen size={18} /> {t.appearance.openSnippets}
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            void reload();
            void applySnippets(platform, on);
          }}
        >
          <RefreshCw size={18} /> {t.appearance.reload}
        </button>
      </div>
      {asking && (
        <AskText
          title={t.appearance.newSnippet}
          placeholder={t.appearance.snippetName}
          onClose={() => setAsking(false)}
          onOk={name => {
            setAsking(false);
            setEditing({ name: safeSnippetName(name), css: SNIPPET_EXAMPLE });
          }}
        />
      )}
      {editing && (
        <Dialog title={t.appearance.editSnippet(editing.name)} onClose={() => setEditing(null)}>
          <textarea className="field mono snippet-text" spellCheck={false} rows={14} value={editing.css} onChange={e => setEditing({ ...editing, css: e.target.value })} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </button>
            <button className="btn primary" onClick={save}>
              {t.appearance.save}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
