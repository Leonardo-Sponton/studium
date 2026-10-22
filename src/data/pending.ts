// Unsaved edits that must reach the disk before the app closes or goes to the background
// (SPEC 2.4). Each open editor registers a function that writes its pending text.

const flushers = new Set<() => Promise<void>>();

export function onFlush(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map(f => f()));
}
