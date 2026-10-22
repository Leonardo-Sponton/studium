import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" so the built files load from disk in Electron and Android.
// Tests run in English whatever the machine's language (tests/setup.ts).
export default defineConfig({ base: "./", plugins: [react()], test: { setupFiles: ["tests/setup.ts"] } });
