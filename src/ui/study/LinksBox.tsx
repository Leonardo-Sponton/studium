import { useState } from "react";
import { ExternalLink, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { webLink } from "../../data/weblink";
import { flushAll } from "../../data/pending";
import { guessLinkKind, LINK_KIND_COLORS, LINK_KINDS, saveLinks, type LinkKind, type StudyLink } from "../../data/study";
import { Dialog } from "../Dialog";
import { useApp } from "../context";
import { t } from "../../i18n";

// The links of a subject or a workbench project (data/study links.md in `dir`): videos, docs,
// articles to come back to. Each link says what it leads to (a video, a blog post…) with a colored
// tag. A tap opens the link in the browser; each one can be edited or removed.

/** The colored tag of a link kind. */
export function LinkKindTag(props: { kind: LinkKind }) {
  return (
    <span className="note-tag link-kind" style={{ "--tag": LINK_KIND_COLORS[props.kind] } as React.CSSProperties}>
      {t.study.linkKinds[props.kind]}
    </span>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function LinksBox(props: { dir: string; links: StudyLink[]; heading?: boolean | string | React.ReactNode; empty?: string }) {
  const { notes, platform, bump, toast, confirmDelete } = useApp();
  const s = props;
  const [edit, setEdit] = useState<{ i: number | null } | null>(null);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const write = async (list: StudyLink[]) => {
    try {
      await flushAll();
      await saveLinks(notes, s.dir, list);
      bump();
    } catch (e) {
      fail(e);
    }
  };
  const save = (l: StudyLink) => {
    const i = edit?.i ?? null;
    setEdit(null);
    void write(i === null ? [...s.links, l] : s.links.map((x, j) => (j === i ? l : x)));
  };
  const remove = async (i: number) => {
    const l = s.links[i];
    if (!(await confirmDelete(l.title || hostOf(l.url), t.study.linkDeleteText(l.title || hostOf(l.url))))) return;
    const before = s.links;
    await write(before.filter((_, j) => j !== i));
    toast({ text: t.study.linkDeleted, action: { label: t.common.undo, run: () => void write(before) } });
  };

  return (
    <>
      <div className={typeof props.heading === "object" ? "subj-sub-head" : "task-notes-head row"} style={{ justifyContent: "space-between" }}>
        {props.heading === false ? <span /> : typeof props.heading === "string" ? <h3>{props.heading}</h3> : props.heading === undefined || props.heading === true ? <h2>{t.study.links}</h2> : props.heading}
        <button className="btn ghost" onClick={() => setEdit({ i: null })}>
          <Plus size={16} /> {t.study.addLink}
        </button>
      </div>
      {s.links.length === 0 ? (
        <p className="muted small">{props.empty ?? t.study.noLinks}</p>
      ) : (
        <ul className="list">
          {s.links.map((l, i) => (
            <li key={`${i}:${l.url}`} className="link-row">
              <button className="list-item" onClick={() => platform.openLink?.(l.url).catch(fail)} title={l.url}>
                <span className="list-title">
                  {l.kind ? <LinkKindTag kind={l.kind} /> : <Link2 size={14} className="muted" />} {l.title || hostOf(l.url)}
                </span>
                {l.note && <span className="note-preview">{l.note}</span>}
                <span className="list-meta mono">
                  {hostOf(l.url)} <ExternalLink size={12} />
                </span>
              </button>
              <button className="btn ghost icon" title={t.common.edit} aria-label={t.common.edit} onClick={() => setEdit({ i })}>
                <Pencil size={16} />
              </button>
              <button className="btn ghost icon" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(i)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && <LinkDialog link={edit.i === null ? undefined : s.links[edit.i]} onOk={save} onClose={() => setEdit(null)} />}
    </>
  );
}

function LinkDialog(props: { link?: StudyLink; onOk(l: StudyLink): void; onClose(): void }) {
  const [url, setUrl] = useState(props.link?.url ?? "");
  const [title, setTitle] = useState(props.link?.title ?? "");
  const [note, setNote] = useState(props.link?.note ?? "");
  // Until a kind is picked, it follows the address (youtube → video…).
  const [kind, setKind] = useState<LinkKind | "" | null>(props.link ? props.link.kind : null);
  const href = webLink(url);
  const shown = kind ?? (href ? guessLinkKind(href) : "");
  const ok = () => href && props.onOk({ url: href, title: title.trim(), note: note.trim(), kind: shown });
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && ok();
  return (
    <Dialog title={props.link ? t.study.editLink : t.study.addLink} onClose={props.onClose}>
      <input className="field" autoFocus inputMode="url" value={url} placeholder="https://…" aria-label={t.study.linkUrl} onChange={e => setUrl(e.target.value)} onKeyDown={enter} />
      {url.trim() && !href && <span className="err small">{t.study.linkBad}</span>}
      <input className="field" value={title} placeholder={t.study.linkTitle} aria-label={t.study.linkTitle} onChange={e => setTitle(e.target.value)} onKeyDown={enter} />
      <span className="fl">{t.study.linkKind}</span>
      <div className="chips link-kinds" role="radiogroup" aria-label={t.study.linkKind}>
        {LINK_KINDS.map(k => (
          <button
            key={k}
            role="radio"
            aria-checked={shown === k}
            className={`chip link-kind-chip${shown === k ? " active" : ""}`}
            style={{ "--tag": LINK_KIND_COLORS[k] } as React.CSSProperties}
            onClick={() => setKind(shown === k ? "" : k)}
          >
            {t.study.linkKinds[k]}
          </button>
        ))}
      </div>
      <input className="field" value={note} placeholder={t.study.linkNote} aria-label={t.study.linkNote} onChange={e => setNote(e.target.value)} onKeyDown={enter} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={!href} onClick={ok}>
          {t.common.save}
        </button>
      </div>
    </Dialog>
  );
}
