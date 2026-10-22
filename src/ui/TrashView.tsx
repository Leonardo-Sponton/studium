import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { areaOf } from "../data/files";
import { parse, previewOf } from "../data/frontmatter";
import { ASSIGNMENT_FILE } from "../data/school";
import { PROJECT_FILE, SUBJECT_FILE } from "../data/study";
import { deleteForever, emptyTrash, listTrash, restore, type Trashed } from "../data/trash";
import { Confirm, Dialog } from "./Dialog";
import { useApp } from "./context";
import { areaLabel } from "./SearchView";
import { t } from "../i18n";

// Trash (SPEC 4.4): deleted files wait here until restored or deleted for good.

interface Row extends Trashed {
  title: string;
}

/** The main file of a trashed folder, which has its title. */
const FOLDER_FILES = [SUBJECT_FILE, ASSIGNMENT_FILE, PROJECT_FILE];

export function TrashView() {
  const { notes, version, bump, toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [menu, setMenu] = useState<Row | null>(null);
  const [ask, setAsk] = useState<{ title: string; text: string; ok: string; run(): Promise<void> } | null>(null);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Row[] = [];
      for (const x of await listTrash(notes.storage)) {
        let title = x.from.slice(x.from.lastIndexOf("/") + 1);
        try {
          if (x.path.endsWith(".md")) title = previewOf(parse(await notes.storage.read(x.path)).body) || t.common.empty;
          // A folder (subject, assignment, workbench project): its title is in the header of its main file.
          else if ((await notes.storage.stat(x.path))?.isDir) {
            for (const main of FOLDER_FILES) {
              if (!(await notes.storage.stat(`${x.path}/${main}`))) continue;
              title = String(parse(await notes.storage.read(`${x.path}/${main}`)).data.title ?? "") || title;
              break;
            }
          }
        } catch {
          /* keep the file name */
        }
        out.push({ ...x, title });
      }
      if (alive) setRows(out);
    })().catch(fail);
    return () => {
      alive = false;
    };
  }, [notes, version, fail]);

  const put = async (r: Row) => {
    try {
      const to = await restore(notes.storage, r);
      bump();
      toast({ text: to === r.from ? t.trash.restoredTo(areaLabel(areaOf(to))) : t.trash.restoredAs(to) });
    } catch (e) {
      fail(e);
    }
  };

  const confirmForever = (r: Row) =>
    setAsk({
      title: t.trash.foreverTitle,
      text: t.trash.foreverText(r.title),
      ok: t.trash.forever,
      run: () => deleteForever(notes.storage, r),
    });

  const confirmEmpty = () =>
    setAsk({
      title: t.trash.emptyTitle,
      text: t.trash.emptyText(rows!.length),
      ok: t.trash.emptyOk,
      run: () => emptyTrash(notes.storage),
    });

  const item = (label: string, icon: React.ReactNode, run: () => void, cls = "") => (
    <button
      className={`menu-item${cls}`}
      onClick={() => {
        setMenu(null);
        run();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="page">
      <div className="page-inner">
        <div className="list-head" style={{ padding: "0 0 12px" }}>
          <h1>{t.trash.title}</h1>
          {!!rows?.length && (
            <button className="btn" onClick={confirmEmpty}>
              <Trash2 size={18} /> {t.trash.empty}
            </button>
          )}
        </div>
        {rows && rows.length === 0 && <p className="muted">{t.trash.isEmpty}</p>}
        {!!rows?.length && (
          <ul className="list">
            {rows.map(r => (
              <li key={r.path} className="trash-li">
                <button className="list-item" onClick={() => setMenu(r)}>
                  <span className="list-title">{r.title}</span>
                  <span className="list-meta mono">
                    {areaLabel(areaOf(r.from))}
                    {r.at && t.trash.deletedAt(r.at.replace("T", " "))}
                  </span>
                </button>
                <button className="btn ghost icon" title={t.common.restore} aria-label={t.common.restore} onClick={() => put(r)}>
                  <RotateCcw size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {menu && (
        <Dialog title={menu.title} onClose={() => setMenu(null)}>
          <div className="stack" style={{ gap: 2 }}>
            {item(t.common.restore, <RotateCcw size={18} />, () => put(menu))}
            {item(t.trash.forever, <X size={18} />, () => confirmForever(menu), " danger")}
          </div>
        </Dialog>
      )}
      {ask && (
        <Confirm
          title={ask.title}
          text={ask.text}
          okLabel={ask.ok}
          onClose={() => setAsk(null)}
          onOk={() => {
            setAsk(null);
            ask.run().then(bump, fail);
          }}
        />
      )}
    </div>
  );
}
