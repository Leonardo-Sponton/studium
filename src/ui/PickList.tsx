import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fold } from "../data/search";
import { useBack } from "./useBack";
import { t } from "../i18n";

// A list to pick one thing from, with a filter on top (↑ ↓ Enter, Escape): where a note goes,
// where a subject moves to. The same look as the quick switcher.

export interface PickOption {
  key: string;
  label: string;
  /** Where it is (a group, a parent subject), shown small under the name and searched too. */
  sub?: string;
  icon?: ReactNode;
  /** Shown but not pickable (where the thing already is). */
  current?: boolean;
}

export function PickList(props: { title: string; options: PickOption[]; onPick(key: string): void; onClose(): void; currentLabel?: string }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useBack(true, props.onClose);

  const rows = useMemo(() => {
    const words = fold(query).folded.split(/\s+/).filter(Boolean);
    return props.options.filter(o => words.every(w => fold(`${o.label} ${o.sub ?? ""}`).folded.includes(w)));
  }, [query, props.options]);
  const pickable = rows.filter(r => !r.current);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(".switcher-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (o: PickOption | undefined) => {
    if (!o || o.current) return;
    props.onClose();
    props.onPick(o.key);
  };

  return (
    <div className="dialog-backdrop" onClick={e => e.target === e.currentTarget && props.onClose()}>
      <div className="card stack dialog" role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        <input
          className="search-input"
          autoFocus
          value={query}
          placeholder={t.explorer.filter}
          aria-label={t.explorer.filter}
          aria-controls="pick-list"
          aria-activedescendant={pickable[active] ? `pick-${pickable[active].key}` : undefined}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "ArrowDown") setActive(a => Math.min(pickable.length - 1, a + 1));
            else if (e.key === "ArrowUp") setActive(a => Math.max(0, a - 1));
            else if (e.key === "Enter") pick(pickable[active]);
            else if (e.key === "Escape") props.onClose();
            else return;
            e.preventDefault();
          }}
        />
        <div className="stack switcher-list" style={{ gap: 2 }} ref={list} id="pick-list" role="listbox" aria-label={props.title}>
          {rows.map(o => {
            const on = !o.current && pickable[active]?.key === o.key;
            return (
              <button
                key={o.key}
                id={`pick-${o.key}`}
                role="option"
                aria-selected={on}
                aria-disabled={o.current || undefined}
                tabIndex={-1}
                className={`menu-item switcher-item${on ? " active" : ""}${o.current ? " current" : ""}`}
                onMouseEnter={() => !o.current && setActive(pickable.indexOf(o))}
                onClick={() => pick(o)}
              >
                <span className="row" style={{ gap: 8 }}>
                  {o.icon}
                  {o.label}
                  {o.current && <small className="pick-here">{props.currentLabel ?? t.explorer.here}</small>}
                </span>
                {o.sub && <small>{o.sub}</small>}
              </button>
            );
          })}
          {!rows.length && <p className="muted">{t.switcher.none}</p>}
        </div>
      </div>
    </div>
  );
}
