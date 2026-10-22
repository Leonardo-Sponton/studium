import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FilePlus } from "lucide-react";
import { recentFiles } from "../editor/memory";
import { fold } from "../data/search";
import type { LinkPlace } from "./appLinks";
import { areaLabel } from "./SearchView";
import { useBack } from "./useBack";
import { t } from "../i18n";

// Ctrl+O: open any note by typing part of its title (Obsidian's quick switcher; recently opened
// first, like the Recent Files plugin). Ctrl+P: the same box for commands (command palette).

export interface Command {
  id: string;
  label: string;
  icon?: ReactNode;
  run(): void;
}

type Row = { key: string; label: string; sub?: string; icon?: ReactNode; run(): void };

export function QuickSwitcher(props: { mode: "open" | "commands"; places: LinkPlace[]; commands: Command[]; onOpen(p: LinkPlace): void; onCreate?(title: string): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useBack(true, props.onClose);
  useEffect(() => input.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const words = fold(query).folded.split(/\s+/).filter(Boolean);
    const hit = (s: string) => words.every(w => fold(s).folded.includes(w));
    if (props.mode === "commands") return props.commands.filter(c => hit(c.label)).map(c => ({ key: c.id, label: c.label, icon: c.icon, run: c.run }));
    const recent = recentFiles();
    const rank = (p: LinkPlace) => {
      const r = recent.indexOf(p.path);
      return r < 0 ? 1000 : r;
    };
    const shown = props.places
      .filter(p => hit(p.title))
      .sort((a, b) => rank(a) - rank(b) || Number(!fold(a.title).folded.startsWith(words[0] ?? "")) - Number(!fold(b.title).folded.startsWith(words[0] ?? "")) || a.title.localeCompare(b.title))
      .slice(0, 60)
      .map<Row>(p => ({ key: p.path, label: p.title, sub: areaLabel(p.area), run: () => props.onOpen(p) }));
    const name = query.trim();
    if (name && props.onCreate && !props.places.some(p => fold(p.title).folded === fold(name).folded)) {
      shown.push({ key: "+new", label: t.switcher.create(name), icon: <FilePlus size={16} />, run: () => props.onCreate?.(name) });
    }
    return shown;
  }, [query, props.places, props.commands, props.mode]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(".switcher-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (r: Row | undefined) => {
    if (!r) return;
    props.onClose();
    r.run();
  };

  return (
    <div className="dialog-backdrop" onClick={e => e.target === e.currentTarget && props.onClose()}>
      <div className="card stack dialog" role="dialog" aria-label={props.mode === "open" ? t.switcher.title : t.switcher.commands}>
        <input
          ref={input}
          className="search-input"
          value={query}
          placeholder={props.mode === "open" ? t.switcher.placeholder : t.switcher.commandPlaceholder}
          aria-label={props.mode === "open" ? t.switcher.title : t.switcher.commands}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(a => Math.min(rows.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(a => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(rows[active]);
            } else if (e.key === "Escape") props.onClose();
          }}
        />
        {props.mode === "open" && !query && rows.length > 0 && <span className="muted small">{t.switcher.recent}</span>}
        <div className="stack switcher-list" style={{ gap: 2 }} ref={list}>
          {rows.map((r, i) => (
            <button key={r.key} className={`menu-item switcher-item${i === active ? " active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}>
              <span className="row" style={{ gap: 8 }}>
                {r.icon}
                {r.label}
              </span>
              {r.sub && <small>{r.sub}</small>}
            </button>
          ))}
          {!rows.length && <p className="muted">{t.switcher.none}</p>}
        </div>
      </div>
    </div>
  );
}
