import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../src/i18n";
import { en } from "../src/i18n/en";
import { pt } from "../src/i18n/pt";

afterEach(() => setLang("en"));

describe("dictionaries", () => {
  // The compiler checks the keys; this catches empty texts and lists of the wrong length.
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === "string") {
      expect(typeof b, path).toBe("string");
      if (a) expect(b, path).not.toBe("");
    } else if (Array.isArray(a)) {
      expect((b as unknown[]).length, path).toBe(a.length);
    } else if (a && typeof a === "object") {
      for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      expect(Object.keys(b as object).sort(), path).toEqual(Object.keys(a).sort());
    }
  };
  it("pt has every word en has", () => walk(en, pt, "t"));
});

