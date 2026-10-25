import { useEffect, useState } from "react";
import { ArrowLeft, Brain, Eye, EyeOff, Lightbulb, Pencil } from "lucide-react";
import { markdownToHtml } from "../../editor/toHtml";
import type { WikiLinks } from "../../editor/wikiLinks";
import { findAttachment, imageURL } from "../../data/attachments";
import { findDrawing } from "../../data/drawings";
import { isoDate } from "../../data/dates";
import { setNoteReview } from "../../data/notebook";
import { NOTE_GRADES, readReview, scheduleNote, sectionsOf, sortPoints, type NoteGrade, type PointKind, type ReviewPoint, type Section } from "../../data/recall";
import { titleOf } from "../../data/frontmatter";
import { notebookOf } from "../../data/notebook";
import type { Subject } from "../../data/study";
import { drawingSvg } from "../drawing/excalidraw";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { t } from "../../i18n";

// Studying from what is already written (data/recall):
//   RecallView  "Try to recall": a note with only its headings showing (where they come from and
//               "Edit the note" said on top). Each part opens after
//               trying to explain it (in the head or in the box, which is not saved); at the end,
//               "how did it go?" sets when the whole note comes back. Nothing is graded per part.
//   PointsView  a subject's review points (the "Atenção", "Conceito", "Dificuldade"… callouts its
//               notes already have), each hidden behind its label until shown.

/** Markdown drawn as the PDF export draws it (pictures, drawings and code included). */
function Rendered(props: { text: string; from: string; links?: WikiLinks }) {
  const { notes } = useApp();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const s = notes.storage;
    void markdownToHtml(props.text, {
      image: async name => {
        const p = await findAttachment(s, name, props.from);
        return p ? imageURL(s, p) : null;
      },
      drawing: async name => {
        const p = await findDrawing(s, name);
        return p ? drawingSvg(s, p) : null;
      },
      dark: document.documentElement.dataset.theme !== "light",
      note: async name => (await props.links?.read?.(name)) ?? null,
    }).then(h => live && setHtml(h));
    return () => {
      live = false;
    };
  }, [props.text]);
  if (html === null) return <div className="muted small">…</div>;
  return <div className="print-doc recall-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

const POINT_ICONS: Record<PointKind, string> = {
  difficulty: "🧩",
  attention: "⚠️",
  important: "❗",
  concept: "💡",
  summary: "📋",
  tip: "✨",
  note: "📝",
};

export function PointBadge({ kind, label }: { kind: PointKind; label?: string }) {
  return (
    <span className={`point-badge point-${kind}`}>
      <span aria-hidden>{POINT_ICONS[kind]}</span> {label || t.recall.kinds[kind]}
    </span>
  );
}

export function RecallView(props: { path: string; links?: WikiLinks; onBack(): void; onOpenNote(path: string): void }) {
  const { notes, bump, toast } = useApp();
  const [note, setNote] = useState<{ title: string; sections: Section[]; review?: ReturnType<typeof readReview> } | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  useBack(true, props.onBack);
  const today = isoDate();

  useEffect(() => {
    notes
      .load(props.path)
      .then(n => setNote({ title: titleOf(n.body), sections: sectionsOf(n.body), review: readReview(n.data.review) }))
      .catch(e => toast({ text: e instanceof Error ? e.message : String(e), error: true }));
  }, [props.path]);

  if (!note) return <div className="note-editor" />;
  const all = note.sections.map((_, i) => i);
  const allOpen = all.length > 0 && all.every(i => open.has(i) || !note.sections[i].text.trim());
  const toggle = (i: number) => setOpen(o => (o.has(i) ? new Set([...o].filter(x => x !== i)) : new Set([...o, i])));

  const grade = async (g: NoteGrade) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = scheduleNote(note.review, g, today);
      const old = await setNoteReview(notes, props.path, next);
      bump();
      toast({
        text: t.recall.comesBack(next.interval),
        action: { label: t.common.undo, run: () => void setNoteReview(notes, props.path, old).then(bump) },
      });
      props.onBack();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="note-editor recall">
      <div className="note-bar">
        <button className="btn ghost icon" onClick={props.onBack} aria-label={t.common.back} title={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="note-status one-line">{t.recall.title}</span>
        <button className="btn ghost icon" onClick={() => setOpen(allOpen ? new Set() : new Set(all))} title={allOpen ? t.recall.hideAll : t.recall.showAll} aria-label={allOpen ? t.recall.hideAll : t.recall.showAll}>
          {allOpen ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <div className="page">
        <div className="page-inner stack recall-inner">
          <div className="stack" style={{ gap: 4 }}>
            <h1 className="material-title">{note.title || t.common.untitled}</h1>
            <p className="muted small">{t.recall.hint}</p>
          </div>
          <div className="recall-source small">
            <span className="muted">{t.recall.source}</span>
            <button className="btn" onClick={() => props.onOpenNote(props.path)}>
              <Pencil size={16} /> {t.recall.editNote}
            </button>
          </div>
          {note.sections.length === 0 ? (
            <p className="muted">{t.recall.empty}</p>
          ) : (
            <ol className="recall-list">
              {note.sections.map((sec, i) => {
                const has = sec.text.trim() !== "";
                const shown = open.has(i);
                const kinds = [...new Set(sortPoints(sec.points).map(p => p.kind))];
                return (
                  <li key={i} className={`recall-sec${shown ? " open" : ""}`} style={{ marginLeft: `${Math.max(0, sec.level - 2) * 18}px` }}>
                    <div className="recall-head">
                      <span className={`recall-title${sec.level <= 2 ? " big" : ""}`}>{sec.title || (note.sections.length === 1 ? t.recall.whole : t.study.intro)}</span>
                      {kinds.map(k => (
                        <PointBadge key={k} kind={k} />
                      ))}
                      {has && (
                        <button className="btn ghost recall-show" onClick={() => toggle(i)} aria-expanded={shown}>
                          {shown ? <EyeOff size={16} /> : <Eye size={16} />} {shown ? t.recall.hide : t.recall.show}
                        </button>
                      )}
                    </div>
                    {has && !shown && <textarea className="field recall-try" rows={1} placeholder={t.recall.tryHere} aria-label={t.recall.tryHere} />}
                    {shown && <Rendered text={sec.text} from={props.path} links={props.links} />}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="recall-end stack">
            <span className="subj-kicker">{t.recall.howWasIt}</span>
            <div className="grades recall-grades">
              {NOTE_GRADES.map(g => (
                <button key={g} className={`btn grade ${g === "forgot" ? "again" : g === "partly" ? "hard" : "good"}`} disabled={busy} onClick={() => grade(g)}>
                  <span>{t.recall.grades[g]}</span>
                  <span className="mono small muted">{t.study.inDays(scheduleNote(note.review, g, today).interval)}</span>
                </button>
              ))}
            </div>
            <p className="muted small">{t.recall.errorsHelp}</p>
            <button className="btn ghost" onClick={props.onBack}>
              {t.recall.notNow}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Review points of a subject and the subjects under it: where it was hard first, then in notebook order. */
export function pointsOf(subjects: Subject[]): { point: ReviewPoint; path: string; note: string; subject: string }[] {
  const out: { point: ReviewPoint; path: string; note: string; subject: string }[] = [];
  for (const s of subjects) {
    const book = notebookOf(s);
    const ordered = [...book, ...s.notes.filter(n => !book.includes(n))];
    for (const n of ordered) for (const p of n.points) out.push({ point: p, path: n.path, note: n.title, subject: s.title });
  }
  return sortPoints(out.map(x => ({ ...x, kind: x.point.kind }))).map(({ kind: _, ...x }) => x);
}

export function PointsView(props: { subject: Subject; subjects: Subject[]; links?: WikiLinks; onBack(): void; onOpenNote(path: string): void }) {
  useBack(true, props.onBack);
  const list = pointsOf(props.subjects);
  const kinds = [...new Set(list.map(x => x.point.kind))];
  const [only, setOnly] = useState<PointKind | "">("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const shown = list.map((x, i) => ({ ...x, i })).filter(x => !only || x.point.kind === only);
  const several = new Set(list.map(x => x.subject)).size > 1;
  return (
    <div className="note-editor recall">
      <div className="note-bar">
        <button className="btn ghost icon" onClick={props.onBack} aria-label={t.common.back} title={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="note-status one-line">{t.recall.pointsTitle}</span>
      </div>
      <div className="page">
        <div className="page-inner stack recall-inner">
          <div className="stack" style={{ gap: 4 }}>
            <h1 className="material-title">{props.subject.title}</h1>
            <p className="muted small">{t.recall.pointsHint}</p>
          </div>
          {kinds.length > 1 && (
            <div className="chips" role="tablist" aria-label={t.study.show}>
              <button role="tab" aria-selected={!only} className={`chip${!only ? " active" : ""}`} onClick={() => setOnly("")}>
                {t.recall.allPoints}
              </button>
              {kinds.map(k => (
                <button key={k} role="tab" aria-selected={only === k} className={`chip${only === k ? " active" : ""}`} onClick={() => setOnly(only === k ? "" : k)}>
                  {POINT_ICONS[k]} {t.recall.kinds[k]}
                </button>
              ))}
            </div>
          )}
          {list.length === 0 ? (
            <div className="stack" style={{ gap: 6 }}>
              <p className="muted">{t.recall.noPoints}</p>
              <p className="muted small">
                <Lightbulb size={14} /> {t.recall.howToMark}
              </p>
            </div>
          ) : (
            <ul className="recall-list">
              {shown.map(x => {
                const on = open.has(x.i);
                return (
                  <li key={x.i} className={`recall-sec${on ? " open" : ""}`}>
                    <div className="recall-head">
                      <PointBadge kind={x.point.kind} label={x.point.label} />
                      <span className="recall-title">{x.point.section || x.note}</span>
                      <button
                        className="btn ghost recall-show"
                        aria-expanded={on}
                        onClick={() => setOpen(o => (on ? new Set([...o].filter(y => y !== x.i)) : new Set([...o, x.i])))}
                      >
                        {on ? <EyeOff size={16} /> : <Eye size={16} />} {on ? t.recall.hide : t.recall.show}
                      </button>
                    </div>
                    <button className="link-btn small muted recall-where" onClick={() => props.onOpenNote(x.path)}>
                      {[several ? x.subject : "", x.point.section ? x.note : ""].filter(Boolean).join(" › ") || t.study.openNote}
                    </button>
                    {on && <Rendered text={x.point.text} from={x.path} links={props.links} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export const RecallIcon = Brain;
