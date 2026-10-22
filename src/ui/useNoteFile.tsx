import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n";
import type { Data } from "../data/frontmatter";
import { ConflictError, type Note } from "../data/notes";
import { onFlush } from "../data/pending";
import { useApp } from "./context";
import { useBack } from "./useBack";

// Keeps one open file saved (SPEC 2.4): body edits autosave 1 s after typing stops, header
// changes save at once, everything is written on leaving and when the app closes or goes to the
// background; every save is read back; outside changes are reloaded, or asked about when there
// are unsaved edits. Use one hook per file (render the owner with key={path}).

export type Status = "saved" | "unsaved" | "saving" | "error";


export interface NoteFile {
  /** The version shown; replaced when the file is reloaded from disk. */
  note: Note | null;
  /** Changes on every reload: remount text fields with it as key. */
  rev: number;
  status: Status;
  /** Error text when the file cannot be shown (deleted, unreadable). */
  gone: string | null;
  body(): string;
  data(): Data;
  setBody(text: string): void;
  /** Merges into the header (undefined removes a key) and saves now. */
  setData(patch: Data): void;
  /** Same, but saved a moment later like typed text (for header fields edited key by key). */
  editData(patch: Data): void;
  saveNow(): Promise<void>;
  /** The "changed outside the app" prompt, when open. */
  dialog: ReactNode;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useNoteFile(path: string, opts: { removeIfEmpty?(body: string, data: Data): boolean } = {}): NoteFile {
  const { notes, toast, version, bump } = useApp();
  const [note, setNote] = useState<Note | null>(null);
  const [rev, setRev] = useState(0);
  const [status, setStatus] = useState<Status>("saved");
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  // The conflict question has to be answered: back does nothing while it is open.
  useBack(!!conflict, () => {});
  const [gone, setGone] = useState<string | null>(null);

  const noteRef = useRef<Note | null>(null); // last version read or written by us
  const body = useRef(""); // text being edited now
  const data = useRef<Data>({}); // header being edited now
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve()); // disk work runs one step at a time
  const blocked = useRef(false); // a conflict is open: no autosave until the user picks
  const removeIfEmpty = useRef(opts.removeIfEmpty);
  removeIfEmpty.current = opts.removeIfEmpty;

  const show = useCallback((n: Note) => {
    noteRef.current = n;
    body.current = n.body;
    data.current = n.data;
    setNote(n);
    setRev(r => r + 1);
    setStatus("saved");
  }, []);

  const enqueue = (job: () => Promise<void>) => (queue.current = queue.current.then(job, job));
  const dirty = () =>
    !!noteRef.current && (noteRef.current.body !== body.current || !same(noteRef.current.data, data.current));

  const save = useCallback(
    (force = false) => {
      clearTimeout(timer.current);
      return enqueue(async () => {
        const n = noteRef.current;
        if (!n || (blocked.current && !force) || (!force && !dirty())) return;
        setStatus("saving");
        const b = body.current;
        const d = data.current;
        try {
          const saved = await notes.save(n, d, b, { force });
          noteRef.current = saved;
          // The saved header has a new `modified`: keep it unless the header changed meanwhile.
          if (data.current === d) data.current = saved.data;
          setStatus(dirty() ? "unsaved" : "saved");
          bump();
        } catch (e) {
          if (e instanceof ConflictError) {
            blocked.current = true;
            setConflict(e);
            setStatus("unsaved");
          } else {
            setStatus("error");
            toast({ text: e instanceof Error ? e.message : String(e), error: true });
          }
        }
      });
    },
    [notes, bump, toast],
  );

  // Load; on leaving, write what is pending and drop the file if it was left empty.
  useEffect(() => {
    let alive = true;
    notes.load(path).then(
      n => alive && show(n),
      e => alive && setGone(e instanceof Error ? e.message : String(e)),
    );
    const stop = onFlush(() => save());
    return () => {
      alive = false;
      stop();
      save().then(async () => {
        if (!blocked.current && noteRef.current && removeIfEmpty.current?.(body.current, data.current)) {
          await notes.storage.remove(path);
          bump();
        }
      });
    };
    // One instance per path; the callbacks are stable.
  }, []);

  // Something changed on disk: reload this file if it was changed outside and we have no edits.
  useEffect(() => {
    if (!noteRef.current) return;
    enqueue(async () => {
      const n = noteRef.current;
      if (!n || blocked.current) return;
      let disk: string | null = null;
      try {
        disk = await notes.storage.read(path);
      } catch {
        disk = null;
      }
      if (disk === n.text) return;
      if (dirty()) return; // unsaved edits: the next save raises the conflict
      if (disk === null) setGone(t.note.gone);
      else show(await notes.load(path));
    });
  }, [version]);

  const setBody = useCallback(
    (text: string) => {
      body.current = text;
      setStatus("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => save(), 1000);
    },
    [save],
  );

  const setData = useCallback(
    (patch: Data) => {
      data.current = { ...data.current, ...patch };
      save();
    },
    [save],
  );

  const editData = useCallback(
    (patch: Data) => {
      data.current = { ...data.current, ...patch };
      setStatus("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => save(), 1000);
    },
    [save],
  );

  const resolve = (choice: "mine" | "file" | "both") => {
    const c = conflict!;
    setConflict(null);
    blocked.current = false;
    if (choice === "mine") {
      // Compare against what is on disk now, so the forced save always writes.
      noteRef.current = { ...noteRef.current!, text: c.diskText ?? "" };
      save(true);
      return;
    }
    enqueue(async () => {
      try {
        if (choice === "both") {
          const copy = await notes.saveCopy(noteRef.current!, data.current, body.current);
          toast({ text: t.note.savedAs(copy.path.split("/").pop()!) });
        }
        if (c.diskText === null) {
          setGone(t.note.gone);
          return;
        }
        show(await notes.load(path));
        bump();
      } catch (e) {
        toast({ text: e instanceof Error ? e.message : String(e), error: true });
      }
    });
  };

  const dialog = conflict && (
    <div className="dialog-backdrop">
      <div className="card stack dialog" role="alertdialog" aria-labelledby="conflict-title">
        <h2 id="conflict-title">{t.note.changedTitle}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {conflict.diskText === null ? t.note.deletedWhile : t.note.changedWhile} {t.note.whichVersion}
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => resolve("mine")}>
            {t.note.keepMine}
          </button>
          <button className="btn" onClick={() => resolve("file")}>
            {conflict.diskText === null ? t.note.discardMine : t.note.keepFile}
          </button>
          {conflict.diskText !== null && (
            <button className="btn" onClick={() => resolve("both")}>
              {t.note.keepBoth}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return {
    note,
    rev,
    status,
    gone,
    body: () => body.current,
    data: () => data.current,
    setBody,
    setData,
    editData,
    saveNow: () => save(),
    dialog,
  };
}
