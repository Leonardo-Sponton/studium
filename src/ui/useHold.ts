import { useEffect, useRef } from "react";

// Hold a row (touch) or right-click it (PC) to open its options, as in the task rows.
// `eaten()` is true right after a hold, so the click that follows does not open the row.

const HOLD = 500;

// The menu opens under a finger that is still down, and Android's own long press then selects
// whatever text is nearest (menu title, nav labels). Block that until the finger lifts.
function blockSelectionUntilLift() {
  const block = (e: Event) => e.preventDefault();
  const done = () => {
    removeEventListener("selectstart", block, true);
    removeEventListener("contextmenu", block, true);
    removeEventListener("pointerup", done, true);
    removeEventListener("pointercancel", done, true);
  };
  addEventListener("selectstart", block, true);
  addEventListener("contextmenu", block, true);
  addEventListener("pointerup", done, true);
  addEventListener("pointercancel", done, true);
  setTimeout(done, 3000); // never left on by a lost pointerup
}

/** `onMenu` gets the held element (to place a popup next to it) and where the pointer was. */
export function useHold(onMenu: (el: HTMLElement, at: { x: number; y: number }) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const ate = useRef(false);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  return {
    eaten: () => ate.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        ate.current = false;
        if (e.pointerType !== "touch") return;
        start.current = { x: e.clientX, y: e.clientY };
        const el = e.currentTarget as HTMLElement;
        const at = { x: e.clientX, y: e.clientY };
        stop();
        timer.current = setTimeout(() => {
          ate.current = true;
          navigator.vibrate?.(20);
          blockSelectionUntilLift();
          onMenu(el, at);
        }, HOLD);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 10) stop();
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        stop();
        onMenu(e.currentTarget as HTMLElement, { x: e.clientX, y: e.clientY });
      },
    },
  };
}
