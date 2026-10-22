import { useEffect, useRef, useState, type ReactNode } from "react";
import { GraduationCap, Menu, Search, Settings as SettingsIcon, Sun, Trash2, Usb } from "lucide-react";
import { StudyCard } from "./study/CardReview";
import { StudyView, useCourses, useStudy, type StudyRequest } from "./study/StudyView";
import { ClassesToday } from "./study/School";
import { SearchView, type SearchState } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { SyncView } from "./SyncView";
import { TrashView } from "./TrashView";
import { useApp } from "./context";
import { goBack } from "./useBack";
import { useAppLinks, linkPlaces, type LinkPlace } from "./appLinks";
import { LinksCtx } from "./links";
import { QuickSwitcher, type Command } from "./QuickSwitcher";
import { flushAll } from "../data/pending";
import { t } from "../i18n";

export type Area = "today" | "study" | "search" | "trash" | "sync" | "settings" | "more";

const AREAS: { id: Area; icon: ReactNode }[] = [
  { id: "today", icon: <Sun size={20} /> },
  { id: "study", icon: <GraduationCap size={20} /> },
  { id: "search", icon: <Search size={20} /> },
  { id: "trash", icon: <Trash2 size={20} /> },
  { id: "sync", icon: <Usb size={20} /> },
  { id: "settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar; the rest lives under More.
const BOTTOM: Area[] = ["today", "study", "search", "more"];

function More({ go }: { go: (a: Area) => void }) {
  return (
    <div className="page">
      <div className="page-inner">
        <h1>{t.area.more}</h1>
        <div className="stack" style={{ gap: 4 }}>
          {AREAS.filter(a => !BOTTOM.includes(a.id)).map(a => (
            <button key={a.id} className="nav-item" onClick={() => go(a.id)}>
              {a.icon}
              <span className="label">{t.area[a.id]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A place in the app the launcher asks for (Android shortcut, `studium --open`). */
export interface OpenRequest {
  target: string;
  key: number;
}

export function Shell(props: { startArea?: Area; openRequest?: OpenRequest }) {
  const { startArea = "today", openRequest } = props;
  const [area, setArea] = useState<Area>(startArea);
  const study = useStudy();
  const courses = useCourses();
  const [studyRequest, setStudyRequest] = useState<StudyRequest | undefined>();
  const openStudy = (r: Omit<StudyRequest, "key">) => {
    setStudyRequest({ ...r, key: Date.now() });
    setArea("study");
  };
  const [search, setSearch] = useState<SearchState>({ text: "", area: "", since: "any" });
  const [searchKey, setSearchKey] = useState(0);
  const go = (a: Area) => {
    setStudyRequest(a === "study" ? { key: Date.now() } : undefined);
    setArea(a);
  };

  // Android back: first whatever is open (ui/useBack), then back to Today, then leave the app.
  const { platform, notes } = useApp();
  const areaRef = useRef(area);
  areaRef.current = area;
  // The area last opened from More: back goes to More, not Today.
  const fromMore = useRef<Area | null>(null);
  const goFromMore = (a: Area) => {
    go(a);
    fromMore.current = a;
  };
  useEffect(
    () =>
      platform.onBackButton?.(() => {
        if (goBack()) return;
        if (fromMore.current && fromMore.current === areaRef.current) {
          fromMore.current = null;
          go("more");
        } else if (areaRef.current !== "today") go("today");
        else void platform.leaveApp?.();
      }),
    [platform],
  );

  // Ctrl+F: search; Ctrl+O / Ctrl+P: open by title / commands.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // Ctrl+F in a note finds in that note (the editor takes it first); Ctrl+Shift+F always searches everything.
      if (k === "f" && (e.shiftKey || !e.defaultPrevented)) {
        e.preventDefault();
        setArea("search");
        setSearchKey(k => k + 1);
      } else if ((k === "o" || k === "p") && !e.shiftKey) {
        e.preventDefault();
        setSwitcher(k === "o" ? "open" : "commands");
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // The "Review cards" shortcut may start the app: the review waits until the subjects are read.
  const [pendingReview, setPendingReview] = useState(false);
  useEffect(() => {
    if (!openRequest) return;
    const [kind, ...rest] = openRequest.target.split(":");
    const arg = rest.join(":");
    if (kind === "area" && AREAS.some(a => a.id === arg)) go(arg as Area);
    else if (kind === "review") setPendingReview(true);
  }, [openRequest]);
  useEffect(() => {
    if (!pendingReview || !study.length) return;
    setPendingReview(false);
    openStudy({ review: true });
  }, [pendingReview, study]);

  let page: ReactNode;
  switch (area) {
    case "today": {
      const classes = <ClassesToday subjects={study} courses={courses} onOpen={s => openStudy({ path: s.path })} />;
      const cards = (
        <StudyCard
          subjects={study}
          onReview={() => openStudy({ review: true })}
          onContinue={(path, chapter) => openStudy({ path, chapter })}
        />
      );
      page = (
        <div className="page">
          <div className="page-inner stack">
            <h1>{t.area.today}</h1>
            {classes}
            {cards}
            <button className="today-card" onClick={() => go("study")}>
              <GraduationCap size={18} />
              <span>{t.today.openStudy}</span>
            </button>
          </div>
        </div>
      );
      break;
    }
    case "study":
      page = <StudyView subjects={study} request={studyRequest} />;
      break;
    case "settings":
      page = <SettingsView />;
      break;
    case "search":
      page = (
        <SearchView
          state={search}
          setState={setSearch}
          focusKey={searchKey}
          openElsewhere={d => {
            if (d.area !== "study") return false;
            openStudy({ path: d.path });
            return true;
          }}
        />
      );
      break;
    case "trash":
      page = <TrashView />;
      break;
    case "sync":
      page = <SyncView />;
      break;
    case "more":
      page = <More go={goFromMore} />;
      break;
  }

  const inMore = !BOTTOM.includes(area);

  // [[Links]] in every editor, Ctrl+O to open a note by title, Ctrl+P for commands (Obsidian-like).
  const [switcher, setSwitcher] = useState<"open" | "commands" | null>(null);
  const linkLists = { study };
  const openPlace = (p: LinkPlace) => void flushAll().then(() => openStudy({ path: p.path }));
  const links = useAppLinks(linkLists, notes, { open: openPlace });
  const commands: Command[] = [
    { id: "open", label: t.switcher.title, icon: <Search size={16} />, run: () => setSwitcher("open") },
    { id: "search", label: t.search.title, icon: <Search size={16} />, run: () => (setArea("search"), setSearchKey(k => k + 1)) },
    ...AREAS.map(a => ({ id: `go-${a.id}`, label: t.area[a.id], icon: a.icon, run: () => go(a.id) })),
  ];

  return (
    <div className="app">
      <nav className="sidebar" aria-label={t.shell.areas}>
        <div className="brand">STUDIUM</div>
        {AREAS.map(a => (
          <button key={a.id} className={`nav-item${area === a.id ? " active" : ""}`} onClick={() => go(a.id)} title={t.area[a.id]}>
            {a.icon}
            <span className="label">{t.area[a.id]}</span>
          </button>
        ))}
      </nav>
      <main className="main">
        <LinksCtx.Provider value={links}>{page}</LinksCtx.Provider>
      </main>
      {switcher && (
        <QuickSwitcher mode={switcher} places={linkPlaces(linkLists)} commands={commands} onOpen={openPlace} onClose={() => setSwitcher(null)} />
      )}
      <nav className="bottombar" aria-label={t.shell.areas}>
        {BOTTOM.map(id => {
          const a = AREAS.find(x => x.id === id);
          const active = id === "more" ? inMore : area === id;
          return (
            <button key={id} className={`nav-item${active ? " active" : ""}`} onClick={() => go(id)}>
              {a ? a.icon : <Menu size={20} />}
              <span>{t.area[id]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
