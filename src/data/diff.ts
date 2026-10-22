// Line diff for the conflicts screen: which lines of each version are not in the other.
// Longest common subsequence; notes are small, very long files are just not marked.

const MAX_CELLS = 4_000_000;

export interface Marked {
  /** One flag per line of a / b: true when the line is not in the common part. */
  a: boolean[];
  b: boolean[];
}

export function diffLines(a: string[], b: string[]): Marked | null {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  // len[i][j] = LCS length of a[i..] and b[j..], kept in one flat array.
  const w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
  const out: Marked = { a: a.map(() => true), b: b.map(() => true) };
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      out.a[i++] = false;
      out.b[j++] = false;
    } else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) i++;
    else j++;
  }
  return out;
}
