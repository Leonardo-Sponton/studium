import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./ui/theme.css";
import { App } from "./ui/App";
import { electronPlatform, isElectron } from "./platform/electron";
import { androidPlatform } from "./platform/android";
import { memoryPlatform } from "./platform/memory";

// Pick the launcher we are running in. A plain browser (npm run dev) gets an in-memory folder.
const platform = isElectron()
  ? electronPlatform()
  : Capacitor.isNativePlatform()
    ? androidPlatform()
    : memoryPlatform();

createRoot(document.getElementById("root")!).render(<App platform={platform} />);
