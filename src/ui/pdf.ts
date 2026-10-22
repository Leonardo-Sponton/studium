import type { AppCtx } from "./context";
import type { WikiLinks } from "../editor/wikiLinks";
import { markdownToHtml } from "../editor/toHtml";
import { findAttachment, imageURL } from "../data/attachments";
import { findDrawing } from "../data/drawings";
import { colorsFor } from "../data/appearance";
import { drawingSvg } from "./drawing/excalidraw";
import { escapeHTML } from "../editor/render";

// PDF export (Obsidian's "Export to PDF", own code). The note is turned into HTML
// (editor/toHtml) inside #print-root; when printed, the page shows only that (theme.css
// "@media print"). The PC saves the PDF directly (Electron printToPDF); Android opens its print
// screen, where "Save as PDF" writes it (printPdf resolves when that screen closes). Paper is
// always light: the scheme's light colors.

export const PAGE_SIZES = ["A4", "A5", "A3", "Letter", "Legal", "Tabloid"] as const;
export const MARGINS = { none: "0", small: "8mm", normal: "15mm", large: "25mm" } as const;

export interface PdfOptions {
  pageSize: (typeof PAGE_SIZES)[number];
  landscape: boolean;
  margin: keyof typeof MARGINS;
  /** The note's title on top of the first page. */
  title: boolean;
  /** Size of everything, in percent. */
  scale: number;
  justify: boolean;
}

export const PDF_DEFAULTS: PdfOptions = { pageSize: "A4", landscape: false, margin: "normal", title: true, scale: 100, justify: false };

export interface PdfNote {
  title: string;
  /** Markdown without the YAML header. */
  body: string;
  /** The note's file (pictures beside it are found from there). */
  path?: string;
}

/** Builds the printable note, prints it and cleans up. PC: the saved file's path (null when canceled). */
export async function exportPdf(app: AppCtx, links: WikiLinks | undefined, note: PdfNote, o: PdfOptions): Promise<string | null> {
  const print = app.platform.printPdf;
  if (!print) throw new Error("PDF export is not available here");
  const s = app.platform.storage;
  const body = await markdownToHtml(note.body, {
    image: async name => {
      const p = await findAttachment(s, name, note.path);
      return p ? imageURL(s, p) : null;
    },
    drawing: async name => {
      const p = await findDrawing(s, name);
      return p ? drawingSvg(s, p, false) : null;
    },
    note: async name => (await links?.read?.(name)) ?? null,
  });

  cleanup();
  const root = document.createElement("div");
  root.id = "print-root";
  const a = app.settings.appearance ?? {};
  const colors = colorsFor(a, "light");
  root.setAttribute("style", Object.entries(colors).map(([k, v]) => `--${k}: ${v}`).join("; "));
  const doc = document.createElement("article");
  doc.className = `print-doc${o.justify ? " justify" : ""}${a.centerImages ? " center-images" : ""}`;
  doc.style.setProperty("zoom", String(Math.max(0.3, Math.min(2, o.scale / 100))));
  // A note that starts with its own "# Title" already has it on top.
  const hasTitle = /^\s*# /.test(note.body);
  doc.innerHTML = (o.title && note.title && !hasTitle ? `<h1 class="print-title">${escapeHTML(note.title)}</h1>` : "") + body;
  root.append(doc);
  const page = document.createElement("style");
  page.id = "print-page";
  page.textContent = `@page { size: ${o.pageSize} ${o.landscape ? "landscape" : "portrait"}; margin: ${MARGINS[o.margin]}; }`;
  document.head.append(page);
  document.body.append(root);
  document.documentElement.classList.add("printing");

  // Pictures and fonts must be ready before the page is printed.
  await Promise.all([...root.querySelectorAll("img")].map(img => img.decode().catch(() => undefined)));
  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(() => r(null)));

  try {
    return await print({ name: note.title || "Studium", pageSize: o.pageSize, landscape: o.landscape });
  } finally {
    cleanup();
  }
}

function cleanup() {
  document.getElementById("print-root")?.remove();
  document.getElementById("print-page")?.remove();
  document.documentElement.classList.remove("printing");
}
