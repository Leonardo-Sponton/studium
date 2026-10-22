import { parseLocal } from "../../data/dates";
import { dateFmt, num } from "../../i18n";

// Small display helpers shared by the School screens.

/** "Fri 24 Oct" / "sex., 24 de out." for a yyyy-mm-dd day. */
export function dateLabel(day: string): string {
  const d = parseLocal(day);
  return d ? dateFmt({ weekday: "short", day: "numeric", month: "short" }).format(d) : day;
}

/** A grade on the 0–10 scale: "7.5" / "7,5". */
export const gradeText = (g: number) => num(g, 2);
