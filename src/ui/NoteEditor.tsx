import { useRef, useState, type ReactNode } from "react";
import type { EditorView } from "@codemirror/view";
import { t } from "../i18n";
import { ArrowLeft, BookOpenText, CircleHelp, Ellipsis, Type } from "lucide-react";
import { Editor } from "../editor/Editor";
import type { WikiLinks } from "../editor/wikiLinks";
import { FormatBar } from "./FormatBar";
import { MarkdownGuide } from "./MarkdownGuide";
import { NoteMenu, TemplatePicker } from "./NoteTools";
import { previewOf } from "../data/frontmatter";
import { useBack } from "./useBack";
import { useNoteFile, type NoteFile } from "./useNoteFile";

// Opens one file in the editor and keeps it saved (see useNoteFile).
// Render it with key={path}: one instance per file.

interface Props {
  path: string;
  placeholder?: string;
  /** Shows a back arrow (phone layout). */
  onBack?(): void;
  /** Keeps the back arrow on the PC too, for notes nested below another page (Study). */
  backOnWide?: boolean;
  /** Deletes the file when it is left empty (new items the user did not write in). */
  removeIfEmpty?: boolean;
  autoFocus?: boolean;
  /** Buttons at the right of the top bar (a function gets the open file, to change its header). */
  actions?: ReactNode | ((f: NoteFile) => ReactNode);
  /** [[Links]] in the text (study notes). */
  links?: WikiLinks;
  /** Shown under the text (backlinks). */
  footer?: ReactNode;
  /** Where the note is (group › subject), at the left of the top bar. */
  crumbs?: ReactNode;
}

export function NoteEditor({ path, placeholder, onBack, backOnWide, removeIfEmpty, autoFocus, actions, links, footer, crumbs }: Props) {
  const f = useNoteFile(path, { removeIfEmpty: removeIfEmpty ? body => body.trim() === "" : undefined });
  useBack(!!onBack, () => onBack?.());
  const [guide, setGuide] = useState(false);
  const [bar, setBar] = useState(readBar);
  const view = useRef<EditorView | null>(null);
  const [menu, setMenu] = useState(false);
  const [reading, setReading] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [inTable, setInTable] = useState(false);
  const toggleBar = () => {
    setBar(!bar);
    writeBar(!bar);
  };

  return (
    <div className="note-editor">
      <div className="note-bar">
        {onBack && (
          <button className={`btn ghost icon back${backOnWide ? " keep" : ""}`} onClick={onBack} aria-label={t.common.back}>
            <ArrowLeft size={20} />
          </button>
        )}
        {crumbs}
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? t.note.status[f.status] : ""}
        </span>
        {reading && (
          <button className="btn ghost icon on" title={t.editor.editing} aria-label={t.editor.editing} onClick={() => setReading(false)}>
            <BookOpenText size={18} />
          </button>
        )}
        {f.note && !f.gone && !reading && (
          <button
            className={`btn ghost icon${bar ? " on" : ""}`}
            title={t.formatBar.show}
            aria-label={t.formatBar.show}
            aria-pressed={bar}
            onClick={toggleBar}
          >
            <Type size={18} />
          </button>
        )}
        {f.note && (
          <button className="btn ghost icon" title={t.mdGuide.open} aria-label={t.mdGuide.open} onClick={() => setGuide(true)}>
            <CircleHelp size={18} />
          </button>
        )}
        {f.note && !f.gone && (
          <button className="btn ghost icon" title={t.editor.more} aria-label={t.editor.more} onClick={() => setMenu(true)}>
            <Ellipsis size={18} />
          </button>
        )}
        {f.note && (typeof actions === "function" ? actions(f) : actions)}
      </div>
      {bar && f.note && !f.gone && !reading && <FormatBar view={view} inTable={inTable} />}
      {f.gone ? (
        <div className="page">
          <div className="page-inner">
            <p className="err">{f.gone}</p>
          </div>
        </div>
      ) : (
        f.note && (
          <Editor
            key={f.rev}
            text={f.note.body}
            onChange={f.setBody}
            onSaveNow={f.saveNow}
            placeholder={placeholder}
            autoFocus={autoFocus && f.rev === 1}
            viewRef={view}
            links={links}
            path={path}
            readOnly={reading}
            onTableChange={setInTable}
            onTemplate={() => setTemplates(true)}
          />
        )
      )}
      {footer}
      {f.dialog}
      {guide && <MarkdownGuide onClose={() => setGuide(false)} />}
      {menu && <NoteMenu
          view={view.current}
          reading={reading}
          setReading={setReading}
          onTemplate={() => setTemplates(true)}
          properties={f.note ? { data: f.data(), save: patch => f.setData(patch) } : undefined}
          pdf={{ title: previewOf(f.body()), path }}
          onClose={() => setMenu(false)}
        />}
      {templates && f.note && (
        <TemplatePicker
          view={view.current}
          title={previewOf(f.body())}
          header={f.data()}
          addProperties={d => f.setData(d)}
          onClose={() => setTemplates(false)}
        />
      )}
    </div>
  );
}

// The format bar is open unless the user closed it with the T button; remembered per device
// (a convenience, so storage may fail).
const BAR_KEY = "studium.formatBar";

function readBar(): boolean {
  try {
    return localStorage.getItem(BAR_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeBar(on: boolean) {
  try {
    localStorage.setItem(BAR_KEY, on ? "1" : "0");
  } catch {
    // Not remembered: the bar still works.
  }
}
