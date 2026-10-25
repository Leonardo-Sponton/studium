import { useContext, useEffect, useRef } from "react";
import { autocompletion } from "@codemirror/autocomplete";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { codeFolding, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Facet, type Extension } from "@codemirror/state";
import { crosshairCursor, drawSelection, EditorView, keymap, placeholder as placeholderExt, rectangularSelection } from "@codemirror/view";
import { closedCallouts, livePreview } from "./livePreview";
import { obsidianMarkdown } from "./syntax";
import { Ctx } from "../ui/context";
import { LinksCtx } from "../ui/links";
import { wikiCompletion, wikiLinks, type WikiLinks } from "./wikiLinks";
import { DRAWING_NAME, FILE_EXT, embedRenderer, embedSource, type EmbedSource } from "./embeds";
import { createDrawing, drawingEmbed, findDrawing } from "../data/drawings";
import { drawingSvg, onDrawingSaved } from "../ui/drawing/excalidraw";
import { attachFiles, format, markdownKeys } from "./keys";
import { placeholderWithHint, slashCompletion, slashHint, type SlashItem } from "./slash";
import { advancedTables, caretInTable } from "./tables";
import { keepSpot, markOpened, recallSpot } from "./memory";
import { findAttachment, imageURL, saveAttachment } from "../data/attachments";
import { formatDate } from "../data/templates";
import { blockSpec, CARET, type Format } from "./format";
import { POINT_CALLOUTS, POINT_KINDS } from "../data/recall";
import { t } from "../i18n";

// The Markdown text area used everywhere (SPEC 4.3). It owns its text while mounted:
// the parent gets every change through onChange and remounts it (new `key`) to load other text.
// Obsidian-like: live preview (./livePreview), "/" menu, [[links]] and ![[embeds]], tables that
// line themselves up (./tables), find & replace (Ctrl+F), folding, pictures pasted or dropped.

interface Props {
  text: string;
  onChange(text: string): void;
  /** Ctrl+S. */
  onSaveNow?(): void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Slash commands: typing "/name" alone on a line removes it and runs commands[name]. */
  commands?: Record<string, () => void>;
  /** Gets the CodeMirror view while mounted (the format bar writes through it). */
  viewRef?: { current: EditorView | null };
  /** Only for reading: no caret, no keyboard (long study handouts, reading view). */
  readOnly?: boolean;
  /** [[Links]]: what they open and which titles "[[" offers. Default: the app's (LinksCtx). */
  links?: WikiLinks;
  /** The file shown: the caret and scroll are remembered for it, and pictures are found beside it. */
  path?: string;
  /** The caret entered or left a table (the format bar shows the table tools). */
  onTableChange?(inTable: boolean): void;
  /** "/template" in the "/" menu. */
  onTemplate?(): void;
}

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--text)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--text-font)", fontSize: "var(--text-size)", lineHeight: "var(--line-height)", overflow: "auto" },
  ".cm-content": { padding: "8px 0 40vh", caretColor: "var(--accent)", maxWidth: "var(--line-width, 760px)", margin: "0 auto" },
  ".cm-line": { padding: "0 4px" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-slash-hint": { color: "var(--muted)", opacity: "0.7", fontSize: "0.9em", pointerEvents: "none", userSelect: "none" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
});

/** The table text the table formats write (localized header). */
const emptyTable = () => {
  const c = t.formatBar.column;
  return `| ${CARET}${c} 1${CARET} | ${c} 2 |\n| --- | --- |\n|  |  |`;
};

/** Saves a pasted, dropped or picked file and gives what the note gets (set per editor). */
export const attachFacet = Facet.define<(file: File) => Promise<string | null>, ((file: File) => Promise<string | null>) | null>({ combine: v => v[0] ?? null });

/** Asks for a picture or file and puts it in the note at the caret. */
export function pickAttachment(view: EditorView, accept = "image/*") {
  const attach = view.state.facet(attachFacet);
  if (!attach) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = true;
  input.onchange = () => input.files?.length && void attachFiles(view, [...input.files], attach);
  input.click();
}

/** A note's Markdown drawn read-only inside a ![[embed]]. */
function renderInto(base: Extension) {
  return (parent: HTMLElement, text: string) => {
    const v = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: [base, EditorState.readOnly.of(true), EditorView.editable.of(false)] }) });
    return () => v.destroy();
  };
}

const slashIds: (Format | "image" | "drawing" | "date" | "time" | "template")[] = [
  "h1",
  "h2",
  "h3",
  "list",
  "numbered",
  "todo",
  "quote",
  "callout",
  "codeblock",
  "table",
  "line",
  "math",
  "mathblock",
  "mermaid",
  "footnote",
  "wiki",
  "embed",
  "image",
  "drawing",
  "highlight",
  "comment",
  "date",
  "time",
  "template",
];

export function Editor({ text, onChange, onSaveNow, placeholder, autoFocus, commands, viewRef, readOnly, links, path, onTableChange, onTemplate }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const app = useContext(Ctx);
  const appLinks = useContext(LinksCtx);
  const openLink = (url: string) => void app?.platform.openLink?.(url).catch(e => app.toast({ text: e instanceof Error ? e.message : String(e), error: true }));
  // Latest callbacks, so the editor is created once per mount.
  const cb = useRef({ onChange, onSaveNow, commands, onTableChange, onTemplate });
  cb.current = { onChange, onSaveNow, commands, onTableChange, onTemplate };
  const linksRef = useRef<WikiLinks | undefined>(links ?? appLinks);
  linksRef.current = links ?? appLinks;
  const ro = useRef(new Compartment());
  const viewOf = useRef<EditorView | null>(null);

  useEffect(() => {
    const storage = app?.platform.storage;
    const pc = app?.platform.name === "electron";
    const sources: EmbedSource = {
      image: async name => {
        if (!storage) return null;
        const p = await findAttachment(storage, name, path);
        return p ? imageURL(storage, p) : null;
      },
      note: async name => (await linksRef.current?.read?.(name)) ?? null,
      drawing: async name => {
        const p = storage && (await findDrawing(storage, name));
        return p ? drawingSvg(storage!, p) : null;
      },
      onDrawingSaved: onDrawingSaved,
      open: async name => {
        // A drawing opens in the drawing editor, a file (PDF, picture…) in the system's app,
        // a note in Studium.
        const drawing = storage && (DRAWING_NAME.test(name) || !FILE_EXT.test(name)) ? await findDrawing(storage, name) : null;
        if (drawing) return app?.openDrawing(drawing);
        if (FILE_EXT.test(name) && !/\.md$/i.test(name) && storage) {
          const p = await findAttachment(storage, name, path);
          if (p) return void app?.platform.openFile?.(p).catch(e => app.toast({ text: e instanceof Error ? e.message : String(e), error: true }));
        }
        linksRef.current?.open(name.replace(/\.md$/i, ""));
      },
    };
    const attach = async (file: File) => {
      if (!storage) return null;
      try {
        const name = await saveAttachment(storage, file.name, file.type, new Uint8Array(await file.arrayBuffer()));
        return `![[${name}]]`;
      } catch (e) {
        app?.toast({ text: `${t.editor.imageFailed}: ${e instanceof Error ? e.message : String(e)}`, error: true });
        return null;
      }
    };
    const md = markdown({ base: markdownLanguage, codeLanguages: languages, extensions: obsidianMarkdown });
    // What an embedded note is drawn with (no embeds inside embeds).
    const embedBase: Extension = [md, livePreview(openLink), theme, EditorView.lineWrapping, embedSource.of({ image: sources.image, open: sources.open, drawing: sources.drawing, onDrawingSaved })];

    // "/drawing": a new drawing, shown here (![[…]] on its own line), opened to draw.
    const newDrawingHere = async (v: EditorView) => {
      if (!storage || !app) return;
      try {
        const p = await createDrawing(storage);
        const line = v.state.doc.lineAt(v.state.selection.main.head);
        const embed = drawingEmbed(p);
        const text = line.text.trim() ? `\n${embed}\n` : `${embed}\n`;
        const at = line.text.trim() ? line.to : line.from;
        v.dispatch({ changes: { from: at, to: line.text.trim() ? at : line.to, insert: text }, selection: { anchor: at + text.length } });
        app.openDrawing(p);
      } catch (e) {
        app.toast({ text: e instanceof Error ? e.message : String(e), error: true });
      }
    };

    const slashItems = (): SlashItem[] => {
      const items: SlashItem[] = slashIds
        .filter(id => id !== "template" || cb.current.onTemplate)
        .map(id => {
          const [label, keywords] = t.editor.slash[id];
          return {
            id,
            label,
            keywords,
            run: (v: EditorView) => {
              if (id === "image") pickAttachment(v, "*/*");
              else if (id === "drawing") void newDrawingHere(v);
              else if (id === "template") cb.current.onTemplate?.();
              else if (id === "date" || id === "time") v.dispatch(v.state.replaceSelection(formatDate(new Date(), id === "date" ? "YYYY-MM-DD" : "HH:mm")));
              else format(v, id, emptyTable());
              v.focus();
            },
          };
        });
      // Review points (data/recall): "> [!warning] Atenção" and the caret on the line below.
      // Right after the callout, so "/ponto" or "/atenção" finds them.
      const points: SlashItem[] = POINT_KINDS.map(k => ({
        id: `point-${k}`,
        label: t.editor.point(t.recall.kinds[k]),
        keywords: `${t.editor.pointWords} ${t.recall.kinds[k]} ${POINT_CALLOUTS[k]}`,
        detail: `[!${POINT_CALLOUTS[k]}]`,
        run: (v: EditorView) => {
          v.dispatch({ ...blockSpec(v.state, `> [!${POINT_CALLOUTS[k]}] ${t.recall.kinds[k]}\n> ${CARET}\n`), scrollIntoView: true, userEvent: "format" });
          v.focus();
        },
      }));
      items.splice(items.findIndex(x => x.id === "callout") + 1, 0, ...points);
      // The screen's own commands ("/5w2h").
      for (const name of Object.keys(cb.current.commands ?? {})) items.unshift({ id: name, label: `/${name}`, run: () => cb.current.commands?.[name]?.() });
      return items;
    };

    const spot = path && !autoFocus ? recallSpot(path) : null;
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        selection: spot && spot.head <= text.length && spot.anchor <= text.length ? { anchor: spot.anchor, head: spot.head } : undefined,
        extensions: [
          history(),
          // Several carets (Ctrl+click, Alt+drag) on the PC; the phone keeps its own caret.
          pc ? [drawSelection(), EditorState.allowMultipleSelections.of(true), rectangularSelection(), crosshairCursor()] : [],
          advancedTables(),
          markdownKeys({ table: emptyTable, attach }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                cb.current.onSaveNow?.();
                return true;
              },
            },
            ...searchKeymap,
            ...foldKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // GFM base: task lists "- [ ]", ~~strike~~, tables, bare links; plus Obsidian's marks
          // (./syntax). Enter continues lists (markdownKeymap). Code blocks are colored by their
          // language (```java), whose parser loads the first time one is shown.
          md,
          indentUnit.of("\t"),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          // Keep the caret clear of the screen edges and the Android keyboard while typing.
          EditorView.scrollMargins.of(() => ({ top: 24, bottom: 48 })),
          EditorView.contentAttributes.of({ spellcheck: "true", autocapitalize: "sentences", autocorrect: "on", "aria-label": t.editor.textLabel }),
          EditorState.phrases.of(t.editor.phrases),
          placeholderExt(readOnly ? placeholder ?? "" : placeholderWithHint(placeholder ?? "", t.editor.slashHint)),
          slashHint(t.editor.slashHint),
          livePreview(openLink),
          codeFolding({ placeholderText: "…" }),
          foldGutter({ openText: "▾", closedText: "▸" }),
          search({ top: true }),
          autocompletion({
            override: [slashCompletion(slashItems), wikiCompletion(() => linksRef.current?.names() ?? [])],
            icons: false,
          }),
          wikiLinks(linksRef),
          embedSource.of(sources),
          embedRenderer.of(renderInto(embedBase)),
          attachFacet.of(attach),
          theme,
          ro.current.of(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
          EditorView.updateListener.of(u => {
            if (u.selectionSet || u.docChanged) {
              const inTable = caretInTable(u.state);
              if (inTable !== caretInTable(u.startState) || u.docChanged) cb.current.onTableChange?.(inTable);
              if (path) remember();
            }
            if (!u.docChanged) return;
            if (u.transactions.some(t => t.isUserEvent("input")) && runCommand(u.view, cb.current.commands)) return;
            cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewOf.current = view;
    if (viewRef) viewRef.current = view;
    const folds = closedCallouts(view.state);
    if (folds.length) view.dispatch({ effects: folds });

    // Remember the caret and scroll of this file (a moment after they stop changing).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (!path) return;
      const s = view.state.selection.main;
      keepSpot(path, { anchor: s.anchor, head: s.head, top: view.scrollDOM.scrollTop });
    };
    function remember() {
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    }
    if (path) {
      markOpened(path);
      view.scrollDOM.addEventListener("scroll", remember, { passive: true });
      if (spot) requestAnimationFrame(() => (view.scrollDOM.scrollTop = spot.top));
    }

    if (autoFocus) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    }
    return () => {
      clearTimeout(timer);
      if (path) save();
      if (viewRef?.current === view) viewRef.current = null;
      viewOf.current = null;
      view.destroy();
    };
    // Created once per mount on purpose (see the comment at the top).
  }, []);

  // Reading view on and off without a new editor.
  useEffect(() => {
    viewOf.current?.dispatch({ effects: ro.current.reconfigure(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []) });
  }, [readOnly]);

  return <div className="editor" ref={host} />;
}

/** Opens the find & replace bar of an editor. */
export const openFind = (view: EditorView) => openSearchPanel(view);

/** When the caret line is exactly "/name" for a known command: removes it and runs the command. */
function runCommand(view: EditorView, commands?: Record<string, () => void>): boolean {
  if (!commands) return false;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const m = /^\s*\/(\S+)\s*$/.exec(line.text);
  const run = m && sel.head === line.to && commands[m[1].toLowerCase()];
  if (!run) return false;
  // Dispatching inside an update listener is not allowed: do it right after.
  queueMicrotask(() => {
    view.dispatch({ changes: { from: line.from, to: line.to }, userEvent: "delete" });
    run();
  });
  return true;
}
