import { addDays, isoDate } from "./dates";
import { readState, schedule, type CardState } from "./cards";

// Studying from what is already written, with no flashcards to make:
//   sections      a note cut at its headings, for "Try to recall": only the headings show, the
//                 text under each opens after trying to explain it
//   review points the callouts a note already has ("> **Atenção**", "> ⚠️ Ponto de Atenção",
//                 "> Obs.", "**Importante:**", "> [!warning]", a "Resumindo" table…), kept as
//                 things to look at again; "> **Dificuldade**" (or "> [!dificuldade]") marks where
//                 understanding was hard, and those come first
//   note review   a whole note comes back after some days ("Remembered / Partly / Forgot"),
//                 its state in the note's header, `review: "<due> <interval days> <ease %>"`

export interface Section {
  /** 1–6; 0 for the text before the first heading. */
  level: number;
  title: string;
  /** The text under the heading, up to the next heading of any level (the heading line not included). */
  text: string;
  /** 0-based line of the heading in the body. */
  line: number;
  /** Review points inside this section's text. */
  points: ReviewPoint[];
}

export type PointKind = "difficulty" | "attention" | "important" | "concept" | "note" | "tip" | "summary";
/** The order points are listed in: where it was hard first. */
export const POINT_KINDS: PointKind[] = ["difficulty", "attention", "important", "concept", "summary", "tip", "note"];

/** The Obsidian callout type "/" writes for each kind ("> [!difficulty] Dificuldade"). */
export const POINT_CALLOUTS: Record<PointKind, string> = {
  difficulty: "difficulty",
  attention: "warning",
  important: "important",
  concept: "concept",
  summary: "summary",
  tip: "tip",
  note: "note",
};

export interface ReviewPoint {
  kind: PointKind;
  /** What the callout says it is ("Ponto de Atenção 2", "Atenção"), as written. */
  label: string;
  /** The point's Markdown, quote marks removed. */
  text: string;
  /** 0-based line where it starts. */
  line: number;
  /** The heading it sits under ("" before any). */
  section: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
/** Bold, italics, code marks and emoji off: what a label reads as. */
const plain = (s: string) =>
  s
    .replace(/[*_`~]/g, "")
    .replace(/[\p{Extended_Pictographic}️]/gu, "")
    .trim();

const CALLOUT_KINDS: Record<string, PointKind> = {
  warning: "attention",
  caution: "attention",
  attention: "attention",
  danger: "attention",
  error: "attention",
  bug: "attention",
  important: "important",
  note: "note",
  info: "note",
  tip: "tip",
  hint: "tip",
  success: "tip",
  abstract: "summary",
  summary: "summary",
  tldr: "summary",
  example: "concept",
  quote: "note",
  dificuldade: "difficulty",
  difficulty: "difficulty",
  dificil: "difficulty",
  hard: "difficulty",
  conceito: "concept",
  concept: "concept",
  definition: "concept",
  atencao: "attention",
  importante: "important",
  resumo: "summary",
  dica: "tip",
  obs: "note",
};

/** The kind a label starts with ("Ponto de Atenção", "Obs.", "Importante:"…), or null when it is not a point. */
export function pointKind(label: string): PointKind | null {
  const w = fold(plain(label)).replace(/^[^a-z]+/, "");
  if (/^(dificuldade|onde (eu )?tive dificuldade|nao entendi|dificil|difficulty|hard part)\b/.test(w)) return "difficulty";
  if (/^(ponto de atencao|atencao|cuidado|aviso|warning|caution|attention|watch out)\b/.test(w)) return "attention";
  if (/^(importante|important)\b/.test(w)) return "important";
  if (/^(conceito|definicao|concept|definition)\b/.test(w)) return "concept";
  if (/^(resumindo|resumo|em resumo|summary|in short)\b/.test(w)) return "summary";
  if (/^(dica|tip)\b/.test(w)) return "tip";
  if (/^(obs|observacao|observacoes|observacao interessante|nota|note)\b/.test(w)) return "note";
  return null;
}

/** The label of a point's first line: an Obsidian callout's title or type, or the bold/first words. */
function labelOf(first: string): string {
  const call = /^\[!([^\]]+)\][+-]?\s*(.*)$/.exec(first);
  if (call) return plain(call[2]) || call[1];
  const bold = /^(?:[\p{Extended_Pictographic}️\s]*)\*\*(.+?)\*\*/u.exec(first);
  if (bold) return plain(bold[1]).replace(/[:!.]+$/, "");
  return plain(first.split(/[:!]|\.\s/)[0]).split(/\s+/).slice(0, 4).join(" ").replace(/[.]+$/, "");
}

/** The review points of a note body (code blocks skipped). */
export function reviewPoints(body: string): ReviewPoint[] {
  const lines = body.split("\n");
  const out: ReviewPoint[] = [];
  let fence = false;
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(l);
    if (h) {
      section = plain(h[2]);
      // A "Resumindo" heading: the text under it, up to the next heading.
      if (pointKind(h[2]) === "summary") {
        let j = i + 1;
        while (j < lines.length && !/^#{1,6}[ \t]/.test(lines[j])) j++;
        const text = lines.slice(i + 1, j).join("\n").trim();
        if (text) out.push({ kind: "summary", label: section, text, line: i, section });
      }
      continue;
    }
    if (/^\s*>/.test(l)) {
      // A quote block: consecutive ">" lines.
      let j = i;
      while (j < lines.length && /^\s*>/.test(lines[j])) j++;
      const inner = lines.slice(i, j).map(x => x.replace(/^\s*>\s?/, ""));
      const first = inner.find(x => x.trim()) ?? "";
      const call = /^\[!([^\]]+)\]/.exec(first.trim());
      const kind = call ? (CALLOUT_KINDS[fold(call[1])] ?? "note") : pointKind(first);
      if (kind) out.push({ kind, label: labelOf(first.trim()), text: inner.join("\n").trim(), line: i, section });
      i = j - 1;
      continue;
    }
    // A paragraph starting with "**Importante:**", "Obs.", "⚠️ …".
    if (/^\s*(\*\*[^*]+\*\*|Obs\.|⚠️|Observa)/u.test(l)) {
      const kind = pointKind(l) ?? (/^\s*⚠️/u.test(l) ? "attention" : null);
      if (!kind) continue;
      let j = i;
      while (j < lines.length && lines[j].trim() && !/^#{1,6}[ \t]/.test(lines[j])) j++;
      // A label on a line of its own ("**Resumindo**") takes the block after it (a table, a list).
      if (j === i + 1 && /^\s*\*\*[^*]+\*\*[:.!]?\s*$/.test(l)) {
        let k = j;
        while (k < lines.length && !lines[k].trim()) k++;
        if (k < lines.length && !/^#{1,6}[ \t]/.test(lines[k]) && !/^\s*(```|~~~)/.test(lines[k])) {
          j = k;
          while (j < lines.length && lines[j].trim() && !/^#{1,6}[ \t]/.test(lines[j])) j++;
        }
      }
      out.push({ kind, label: labelOf(l.trim()), text: lines.slice(i, j).join("\n").trim(), line: i, section });
      i = j - 1;
    }
  }
  return out;
}

/** Points sorted for review: by kind (difficulty first), then in note order. */
export const sortPoints = <T extends { kind: PointKind }>(list: T[]) =>
  [...list].sort((a, b) => POINT_KINDS.indexOf(a.kind) - POINT_KINDS.indexOf(b.kind));

/**
 * A note cut at its headings. The note's "# Title" line (the first line, when it is a level-1
 * heading) is not a section. Text before the first heading is a level-0 section when not empty.
 */
export function sectionsOf(body: string): Section[] {
  const lines = body.split("\n");
  const heads: { level: number; title: string; line: number }[] = [];
  let fence = false;
  let skip = -1;
  const firstText = lines.findIndex(l => l.trim());
  if (firstText >= 0 && /^#[ \t]+/.test(lines[firstText])) skip = firstText;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    else if (!fence && i !== skip) {
      const m = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(l);
      if (m) heads.push({ level: m[1].length, title: plain(m[2]), line: i });
    }
  });
  const points = reviewPoints(body);
  const textOf = (from: number, to: number) => lines.slice(from, to).join("\n").replace(/^\s*\n/, "").trimEnd();
  const pointsIn = (from: number, to: number) => points.filter(p => p.line >= from && p.line < to);
  const out: Section[] = [];
  const start = skip + 1;
  const end0 = heads[0]?.line ?? lines.length;
  const intro = textOf(start, end0);
  if (intro.trim()) out.push({ level: 0, title: "", text: intro, line: start, points: pointsIn(start, end0) });
  heads.forEach((h, i) => {
    const to = heads[i + 1]?.line ?? lines.length;
    out.push({ level: h.level, title: h.title, text: textOf(h.line + 1, to), line: h.line, points: pointsIn(h.line + 1, to) });
  });
  return out;
}

// ---- Whole-note review ----

export type NoteGrade = "forgot" | "partly" | "remembered";
export const NOTE_GRADES: NoteGrade[] = ["forgot", "partly", "remembered"];

/** Next review of a whole note. First time: 1, 3 or 5 days; then it grows like a card (data/cards). */
export function scheduleNote(s: CardState | undefined, g: NoteGrade, today = isoDate()): CardState {
  const day = (n: number) => isoDate(addDays(new Date(`${today}T00:00`), n));
  if (!s || s.interval === 0) {
    const interval = g === "forgot" ? 1 : g === "partly" ? 3 : 5;
    return { due: day(interval), interval, ease: s?.ease ?? 250 };
  }
  // Forgetting a whole note brings it back tomorrow, not later today.
  if (g === "forgot") return { due: day(1), interval: 1, ease: Math.max(130, s.ease - 20) };
  return schedule(s, g === "partly" ? "hard" : "good", today);
}

export const readReview = (v: unknown): CardState | undefined => readState(v);
