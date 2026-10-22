import { useEffect, useState } from "react";

// Small per-device view choices in Study (open section, chosen course, open tree branches).
// A convenience: storage may fail, and the view then simply starts from the defaults.

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** Every hook on a key hears a change made through another one (the Personal view, read by two screens). */
const changed = new EventTarget();

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const hear = (e: Event) => setValue((e as CustomEvent<T>).detail);
    changed.addEventListener(key, hear);
    return () => changed.removeEventListener(key, hear);
  }, [key]);
  const set = (v: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // Not remembered: still works for now.
    }
    changed.dispatchEvent(new CustomEvent(key, { detail: v }));
  };
  return [value, set];
}
