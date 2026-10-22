import { addDays, isoDate } from "./dates";

// Flashcards written inside study notes, with the same marks as the Obsidian Spaced Repetition
// plugin, so notes brought from Obsidian keep working:
//   Question :: Answer          one card
//   Front ::: Back              two cards (front → back and back → front)
//   lines of a question         a multi-line card: the question touches the "?" line,
//   ?                           the answer starts right under it; a blank line ends each side.
//   lines of the answer         "??" makes two cards, like ":::".
// Nothing inside code (``` blocks or `inline`) counts, so Java's String::length stays code.
//
// Review state lives in the note's header, `cards: { <id>: "<due> <interval days> <ease %>" }`,
// so it travels with the note. The id comes from the question text: editing the answer keeps the
// schedule, changing the question starts the card again.

export interface Card {
  id: string;
  front: string;
  back: string;
  /** 0-based line of the card in the note body (where its question starts). */
  line: number;
}

export interface CardState {
  /** Next review, yyyy-mm-dd. */
  due: string;
  /** Days between the last two reviews; 0 while the card is being learned. */
  interval: number;
  /** How fast the interval grows, in percent (250 = ×2.5). */
  ease: number;
}

export type Grade = "again" | "hard" | "good" | "easy";
export const GRADES: Grade[] = ["again", "hard", "good", "easy"];

/** FNV-1a, 32 bits, as 7 base-36 characters: short and stable. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

/** The line with every `inline code` span blanked out (same length), so marks inside it are ignored. */
const maskCode = (line: string) => line.replace(/`+[^`]*`+/g, m => " ".repeat(m.length));

const FENCE = /^\s*(```|~~~)/;
const LIST = /^\s*(?:[-*+]|\d+\.)\s+/;

/** Splits "a :: b" at the separator found in the masked line. */
function splitAt(line: string, masked: string, sep: RegExp): [string, string] | null {
  const m = sep.exec(masked);
  if (!m) return null;
  const front = line.slice(0, m.index).replace(LIST, "").trim();
  const back = line.slice(m.index + m[0].length).trim();
  return front && back ? [front, back] : null;
}

/** A line that is a card of its own ("a :: b"): it ends a multi-line card's side. */
const oneLine = (line: string) => /(?<!:)::(?!:)|(?<!:):::(?!:)/.test(maskCode(line));

export function parseCards(body: string): Card[] {
  const lines = body.split("\n");
  const code = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  lines.forEach((l, i) => {
    if (FENCE.test(l)) {
      code[i] = true;
      inFence = !inFence;
    } else code[i] = inFence;
  });

  const raw: { front: string; back: string; line: number; reverse: boolean }[] = [];
  const add = (front: string, back: string, line: number, both: boolean) => {
    raw.push({ front, back, line, reverse: false });
    if (both) raw.push({ front: back, back: front, line, reverse: true });
  };
  const usable = (i: number) => i >= 0 && i < lines.length && !code[i] && lines[i].trim() !== "";

  for (let i = 0; i < lines.length; i++) {
    if (code[i]) continue;
    const line = lines[i];
    const mark = line.trim();
    if (mark === "?" || mark === "??") {
      let a = i;
      while (usable(a - 1) && !/^#{1,6}\s/.test(lines[a - 1]) && !oneLine(lines[a - 1])) a--;
      let b = i;
      while (usable(b + 1) && !oneLine(lines[b + 1])) b++;
      if (a < i && b > i) {
        const front = lines.slice(a, i).join("\n").trim();
        const back = lines.slice(i + 1, b + 1).join("\n").trim();
        add(front, back, a, mark === "??");
      }
      continue;
    }
    const masked = maskCode(line);
    const both = splitAt(line, masked, /(?<!:):::(?!:)/);
    if (both) add(both[0], both[1], i, true);
    else {
      const one = splitAt(line, masked, /(?<!:)::(?!:)/);
      if (one) add(one[0], one[1], i, false);
    }
  }

  // The same question twice in one note gets -2, -3… so each keeps its own schedule.
  const seen = new Map<string, number>();
  return raw.map(r => {
    const base = hash(r.front) + (r.reverse ? "r" : "");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { id: n > 1 ? `${base}-${n}` : base, front: r.front, back: r.back, line: r.line };
  });
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readState(v: unknown): CardState | undefined {
  const [due, interval, ease] = String(v ?? "").trim().split(/\s+/);
  const i = Number(interval);
  const e = Number(ease);
  if (!DAY.test(due ?? "") || !Number.isFinite(i) || i < 0) return undefined;
  return { due, interval: Math.round(i), ease: Number.isFinite(e) && e >= 130 ? Math.round(e) : 250 };
}

export const writeState = (s: CardState) => `${s.due} ${s.interval} ${s.ease}`;

/** The states in a note header (`cards:`), by card id. */
export function statesOf(data: Record<string, unknown>): Map<string, CardState> {
  const out = new Map<string, CardState>();
  const c = data.cards;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    for (const [id, v] of Object.entries(c)) {
      const s = readState(v);
      if (s) out.set(id, s);
    }
  }
  return out;
}

const MAX_DAYS = 3650;
const MIN_EASE = 130;

/**
 * The next state after an answer (a simplified SM-2, the method Anki started from):
 * Again → back to learning, seen again in this session and due today; Hard → a bit longer than
 * last time; Good → interval × ease; Easy → more, and the card gets easier.
 */
export function schedule(s: CardState | undefined, g: Grade, today = isoDate()): CardState {
  const ease = s?.ease ?? 250;
  const last = s?.interval ?? 0;
  let interval: number;
  let next = ease;
  if (g === "again") {
    interval = 0;
    if (s && last > 0) next = ease - 20;
  } else if (last === 0) {
    interval = g === "easy" ? 4 : 1;
    if (g === "easy") next = ease + 15;
  } else if (g === "hard") {
    interval = Math.max(last + 1, Math.round(last * 1.2));
    next = ease - 15;
  } else if (g === "good") {
    interval = Math.max(last + 1, Math.round((last * ease) / 100));
  } else {
    interval = Math.max(last + 2, Math.round(((last * ease) / 100) * 1.3));
    next = ease + 15;
  }
  interval = Math.min(interval, MAX_DAYS);
  const due = isoDate(addDays(new Date(`${today}T00:00`), interval));
  return { due, interval, ease: Math.max(MIN_EASE, next) };
}

/** A new card (no state) or one whose day has come. */
export const isDue = (s: CardState | undefined, today = isoDate()) => !s || s.due <= today;
