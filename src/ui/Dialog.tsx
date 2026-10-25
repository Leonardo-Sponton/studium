import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBack } from "./useBack";
import { t } from "../i18n";

// Small modal pieces. Electron has no window.prompt, so text questions use AskText.

export function Dialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useBack(true, onClose);
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the dialog on top closes (one can open from inside another); the one under it may hear
    // the key after the top one is already gone, so the key is marked as used.
    const onKey = (e: KeyboardEvent) => {
      const all = document.querySelectorAll(".dialog-backdrop");
      if (e.key !== "Escape" || e.defaultPrevented || all[all.length - 1] !== backdrop.current) return;
      e.preventDefault();
      onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  // A tap on the backdrop closes; a swipe that starts there does not (on Android the back swipe
  // from the screen edge would otherwise close the dialog and then go back once more).
  const downOnBackdrop = useRef(false);
  return (
    <div
      ref={backdrop}
      className="dialog-backdrop"
      onPointerDown={e => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={e => downOnBackdrop.current && e.target === e.currentTarget && onClose()}
    >
      <div className="card stack dialog" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function AskText(props: {
  title: string;
  initial?: string;
  placeholder?: string;
  okLabel?: string;
  /** The answer may be left empty. */
  optional?: boolean;
  onOk(text: string): void;
  onClose(): void;
}) {
  const [text, setText] = useState(props.initial ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const ok = () => (props.optional || text.trim()) && props.onOk(text.trim());
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <input
        ref={input}
        className="field"
        autoFocus
        value={text}
        placeholder={props.placeholder}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ok()}
      />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={!props.optional && !text.trim()} onClick={ok}>
          {props.okLabel ?? t.common.ok}
        </button>
      </div>
    </Dialog>
  );
}

export function Confirm(props: { title: string; text: string; okLabel: string; danger?: boolean; onOk(): void; onClose(): void }) {
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <p className="muted" style={{ margin: 0 }}>
        {props.text}
      </p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className={`btn primary${props.danger ? " danger" : ""}`} onClick={props.onOk}>
          {props.okLabel}
        </button>
      </div>
    </Dialog>
  );
}
