// Copies Excalidraw's fonts into public/excalidraw/fonts so drawings work offline (the library
// would fetch them from a CDN otherwise). Xiaolai (13 MB, Chinese/Japanese/Korean) is left out.
// Run by `npm run build`; public/excalidraw is git-ignored.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const from = `${root}node_modules/@excalidraw/excalidraw/dist/prod/fonts`;
const to = `${root}public/excalidraw/fonts`;
if (!existsSync(from)) throw new Error(`Excalidraw fonts not found in ${from}; run npm install`);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: src => !src.includes("/Xiaolai") });
console.log("Excalidraw fonts copied to public/excalidraw/fonts");
