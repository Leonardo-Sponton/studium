// Back and forward through what was opened in this session (Ctrl+Alt+← / →, the mouse's side
// buttons, the arrows above the tree), like a browser: opening something new drops the forward
// steps. A place is an area and, in a study area, the study path open there ("" = its home).
// Kept in memory only: a new session starts empty.

export interface Place {
  area: string;
  path: string;
}

const same = (a: Place, b: Place) => a.area === b.area && a.path === b.path;

export class History {
  private list: Place[] = [];
  private at = -1;
  constructor(private max = 100) {}

  /** Records a place the user went to (ignored when it is the current one). */
  visit(p: Place) {
    if (this.at >= 0 && same(this.list[this.at], p)) return;
    this.list = [...this.list.slice(0, this.at + 1), p].slice(-this.max);
    this.at = this.list.length - 1;
  }

  /**
   * Replaces the current place (a study area opening on its home first and a path a moment later
   * are one step). Used when the place changes without the user going somewhere new.
   */
  replace(p: Place) {
    if (this.at < 0) return this.visit(p);
    this.list[this.at] = p;
  }

  /** Drops places whose path no longer exists (deleted, moved). */
  forget(gone: (p: Place) => boolean) {
    const cur = this.list[this.at];
    this.list = this.list.filter(p => !gone(p) || p === cur);
    // Neighbours that became equal collapse.
    this.list = this.list.filter((p, i, l) => i === 0 || !same(p, l[i - 1]));
    this.at = cur ? this.list.findLastIndex(p => same(p, cur)) : this.list.length - 1;
  }

  get canBack() {
    return this.at > 0;
  }
  get canForward() {
    return this.at < this.list.length - 1;
  }

  back(): Place | null {
    return this.canBack ? this.list[--this.at] : null;
  }
  forward(): Place | null {
    return this.canForward ? this.list[++this.at] : null;
  }
}
