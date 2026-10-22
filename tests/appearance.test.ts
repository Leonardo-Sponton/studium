import { describe, expect, it } from "vitest";
import { appearanceCss, colorsFor, contrast, migrateTheme, PALETTES, readableOn } from "../src/data/appearance";

const TEXT = ["text", "strong", "muted", "h1", "h2", "h3", "ok", "cyan", "err"] as const;

describe("appearance", () => {
  for (const p of PALETTES)
    for (const mode of ["dark", "light"] as const)
      it(`${p.id} ${mode}: text colors readable`, () => {
        const col = p[mode];
        const bad: string[] = [];
        for (const k of TEXT)
          for (const bg of ["bg", "surface"] as const) {
            const r = contrast(col[k], col[bg]);
            if (r < 4.5) bad.push(`${k} on ${bg}: ${r.toFixed(2)}`);
          }
        if (contrast(col["on-accent"], col.accent) < 4.5) bad.push(`on-accent: ${contrast(col["on-accent"], col.accent).toFixed(2)}`);
        expect(bad).toEqual([]);
      });

  it("accent picks a readable text color", () => {
    expect(readableOn("#ffff00")).toBe("#0b0b0c");
    expect(readableOn("#202060")).toBe("#ffffff");
    const col = colorsFor({ accent: "#ffff00", colors: { dark: { h1: "#123456", bg: "nope" } } }, "dark");
    expect(col.accent).toBe("#ffff00");
    expect(col["on-accent"]).toBe("#0b0b0c");
    expect(col.h1).toBe("#123456");
    expect(col.bg).toBe(PALETTES[0].dark.bg);
  });

  it("writes variables", () => {
    const css = appearanceCss({ textFont: "Liberation Serif", textSize: 99, lineWidth: 0, headingFont: "text" }, "light");
    expect(css).toContain(`--text-font: "Liberation Serif", "Inter Variable"`);
    expect(css).toContain("--text-size: 28px;");
    expect(css).toContain("--line-width: none;");
    expect(css).toContain("--heading-font: var(--text-font);");
    expect(css).toContain("color-scheme: light;");
    expect(appearanceCss({ uiFont: 'x"; } body { color: red' }, "dark")).not.toContain("} body");
  });

  it("old minimal theme becomes the Minimal palette", () => {
    expect(migrateTheme({ theme: "minimal" })).toEqual({ theme: "dark", appearance: { palette: "minimal" } });
    expect(migrateTheme({ theme: "light" })).toEqual({ theme: "light" });
  });
});
