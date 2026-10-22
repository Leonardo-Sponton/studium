import { createContext, useContext } from "react";
import type { Platform } from "../platform/types";
import type { Notes } from "../data/notes";
import type { Settings } from "../data/settings";

export interface Toast {
  id: number;
  text: string;
  error?: boolean;
  action?: { label: string; run: () => void };
}

export interface AppCtx {
  platform: Platform;
  notes: Notes;
  settings: Settings;
  updateSettings(s: Partial<Settings>): Promise<void>;
  toast(t: Omit<Toast, "id">): void;
  /** Asks before deleting (a tap by mistake must not delete). `what` = the item's name, if any. */
  confirmDelete(what?: string, text?: string): Promise<boolean>;
  /** Changes whenever data on disk changes; screens reload when it does. */
  version: number;
  bump(): void;
  /** Opens a drawing (drawings/x.excalidraw.md) in the drawing editor, over everything. */
  openDrawing(path: string): void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside the app");
  return c;
}
