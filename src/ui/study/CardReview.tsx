import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BookOpen, Layers } from "lucide-react";
import { GRADES, schedule, type Grade } from "../../data/cards";
import { isoDate } from "../../data/dates";
import { dueCards, setCardState, type DueCard, type Subject } from "../../data/study";
import { todayPicks } from "../../data/notebook";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { t } from "../../i18n";

// Flashcard review (data/cards): one card at a time, question first; "Show answer", then how well
// it was remembered. "Again" puts the card back at the end of this session. Keys on the PC:
// Space shows the answer, 1–4 answer.

/** `code` and **bold** inside a card; everything else as typed (line breaks kept). */
export function CardText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  text.split(/(`[^`]+`)/).forEach((p, i) => {
    if (/^`[^`]+`$/.test(p)) parts.push(<code key={i}>{p.slice(1, -1)}</code>);
    else
      p.split(/(\*\*[^*]+\*\*)/).forEach((q, k) =>
        parts.push(/^\*\*[^*]+\*\*$/.test(q) ? <b key={`${i}-${k}`}>{q.slice(2, -2)}</b> : <Fragment key={`${i}-${k}`}>{q}</Fragment>),
      );
  });
  return <div className="card-text">{parts}</div>;
}

export function CardReview(props: { cards: DueCard[]; onClose(): void; onOpenNote(path: string): void }) {
  const { notes, bump, toast } = useApp();
  // A snapshot: the list reloads after every answer, the session keeps its own queue.
  const [queue, setQueue] = useState(props.cards);
  const [shown, setShown] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  useBack(true, props.onClose);
  const today = isoDate();
  const c = queue[0];

  const answer = async (g: Grade) => {
    if (!c || busy) return;
    setBusy(true);
    try {
      const next = schedule(c.state, g, today);
      await setCardState(notes, c.notePath, c.card.id, next);
      bump();
      setQueue(q => (g === "again" ? [...q.slice(1), { ...q[0], state: next }] : q.slice(1)));
      setShown(false);
      if (g !== "again") setCount(n => n + 1);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " && !shown) {
        e.preventDefault();
        setShown(true);
      } else if (shown && /^[1-4]$/.test(e.key)) void answer(GRADES[Number(e.key) - 1]);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  return (
    <div className="note-editor card-review">
      <div className="note-bar">
        <button className="btn ghost icon" onClick={props.onClose} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="note-status">{t.study.session}</span>
        {c && <span className="count mono muted small">{t.study.left(queue.length)}</span>}
      </div>
      <div className="page">
        <div className="page-inner">
          {!c ? (
            <div className="review-done">
              <Layers size={28} className="muted" />
              <p>{count ? t.study.sessionDone(count) : t.study.nothingDue}</p>
              <button className="btn" onClick={props.onClose}>
                {t.common.close}
              </button>
            </div>
          ) : (
            <>
              <div className="muted small review-from">
                {c.subjectTitle} · {c.noteTitle || t.common.untitled}
              </div>
              <div className="flashcard">
                <CardText text={c.card.front} />
                {shown && (
                  <>
                    <hr />
                    <CardText text={c.card.back} />
                  </>
                )}
              </div>
              {!shown ? (
                <button className="btn primary review-show" onClick={() => setShown(true)}>
                  {t.study.showAnswer}
                </button>
              ) : (
                <div className="grades">
                  {GRADES.map((g, i) => (
                    <button key={g} className={`btn grade ${g}`} disabled={busy} onClick={() => answer(g)} title={`${i + 1}`}>
                      <span>{t.study.grades[g]}</span>
                      <span className="mono small muted">{t.study.inDays(schedule(c.state, g, today).interval)}</span>
                    </button>
                  ))}
                </div>
              )}
              <button className="btn ghost review-open" onClick={() => props.onOpenNote(c.notePath)}>
                <BookOpen size={16} /> {t.study.openNote}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** On Today: where reading stopped (a material or a notebook chapter) and, quietly, the cards. Hidden when there is neither. */
export function StudyCard(props: { subjects: Subject[]; onReview(): void; onContinue(path: string, chapter?: number): void }) {
  const due = dueCards(props.subjects).length;
  const go = todayPicks(props.subjects).find(p => p.kind === "continue-material" || p.kind === "continue-notebook");
  if (!due && !go) return null;
  const what =
    go?.kind === "continue-material"
      ? `${go.material.title} · ${go.title || t.study.chapter(go.chapter)}`
      : go?.kind === "continue-notebook"
        ? `${go.subject.title} · ${go.note.title}`
        : "";
  return (
    <div className="today-card study-card" aria-label={t.study.todayCard}>
      <Layers size={18} />
      <span className="what">
        <span className="muted small">{t.study.todayCard}</span>
        {what && <span className="one-line">{what}</span>}
        {due > 0 && (
          <button className="subj-review-quiet" style={{ padding: "2px 0" }} onClick={props.onReview}>
            {t.study.reviewWhenever(due)}
          </button>
        )}
      </span>
      {go && (
        <button
          className="btn"
          onClick={() =>
            go.kind === "continue-material" ? props.onContinue(go.material.path, go.chapter) : go.kind === "continue-notebook" && props.onContinue(go.note.path)
          }
        >
          {t.study.continue}
        </button>
      )}
    </div>
  );
}
