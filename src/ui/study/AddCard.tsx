import { useRef, useState } from "react";
import type { NewCard } from "../../data/study";
import { Dialog } from "../Dialog";
import { t } from "../../i18n";

// A flashcard written by hand: question, answer and "both ways". "Add another" keeps the dialog
// open for the next one; the cards are saved together in the subject's Flashcards note.

export function AddCard(props: { onOk(cards: NewCard[]): void; onClose(): void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [both, setBoth] = useState(false);
  const [added, setAdded] = useState<NewCard[]>([]);
  const first = useRef<HTMLTextAreaElement>(null);
  const ready = front.trim() !== "" && back.trim() !== "";

  const another = () => {
    setAdded([...added, { front, back, both }]);
    setFront("");
    setBack("");
    first.current?.focus();
  };
  const done = () => props.onOk(ready ? [...added, { front, back, both }] : added);

  return (
    <Dialog title={t.study.addCard} onClose={props.onClose}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="fl">{t.study.cardFront}</span>
        <textarea ref={first} className="field" rows={2} autoFocus value={front} onChange={e => setFront(e.target.value)} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="fl">{t.study.cardBack}</span>
        <textarea className="field" rows={3} value={back} onChange={e => setBack(e.target.value)} />
      </label>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={both} onChange={e => setBoth(e.target.checked)} />
        <span>{t.study.cardBoth}</span>
      </label>
      {added.length > 0 && <p className="muted small" style={{ margin: 0 }}>{t.study.cardsReady(added.length)}</p>}
      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn" disabled={!ready} onClick={another}>
          {t.study.addAnother}
        </button>
        <button className="btn primary" disabled={!ready && !added.length} onClick={done}>
          {t.common.save}
        </button>
      </div>
    </Dialog>
  );
}
