import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBack } from "./useBack";

// A small menu at the pointer: right-click on the PC, hold on the phone (useHold), the "⋯"
// button or Shift+F10 / the Menu key on a focused row. It closes on a pick, a click outside,
// Escape, Back or when the page scrolls under it. The keyboard moves through it (↑ ↓ Home End,
// a letter jumps to the item starting with it) and focus goes back where it was on closing.

export interface MenuItem {
  icon: ReactNode;
  label: string;
  run(): void;
  danger?: boolean;
  /** A shortcut that does the same, shown at the right ("F2"). */
  keys?: string;
  /** A line above this item (separates the destructive ones). */
  divide?: boolean;
}

/** Where to open a menu for an element (keyboard, "⋯" button): under its left side. */
export function menuPointOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + 8, y: r.bottom };
}

export function ContextMenu(props: { at: { x: number; y: number }; label: string; items: MenuItem[]; onClose(): void }) {
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: props.at.x, top: props.at.y, ready: false });
  // Focus returns to what had it (the row or button the menu came from).
  const [before] = useState(() => document.activeElement as HTMLElement | null);
  const close = () => {
    props.onClose();
    before?.focus?.({ preventScroll: true });
  };
  useBack(true, close);

  // Kept inside the window: opens to the left or upwards when there is no room.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(props.at.x, innerWidth - width - 8));
    const top = props.at.y + height + 8 > innerHeight ? Math.max(8, props.at.y - height) : props.at.y;
    setPos({ left, top, ready: true });
  }, [props.at.x, props.at.y]);

  // The first item takes focus once the menu is visible (a hidden element cannot).
  useLayoutEffect(() => {
    if (pos.ready) pop.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [pos.ready]);

  useLayoutEffect(() => {
    const onScroll = (e: Event) => !pop.current?.contains(e.target as Node) && props.onClose();
    addEventListener("scroll", onScroll, true);
    addEventListener("resize", props.onClose);
    return () => {
      removeEventListener("scroll", onScroll, true);
      removeEventListener("resize", props.onClose);
    };
  }, [props.onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(pop.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") close();
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const next = [...items.slice(i + 1), ...items.slice(0, i + 1)].find(x => x.textContent?.trim().toLowerCase().startsWith(k));
      next?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div className="more-backdrop" onPointerDown={props.onClose} onContextMenu={e => (e.preventDefault(), props.onClose())} />
      <div
        ref={pop}
        className="more-pop ctx-pop"
        role="menu"
        aria-label={props.label}
        onKeyDown={onKey}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
      >
        <span className="ctx-title one-line" aria-hidden="true">
          {props.label}
        </span>
        {props.items.map(x => (
          <button
            key={x.label}
            role="menuitem"
            tabIndex={-1}
            className={`menu-item${x.danger ? " danger" : ""}${x.divide ? " divide" : ""}`}
            aria-keyshortcuts={x.keys}
            onClick={() => {
              close();
              x.run();
            }}
          >
            {x.icon} <span className="ctx-label">{x.label}</span>
            {x.keys && <kbd className="ctx-keys">{x.keys}</kbd>}
          </button>
        ))}
      </div>
    </>
  );
}
