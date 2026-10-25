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
  /** Where it is (its subject, or a subject's group), shown under the title. */
  where?: string;
}

export function linkPlaces(lists: { study: Subject[] }): LinkPlace[] {
  const dirOf = (p: string) => p.split("/").slice(0, 2).join("/");
  return linkTargets(lists.study).map(x => {
    const s = lists.study.find(y => y.dir === dirOf(x.path));
    const where = !s ? undefined : x.kind === "subject" ? s.group || (s.course ? undefined : "") : s.title;
    return { area: "study", path: x.path, title: x.title, where: where || undefined };
  });
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
