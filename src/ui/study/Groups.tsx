import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { flushAll } from "../../data/pending";
import { allGroups, deleteGroup, isSchool, loadGroups, renameGroup, saveGroups, type Subject } from "../../data/study";
import { Dialog } from "../Dialog";
import { useApp } from "../context";
import { t } from "../../i18n";

// Personal study groups (data/study study/_groups.md): made here even before any subject is in
// them, renamed (the subjects follow), put in order, or removed (their subjects stay, ungrouped).

/** The saved group order, reloaded whenever data on disk changes. */
export function useSavedGroups(): string[] {
  const { notes, version } = useApp();
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    loadGroups(notes).then(
      l => alive && setList(l),
      () => alive && setList([]),
    );
    return () => {
      alive = false;
    };
  }, [notes, version]);
  return list;
}

export function GroupsDialog(props: { subjects: Subject[]; saved: string[]; onClose(): void }) {
  const { notes, bump, toast, confirmDelete } = useApp();
  const personal = props.subjects.filter(s => !isSchool(s));
  const groups = allGroups(props.saved, personal);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const count = (g: string) => personal.filter(s => s.group === g).length;

  const run = async (f: () => Promise<void>) => {
    try {
      await flushAll();
      await f();
      bump();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };
  const add = () => {
    const g = name.trim();
    if (!g) return;
    setName("");
    if (!groups.includes(g)) void run(() => saveGroups(notes, [...groups, g]));
  };
  const move = (i: number, by: number) => {
    const next = [...groups];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void run(() => saveGroups(notes, next));
  };
  const rename = () => {
    const r = renaming!;
    setRenaming(null);
    void run(() => renameGroup(notes, personal, props.saved, r.from, r.to));
  };
  const remove = async (g: string) => {
    if (!(await confirmDelete(g, t.study.groupDeleteText(g, count(g))))) return;
    void run(() => deleteGroup(notes, personal, props.saved, g));
  };

  return (
    <Dialog title={t.study.groups} onClose={props.onClose}>
      {groups.length === 0 && <p className="muted small" style={{ margin: 0 }}>{t.study.noGroups}</p>}
      <ul className="list groups-list">
        {groups.map((g, i) => (
          <li key={g} className="row group-row">
            {renaming?.from === g ? (
              <>
                <input
                  className="field"
                  autoFocus
                  value={renaming.to}
                  aria-label={t.study.renameGroup}
                  onChange={e => setRenaming({ from: g, to: e.target.value })}
                  onKeyDown={e => (e.key === "Enter" ? rename() : e.key === "Escape" && (e.stopPropagation(), setRenaming(null)))}
                />
                <button className="btn ghost icon" aria-label={t.common.ok} disabled={!renaming.to.trim()} onClick={rename}>
                  <Check size={16} />
                </button>
                <button className="btn ghost icon" aria-label={t.common.cancel} onClick={() => setRenaming(null)}>
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="group-name">
                  {g} <span className="muted small">{t.study.subjectsIn(count(g))}</span>
                </span>
                <button className="btn ghost icon" title={t.study.moveUp} aria-label={t.study.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="btn ghost icon" title={t.study.moveDown} aria-label={t.study.moveDown} disabled={i === groups.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={16} />
                </button>
                <button className="btn ghost icon" title={t.study.renameGroup} aria-label={t.study.renameGroup} onClick={() => setRenaming({ from: g, to: g })}>
                  <Pencil size={16} />
                </button>
                <button className="btn ghost icon" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(g)}>
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="row" style={{ gap: 8 }}>
        <input className="field" value={name} placeholder={t.study.newGroupName} aria-label={t.study.newGroup} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn" disabled={!name.trim() || groups.includes(name.trim())} onClick={add}>
          <FolderPlus size={16} /> {t.study.newGroup}
        </button>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.close}
        </button>
      </div>
    </Dialog>
  );
}

/** Hold menu → "Move to group": the groups to pick from, plus "No group". */
export function MoveToGroup(props: { subject: Subject; groups: string[]; onPick(group: string): void; onClose(): void }) {
  return (
    <Dialog title={t.study.moveToGroupOf(props.subject.title)} onClose={props.onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {[...props.groups, ""].map(g => (
          <button key={g || "-"} className={`menu-item${props.subject.group === g ? " active" : ""}`} onClick={() => props.onPick(g)}>
            {props.subject.group === g ? <Check size={18} /> : <span style={{ width: 18 }} />}
            {g || t.study.noGroup}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
