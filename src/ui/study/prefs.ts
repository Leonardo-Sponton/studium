import { useState } from "react";

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

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // Not remembered: still works for now.
    }
  };
  return [value, set];
}
