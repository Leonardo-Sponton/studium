import { describe, expect, it } from "vitest";
import { History } from "../src/ui/history";
import { keyLabel, matches, shortcutOf } from "../src/ui/shortcuts";

const key = (k: string, o: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; code: string }> = {}) => ({
  key: k,
  code: o.code,
  ctrlKey: !!o.ctrl,
  metaKey: !!o.meta,
  altKey: !!o.alt,
  shiftKey: !!o.shift,
});

describe("shortcuts", () => {
  it("matches Ctrl on the PC and ⌘ on a Mac, with the exact modifiers", () => {
    expect(matches(key("p", { ctrl: true }), "Mod+P", false)).toBe(true);
    expect(matches(key("P", { ctrl: true, shift: true }), "Mod+P", false)).toBe(false);
    expect(matches(key("p", { meta: true }), "Mod+P", true)).toBe(true);
    expect(matches(key("p", { ctrl: true }), "Mod+P", true)).toBe(false);
    expect(matches(key("N", { ctrl: true, shift: true }), "Mod+Shift+N", false)).toBe(true);
  });
  it("finds the shortcut of a key, digits by their key code", () => {
    expect(shortcutOf(key("ArrowLeft", { ctrl: true, alt: true }), false)).toBe("back");
    expect(shortcutOf(key("BrowserForward"), false)).toBe("forward");
    expect(shortcutOf(key("F2"), false)).toBe("rename");
    expect(shortcutOf(key("!", { ctrl: true, shift: true, code: "Digit1" }), false)).toBe(null); // Shift not asked
    expect(shortcutOf(key("&", { ctrl: true, code: "Digit2" }), false)).toBe("goPersonal"); // AZERTY
    expect(shortcutOf(key("b", { ctrl: true }), false)).toBe(null); // the editor's bold
    expect(shortcutOf(key("k", { ctrl: true }), false)).toBe(null); // the editor's link
  });
  it("writes the keys for people", () => {
    expect(keyLabel("Mod+Shift+N", false)).toBe("Ctrl+Shift+N");
    expect(keyLabel("Mod+Alt+ArrowLeft", false)).toBe("Ctrl+Alt+←");
    expect(keyLabel("Mod+P", true)).toBe("⌘P");
  });
});

describe("history", () => {
  it("goes back and forward, and a new place drops the forward steps", () => {
    const h = new History();
    h.visit({ area: "personal", path: "" });
    h.visit({ area: "personal", path: "a" });
    h.visit({ area: "personal", path: "a" }); // the same place is one step
    h.visit({ area: "search", path: "" });
    expect(h.back()).toEqual({ area: "personal", path: "a" });
    expect(h.back()).toEqual({ area: "personal", path: "" });
    expect(h.back()).toBe(null);
    expect(h.forward()).toEqual({ area: "personal", path: "a" });
    h.visit({ area: "personal", path: "b" });
    expect(h.canForward).toBe(false);
    expect(h.back()).toEqual({ area: "personal", path: "a" });
  });
  it("forgets deleted places", () => {
    const h = new History();
    for (const p of ["x", "gone", "x", "y"]) h.visit({ area: "personal", path: p });
    h.forget(p => p.path === "gone");
    expect(h.back()).toEqual({ area: "personal", path: "x" });
    expect(h.back()).toBe(null);
  });
});
