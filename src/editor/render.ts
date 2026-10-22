import katex from "katex";
import "katex/dist/katex.min.css";

// Drawing math (KaTeX) and diagrams (Mermaid) for the live preview. Both run offline: KaTeX and
// its fonts are bundled, Mermaid is loaded the first time a diagram is shown (it is large).

/** KaTeX HTML for a formula; a formula with a mistake shows in red instead of failing. */
export function mathHTML(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: false });
  } catch (e) {
    return `<span class="cm-hm-err">${escapeHTML(e instanceof Error ? e.message : String(e))}</span>`;
  }
}

export function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Mermaid = typeof import("mermaid").default;
let mermaidLib: Promise<Mermaid> | null = null;
let mermaidTheme = "";
let counter = 0;
/** Drawn diagrams by theme + source, so redrawing the editor does not draw them again. */
const diagrams = new Map<string, { svg?: string; error?: string }>();

const darkTheme = () => document.documentElement.dataset.theme !== "light";

/** A diagram already drawn for this source, if any (to show it at once). */
export function cachedDiagram(source: string, dark = darkTheme()): { svg?: string; error?: string } | undefined {
  return diagrams.get(`${dark}\n${source}`);
}

/** Draws a Mermaid diagram as SVG text. Errors come back as `error` (shown under the code). */
export async function drawDiagram(source: string, dark = darkTheme()): Promise<{ svg?: string; error?: string }> {
  const key = `${dark}\n${source}`;
  const done = diagrams.get(key);
  if (done) return done;
  mermaidLib ??= import("mermaid").then(m => m.default);
  const mermaid = await mermaidLib;
  const theme = dark ? "dark" : "default";
  if (theme !== mermaidTheme) {
    // "strict": no scripts or clicks inside diagrams; text is cleaned before it is drawn.
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit" });
    mermaidTheme = theme;
  }
  let out: { svg?: string; error?: string };
  try {
    const { svg } = await mermaid.render(`studium-mermaid-${++counter}`, source);
    out = { svg };
  } catch (e) {
    out = { error: e instanceof Error ? e.message : String(e) };
    // Mermaid leaves its error drawing in the page.
    document.getElementById(`dstudium-mermaid-${counter}`)?.remove();
  }
  if (diagrams.size > 200) diagrams.clear();
  diagrams.set(key, out);
  return out;
}
