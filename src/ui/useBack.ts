import { useEffect, useRef } from "react";

// Android back (button or edge swipe): closes what is on top, one step at a time: a dialog,
// then an open note, then the area (back to Today). Only on Today does the app leave.
const stack: { run(): void }[] = [];

/** While `active`, back runs `onBack`. The most recently opened thing goes first. */
export function useBack(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const h = { run: () => ref.current() };
    stack.push(h);
    return () => {
      const i = stack.indexOf(h);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Runs the top handler. False when nothing is open. */
export function goBack(): boolean {
  const h = stack.at(-1);
  if (!h) return false;
  h.run();
  return true;
}
