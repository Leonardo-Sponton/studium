import { MemoryStorage } from "../storage/memory";
import type { Platform } from "./types";

// Browser preview (npm run dev): nothing is saved; reloading the page starts empty.
export function memoryPlatform(): Platform {
  let dir: string | null = null;
  return {
    name: "memory",
    storage: new MemoryStorage(),
    getDataDir: async () => dir,
    defaultDataDir: async () => "(browser memory)",
    setDataDir: async d => void (dir = d),
  };
}
