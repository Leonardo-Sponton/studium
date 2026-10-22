// Appearance (Obsidian's Appearance settings + what the Style Settings plugin adds, own code):
// light/dark mode, a color palette, accent color, fonts, text size, zoom, line width and the
// look of headings, plus colors the user picks one by one. Per device, in settings.json.
// `appearanceCss` turns it into CSS variables; ui/appearance.ts puts them on the page.

export const COLOR_TOKENS = [
  "bg",
  "surface",
  "header",
  "line",
  "hover",
  "select",
  "text",
  "strong",
  "muted",
  "accent",
  "on-accent",
  "h1",
  "h2",
  "h3",
  "ok",
  "cyan",
  "err",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Colors = Record<ColorToken, string>;
export type Mode = "dark" | "light";

export interface Palette {
  id: string;
  name: string;
  dark: Colors;
  light: Colors;
  /** Flat boxes and plain headings by default (Minimal). */
  flat?: boolean;
  plainHeadings?: boolean;
}

const c = (v: string[]): Colors => Object.fromEntries(COLOR_TOKENS.map((k, i) => [k, v[i]])) as Colors;

// Order: bg surface header line hover select text strong muted accent on-accent h1 h2 h3 ok cyan err.
// Text colors keep at least 4.5:1 on bg and surface (tests/appearance.test.ts checks it).
export const PALETTES: Palette[] = [
  {
    id: "studium",
    name: "Studium",
    dark: c(["#010a29", "#000623", "#050017", "#1b2350", "#0b1640", "#1a1650", "#afa7d4", "#d4ccf5", "#7d76a6", "#a67cff", "#0b0420", "#e6958c", "#daa069", "#e0c07a", "#8fd3a0", "#7fd1d8", "#f0857a"]),
    light: c(["#f6f4fb", "#ffffff", "#ece8f6", "#dcd6ee", "#ebe6f7", "#ddd3f7", "#3a3458", "#1c1733", "#625b80", "#6236c9", "#ffffff", "#a8402f", "#8f520c", "#755c0a", "#2c7444", "#17575e", "#b0352a"]),
  },
  {
    id: "minimal",
    name: "Minimal",
    flat: true,
    plainHeadings: true,
    dark: c(["#0b0b0c", "#111113", "#0b0b0c", "#1f1f22", "#17171a", "#1d1d21", "#b9b9be", "#ececee", "#85858c", "#e6e6e9", "#0b0b0c", "#cf9a92", "#c9a57a", "#c8b88a", "#96bfa0", "#98c0c4", "#d98b81"]),
    light: c(["#fafafa", "#ffffff", "#fafafa", "#e4e4e7", "#f0f0f2", "#e3e3e6", "#3d3d42", "#111113", "#66666d", "#18181b", "#ffffff", "#8f4a40", "#7c5a2c", "#6b5d2e", "#2f6b40", "#2a5e63", "#a8382c"]),
  },
  {
    // Catppuccin Macchiato / Latte (catppuccin.com, MIT).
    id: "catppuccin",
    name: "Catppuccin",
    dark: c(["#24273a", "#1e2030", "#181926", "#363a4f", "#2b2e44", "#494d64", "#b8c0e0", "#cad3f5", "#939ab7", "#c6a0f6", "#181926", "#ed8796", "#f5a97f", "#eed49f", "#a6da95", "#91d7e3", "#ed8796"]),
    light: c(["#eff1f5", "#e6e9ef", "#dce0e8", "#ccd0da", "#dfe3ea", "#ccd0da", "#4c4f69", "#2c2e40", "#5c5f77", "#8839ef", "#ffffff", "#c50e36", "#b04608", "#8a5a0f", "#2e7520", "#036a92", "#c50e36"]),
  },
  {
    // Nord (nordtheme.com, MIT).
    id: "nord",
    name: "Nord",
    dark: c(["#2e3440", "#3b4252", "#292e39", "#434c5e", "#3b4252", "#4c566a", "#d8dee9", "#eceff4", "#b0b7c4", "#88c0d0", "#2e3440", "#eaab90", "#ebcb8b", "#8fbcbb", "#a3be8c", "#88c0d0", "#eda0a7"]),
    light: c(["#eceff4", "#ffffff", "#e5e9f0", "#d8dee9", "#e5e9f0", "#d8dee9", "#3b4252", "#2e3440", "#4c566a", "#4a6d98", "#ffffff", "#a24d55", "#9a5536", "#6e5b1c", "#4c6a35", "#2f6680", "#a3404a"]),
  },
  {
    // Gruvbox (github.com/morhetz/gruvbox, MIT).
    id: "gruvbox",
    name: "Gruvbox",
    dark: c(["#282828", "#32302f", "#1d2021", "#3c3836", "#3c3836", "#504945", "#ebdbb2", "#fbf1c7", "#a89984", "#8ec07c", "#1d2021", "#fd7a68", "#fe8019", "#fabd2f", "#b8bb26", "#83a598", "#fd7a68"]),
    light: c(["#fbf1c7", "#f9f5d7", "#f2e5bc", "#d5c4a1", "#ebdbb2", "#d5c4a1", "#3c3836", "#282828", "#665c54", "#386a4b", "#fbf1c7", "#9d0006", "#a33503", "#7a5410", "#5f5c0b", "#076678", "#9d0006"]),
  },
  {
    // Atom One Dark / Light (github.com/atom/atom, MIT).
    id: "atom",
    name: "Atom One",
    dark: c(["#282c34", "#21252b", "#21252b", "#3a3f4b", "#2c313a", "#3e4451", "#abb2bf", "#d7dae0", "#969ca7", "#61afef", "#1b1d23", "#e57b84", "#d19a66", "#e5c07b", "#98c379", "#56b6c2", "#e57b84"]),
    light: c(["#fafafa", "#ffffff", "#eaeaeb", "#dbdbdc", "#f0f0f1", "#e5e5e6", "#383a42", "#1e1f24", "#5f626c", "#2f62d0", "#ffffff", "#c8103f", "#875c00", "#a626a4", "#3a7a39", "#016e99", "#c0362a"]),
  },
];

export const paletteOf = (id: string | undefined) => PALETTES.find(p => p.id === id) ?? PALETTES[0];

export type HeadingFont = "mono" | "text" | "ui";

export interface Appearance {
  /** Palette id (PALETTES). Default "studium". */
  palette?: string;
  /** Accent color for both modes; empty = the palette's. */
  accent?: string;
  /** Single colors changed by the user, per mode (as Style Settings keeps light and dark apart). */
  colors?: Partial<Record<Mode, Partial<Colors>>>;
  /** Font family names; empty = Studium default (Inter, JetBrains Mono). */
  uiFont?: string;
  textFont?: string;
  monoFont?: string;
  /** Text size of notes, in px. */
  textSize?: number;
  /** Size of the whole interface (1 = 100 %). */
  zoom?: number;
  /** Readable line length: width of note text in px; 0 = the whole width. */
  lineWidth?: number;
  lineHeight?: number;
  headingFont?: HeadingFont;
  headingScale?: number;
  /** Headings in their colors (h1/h2/h3); off = plain text color. Default: the palette's. */
  headingColors?: boolean;
  /** Boxes without outlines, buttons without background. Default: the palette's. */
  flat?: boolean;
  radius?: number;
  /** Justified text in notes (and PDF). */
  justify?: boolean;
  /** Pictures and drawings centered in notes. */
  centerImages?: boolean;
  /** Ctrl + mouse wheel in a note changes the text size (Obsidian "Quick font size adjustment"). */
  ctrlWheel?: boolean;
  /** CSS snippets turned on (file names in .studium/snippets). */
  snippets?: string[];
}

export const DEFAULTS = {
  textSize: 15,
  zoom: 1,
  lineWidth: 760,
  lineHeight: 1.6,
  headingFont: "mono" as HeadingFont,
  headingScale: 1,
  radius: 8,
};

export const LIMITS = {
  textSize: [11, 28],
  zoom: [0.7, 1.6],
  lineWidth: [480, 1600],
  lineHeight: [1.2, 2.2],
  headingScale: [0.8, 1.5],
  radius: [0, 18],
} as const;

export const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** The palette's colors for a mode with the user's accent and single colors on top. */
export function colorsFor(a: Appearance, mode: Mode): Colors {
  const out = { ...paletteOf(a.palette)[mode] };
  if (a.accent && isColor(a.accent)) {
    out.accent = a.accent;
    out["on-accent"] = readableOn(a.accent);
  }
  for (const [k, v] of Object.entries(a.colors?.[mode] ?? {})) if (v && isColor(v) && k in out) out[k as ColorToken] = v;
  return out;
}

export const isColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Relative luminance (WCAG). */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Black or white text, whichever reads better on `bg`. */
export const readableOn = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#0b0b0c") ? "#ffffff" : "#0b0b0c");

const fontName = (f: string) => (/^(serif|sans-serif|monospace|system-ui|cursive)$/.test(f) ? f : `"${f.replace(/["\\;{}<>]/g, "")}"`);

const DEFAULT_SANS = `"Inter Variable", system-ui, sans-serif`;
const DEFAULT_MONO = `"JetBrains Mono Variable", ui-monospace, monospace`;

/** The flags put on <html> (data-*) for rules that are not plain variables. */
export function flagsFor(a: Appearance) {
  const p = paletteOf(a.palette);
  return {
    flat: a.flat ?? !!p.flat,
    plainHeadings: !(a.headingColors ?? !p.plainHeadings),
    justify: !!a.justify,
    centerImages: !!a.centerImages,
  };
}

/** CSS for the page: colors of `mode`, fonts and sizes as variables on :root. */
export function appearanceCss(a: Appearance, mode: Mode): string {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(colorsFor(a, mode))) vars[`--${k}`] = v;
  const sans = a.uiFont ? `${fontName(a.uiFont)}, ${DEFAULT_SANS}` : DEFAULT_SANS;
  const mono = a.monoFont ? `${fontName(a.monoFont)}, ${DEFAULT_MONO}` : DEFAULT_MONO;
  const text = a.textFont ? `${fontName(a.textFont)}, ${sans}` : "var(--sans)";
  vars["--sans"] = sans;
  vars["--mono"] = mono;
  vars["--text-font"] = text;
  vars["--heading-font"] = { mono: "var(--mono)", text: "var(--text-font)", ui: "var(--sans)" }[a.headingFont ?? DEFAULTS.headingFont];
  vars["--text-size"] = `${clamp(a.textSize ?? DEFAULTS.textSize, LIMITS.textSize)}px`;
  vars["--line-height"] = String(clamp(a.lineHeight ?? DEFAULTS.lineHeight, LIMITS.lineHeight));
  vars["--heading-scale"] = String(clamp(a.headingScale ?? DEFAULTS.headingScale, LIMITS.headingScale));
  const width = a.lineWidth ?? DEFAULTS.lineWidth;
  vars["--line-width"] = width === 0 ? "none" : `${clamp(width, LIMITS.lineWidth)}px`;
  const p = paletteOf(a.palette);
  vars["--radius"] = `${clamp(a.radius ?? (p.flat ? 6 : DEFAULTS.radius), LIMITS.radius)}px`;
  vars["color-scheme"] = mode;
  // :root:root wins over theme.css whatever the order of the two in <head>.
  return `:root:root {\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")}\n}\n`;
}

/** Settings written before palettes existed: theme "minimal" = dark + the Minimal palette. */
export function migrateTheme<T extends { theme?: string; appearance?: Appearance }>(s: T): T {
  if (s.theme !== "minimal") return s;
  return { ...s, theme: "dark", appearance: { ...s.appearance, palette: s.appearance?.palette ?? "minimal" } };
}
