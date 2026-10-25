import { Dialog } from "./Dialog";
import { SHORTCUTS, keyLabel, type ShortcutId } from "./shortcuts";
import { t } from "../i18n";

// F1 (or "Keyboard shortcuts" in the palette): every shortcut, read from ui/shortcuts.ts, so the
// list cannot announce a key that does nothing.

const ORDER: ShortcutId[] = ["palette", "open", "search", "newNote", "newSubject", "rename", "back", "forward", "explorer", "goToday", "goPersonal", "goSchool", "help"];

function Table(props: { caption: string; rows: [string, string][] }) {
  return (
    <table className="md-table keys-table">
      <caption>{props.caption}</caption>
      <tbody>
        {props.rows.map(([keys, what]) => (
          <tr key={keys}>
            <td>
              <kbd>{keys}</kbd>
            </td>
            <td>{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ShortcutsHelp(props: { onClose(): void }) {
  const app = ORDER.map(id => [SHORTCUTS[id].filter(k => !k.startsWith("Browser")).map(k => keyLabel(k)).join(" · "), t.shortcuts.names[id]] as [string, string]);
  return (
    <Dialog title={t.shortcuts.title} onClose={props.onClose}>
      <div className="keys-help">
        <Table caption={t.shortcuts.app} rows={app} />
        <Table caption={t.shortcuts.treeKeys} rows={t.shortcuts.tree} />
        <Table caption={t.shortcuts.editorKeys} rows={t.shortcuts.editor} />
        <p className="muted small">{t.shortcuts.escape}</p>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.close}
        </button>
      </div>
    </Dialog>
  );
}
