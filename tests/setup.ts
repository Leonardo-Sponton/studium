import { beforeEach } from "vitest";
import { setLang } from "../src/i18n";

// The app follows the device's language; the tests expect English unless they switch.
beforeEach(() => setLang("en"));
