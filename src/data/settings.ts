import type { Storage } from "../storage/types";
import type { LangSetting } from "../i18n";
import { migrateTheme, type Appearance } from "./appearance";

// Per-device settings in .studium/settings.json (not synced, SPEC 6.2).

/** Light or dark mode ("minimal" was a theme before palettes; loadSettings turns it into one). */
export type Theme = "dark" | "light" | "system";

export interface Settings {
  theme: Theme;
  /** "system" (or missing) follows the device's language. */
  language?: LangSetting;
  /** PC: the data folder on the Android devices it syncs with (SPEC 6.1). */
  syncDeviceDir?: string;
  /** Palette, fonts, sizes… (data/appearance). */
  appearance?: Appearance;
  /** The PDF export options used last (ui/pdf). */
  pdf?: Partial<import("../ui/pdf").PdfOptions>;
}

export const SETTINGS_PATH = ".studium/settings.json";

const defaults: Settings = { theme: "dark" };

export async function loadSettings(s: Storage): Promise<Settings> {
  if (!(await s.stat(SETTINGS_PATH))) return { ...defaults };
  try {
    return migrateTheme({ ...defaults, ...JSON.parse(await s.read(SETTINGS_PATH)) });
  } catch {
    return { ...defaults };
  }
}

export async function saveSettings(s: Storage, settings: Settings) {
  // Keep keys written by newer versions of the app.
  let old: Record<string, unknown> = {};
  try {
    if (await s.stat(SETTINGS_PATH)) old = JSON.parse(await s.read(SETTINGS_PATH));
  } catch {
    /* unreadable: replaced below */
  }
  await s.write(SETTINGS_PATH, JSON.stringify({ ...old, ...settings }, null, 2) + "\n");
}

/** Creates the standard folders of a new data folder. Existing content is left alone. */
export async function initDataFolder(s: Storage) {
  const stat = await s.stat(SETTINGS_PATH);
  if (!stat) await saveSettings(s, defaults);
}
