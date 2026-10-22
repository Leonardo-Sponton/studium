import type { Platform } from "../platform/types";
import type { Settings } from "../data/settings";
import { appearanceCss, clamp, DEFAULTS, flagsFor, LIMITS, type Appearance, type Mode } from "../data/appearance";
import { loadSnippets } from "../data/snippets";

// Puts the appearance settings on the page: mode + flags on <html>, variables in one <style>,
// the CSS snippets that are on in another, and the interface zoom.

const styleEl = (id: string) => {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.append(el);
  }
  return el;
};

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

export const modeOf = (theme: Settings["theme"]): Mode => (theme === "light" || (theme === "system" && !systemDark()) ? "light" : "dark");

let current: { theme: Settings["theme"]; a: Appearance; platform: Platform } | null = null;

export function applyAppearance(theme: Settings["theme"], a: Appearance = {}, platform?: Platform) {
  current = { theme, a, platform: platform ?? current!.platform };
  const mode = modeOf(theme);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.palette = a.palette ?? "studium";
  const flags = flagsFor(a);
  root.toggleAttribute("data-flat", flags.flat);
  root.toggleAttribute("data-plain-headings", flags.plainHeadings);
  root.toggleAttribute("data-justify", flags.justify);
  root.toggleAttribute("data-center-images", flags.centerImages);
  styleEl("studium-appearance").textContent = appearanceCss(a, mode);
  setZoom(clamp(a.zoom ?? DEFAULTS.zoom, LIMITS.zoom));
}

let zoomNow = 1;
function setZoom(z: number) {
  // Only on a change: the PC test helper (STUDIUM_SHOT_ZOOM) sets its own zoom.
  if (z === zoomNow) return;
  zoomNow = z;
  const p = current?.platform;
  if (p?.setZoom) void p.setZoom(z);
  else document.documentElement.style.setProperty("zoom", z === 1 ? "" : String(z));
}

/** Android draws the interface size with CSS zoom, which Excalidraw cannot measure: the
 *  drawing editor turns it off while open. Returns the function that puts it back. */
export function pauseCssZoom(): () => void {
  const el = document.documentElement;
  const z = el.style.getPropertyValue("zoom");
  if (!z) return () => {};
  el.style.removeProperty("zoom");
  return () => zoomNow !== 1 && !current?.platform.setZoom && el.style.setProperty("zoom", String(zoomNow));
}

/** The snippets that are on, read again (after a change in Settings or on disk). */
export async function applySnippets(platform: Platform, on: string[] | undefined) {
  const list = await loadSnippets(platform.storage, on).catch(() => []);
  // Last in <head>, so the user's rules win over the app's.
  const el = styleEl("studium-snippets");
  document.head.append(el);
  el.textContent = list.map(s => `/* ${s.name}.css */\n${s.css}`).join("\n\n");
}

// "System" follows the device when it switches between light and dark.
if (typeof matchMedia !== "undefined")
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => current?.theme === "system" && applyAppearance(current.theme, current.a));
