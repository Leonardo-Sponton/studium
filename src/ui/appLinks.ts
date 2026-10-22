import { useMemo, useRef } from "react";
import type { WikiLinks } from "../editor/wikiLinks";
import { linkTargets, type Subject } from "../data/study";
import { fold } from "../data/search";
import type { Notes } from "../data/notes";

// [[Links]] across the whole app, as in an Obsidian vault: a name opens the study note,
// material or subject with that title (accents and capitals ignored).

export interface LinkPlace {
  area: "study";
  path: string;
  title: string;
}

export function linkPlaces(lists: { study: Subject[] }): LinkPlace[] {
  return linkTargets(lists.study).map(x => ({ area: "study", path: x.path, title: x.title }));
}

export function findPlace(places: LinkPlace[], name: string): LinkPlace | null {
  const key = fold(name.trim()).folded;
  if (!key) return null;
  return places.find(p => fold(p.title).folded === key) ?? null;
}

export function useAppLinks(lists: { study: Subject[] }, store: Notes, go: { open(place: LinkPlace): void }): WikiLinks {
  const places = useMemo(() => linkPlaces(lists), [lists.study]);
  const ref = useRef({ places, go });
  ref.current = { places, go };
  return useMemo<WikiLinks>(
    () => ({
      names: () => ref.current.places.map(p => p.title),
      open: name => {
        const hit = findPlace(ref.current.places, name);
        if (hit) ref.current.go.open(hit);
      },
      read: async name => {
        const hit = findPlace(ref.current.places, name);
        if (!hit) return null;
        try {
          return (await store.load(hit.path)).body;
        } catch {
          return null;
        }
      },
    }),
    [store],
  );
}
