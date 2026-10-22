import { en, type Messages } from "./en";
import { pt } from "./pt";

// The app's words in English and Brazilian Portuguese. `t` is the dictionary of the language in
// use; screens read it while rendering, and the app is drawn again when the language changes.
// The language is per device (settings.json): "system" follows the device's language.

export type Lang = "en" | "pt-BR";
export type LangSetting = "system" | Lang;

export const LANGS: { id: LangSetting; label: string }[] = [
  { id: "system", label: "" },
  { id: "en", label: "English" },
  { id: "pt-BR", label: "Português (Brasil)" },
];

/** The device's language: Portuguese (any country) → pt-BR, anything else → English. */
export function deviceLang(): Lang {
  const list = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  const first = list.find(Boolean) ?? "";
  return /^pt\b/i.test(first) ? "pt-BR" : "en";
}

export let lang: Lang = deviceLang();
export let t: Messages = lang === "pt-BR" ? pt : en;

export function setLang(s: LangSetting | undefined) {
  lang = s === "en" || s === "pt-BR" ? s : deviceLang();
  t = lang === "pt-BR" ? pt : en;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** Locale for dates and numbers. English uses day-month order, as the app did before. */
export const locale = () => (lang === "pt-BR" ? "pt-BR" : "en-GB");

/** A date formatter for the language in use (formatters are cached per language). */
const formats = new Map<string, Intl.DateTimeFormat>();
export function dateFmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale() + JSON.stringify(opts);
  let f = formats.get(key);
  if (!f) formats.set(key, (f = new Intl.DateTimeFormat(locale(), opts)));
  return f;
}

/** "outubro de 2026" → "Outubro de 2026" (Portuguese dates start in lowercase). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const num = (n: number, digits = 0) => n.toLocaleString(locale(), { maximumFractionDigits: digits });

/**
 * A name written inside the files (a section heading, a field): written in the language in use,
 * recognized in both, so files made on a device in the other language still work.
 */
export interface Words {
  en: string;
  pt: string;
}

/** The name in the language in use. */
export const word = (w: Words) => (lang === "pt-BR" ? w.pt : w.en);

/** Whether `text` is this name in either language (case and spaces ignored). */
export const isWord = (w: Words, text: string) => {
  const s = text.trim().toLowerCase();
  return s === w.en.toLowerCase() || s === w.pt.toLowerCase();
};

/** "1 file" / "2 files". */
export const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

export type { Messages };
