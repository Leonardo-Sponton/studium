import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, FilePlus, FolderInput, FolderPlus, GraduationCap, Keyboard, Layers, Library, Menu, PanelLeft, Pencil, Pin, Search, Settings as SettingsIcon, Sun, Trash2, Usb } from "lucide-react";
import { StudyCard } from "./study/CardReview";
import { sectionOf, StudyView, useCourses, useStudy, type Section, type StudyApi, type StudyRequest } from "./study/StudyView";
import { studyItem } from "./study/Explorer";
import { History } from "./history";
import { shortcutLabel, shortcutOf } from "./shortcuts";
import { ShortcutsHelp } from "./ShortcutsHelp";
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

// Personal study and School are areas of their own (one Study screen each, ui/study/StudyView).
export type Area = "today" | "personal" | "school" | "search" | "trash" | "sync" | "settings" | "more";

const AREAS: { id: Area; icon: ReactNode }[] = [
  { id: "today", icon: <Sun size={20} /> },
  { id: "personal", icon: <Library size={20} /> },
  { id: "school", icon: <GraduationCap size={20} /> },
  { id: "search", icon: <Search size={20} /> },
  { id: "trash", icon: <Trash2 size={20} /> },
  { id: "sync", icon: <Usb size={20} /> },
  { id: "settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar; the rest lives under More.
const BOTTOM: Area[] = ["today", "personal", "school", "search", "more"];

/** Shorter names for the phone's bottom bar. */
const barLabel = (id: Area | "more") => (id === "personal" ? t.study.personal : t.area[id]);

const isStudyArea = (a: Area): a is Section => a === "personal" || a === "school";

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
  /** Opens a study path (or the review) in the area it belongs to. */
  const openStudy = (r: Omit<StudyRequest, "key">) => {
    setStudyRequest({ ...r, key: Date.now() });
    setArea(r.path ? sectionOf(study, r.path) : isStudyArea(areaRef.current) ? areaRef.current : "personal");
  };
  const [search, setSearch] = useState<SearchState>({ text: "", area: "", since: "any" });
  const [searchKey, setSearchKey] = useState(0);
  const go = (a: Area) => {
    // A study area opens on its home.
    setStudyRequest(isStudyArea(a) ? { key: Date.now() } : undefined);
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

  // The "Review cards" shortcut may start the app: the review waits until the subjects are read.
  const [pendingReview, setPendingReview] = useState(false);
  useEffect(() => {
    if (!openRequest) return;
    const [kind, ...rest] = openRequest.target.split(":");
    const arg = rest.join(":");
    // "area:study" from before the split opens Personal study.
    if (kind === "area" && arg === "study") go("personal");
    else if (kind === "area" && AREAS.some(a => a.id === arg)) go(arg as Area);
    else if (kind === "review") setPendingReview(true);
  }, [openRequest]);
  useEffect(() => {
    if (!pendingReview || !study.length) return;
    setPendingReview(false);
    openStudy({ review: true });
  }, [pendingReview, study]);

  // ---- Back and forward (ui/history): the areas and the study items opened in this session ----
  const history = useRef(new History()).current;
  const [, setNavTick] = useState(0);
  const visit = (a: Area, path: string) => {
    history.visit({ area: a, path });
    setNavTick(n => n + 1);
  };
  useEffect(() => {
    if (!isStudyArea(area)) visit(area, "");
  }, [area]);
  const travel = (to: { area: string; path: string } | null) => {
    setNavTick(n => n + 1);
    if (!to) return;
    const a = to.area as Area;
    if (isStudyArea(a)) setStudyRequest(to.path ? { path: to.path, key: Date.now() } : { key: Date.now() });
    setArea(a);
  };
  const nav = {
    canBack: history.canBack,
    canForward: history.canForward,
    back: () => travel(history.back()),
    forward: () => travel(history.forward()),
  };
  const navRef = useRef(nav);
  navRef.current = nav;

  // ---- What the study area can do for the palette and shortcuts (StudyView fills it) ----
  const studyApi = useRef<StudyApi | null>(null);
  /** An action that needs Personal study, run once it is on screen. */
  const pendingStudy = useRef<((api: StudyApi) => void) | null>(null);
  const withStudy = (f: (api: StudyApi) => void) => {
    if (isStudyArea(areaRef.current) && studyApi.current) return f(studyApi.current);
    pendingStudy.current = f;
    go("personal");
  };
  useEffect(() => {
    if (pendingStudy.current && studyApi.current) {
      const f = pendingStudy.current;
      pendingStudy.current = null;
      f(studyApi.current);
    }
  });

  const [help, setHelp] = useState(false);
  const openSearch = () => {
    setArea("search");
    setSearchKey(k => k + 1);
  };

  // Every app shortcut (ui/shortcuts.ts) in one listener. The editor and the tree take their
  // own keys first; nothing here fires while a dialog is open.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (document.querySelector(".dialog-backdrop")) return;
    // Ctrl+F in a note finds in that note (the editor takes it first); elsewhere it searches everything.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f" && !e.defaultPrevented) {
      e.preventDefault();
      return openSearch();
    }
    const id = shortcutOf(e);
    if (!id || e.defaultPrevented) return;
    const api = isStudyArea(areaRef.current) ? studyApi.current : null;
    // F2 renames the open item; with nothing open it is left alone.
    if (id === "rename" && !api?.current()) return;
    e.preventDefault();
    switch (id) {
      case "palette":
        return setSwitcher("commands");
      case "open":
        return setSwitcher("open");
      case "search":
        return openSearch();
      case "newNote":
        return withStudy(a => a.newNote());
      case "newSubject":
        return withStudy(a => a.newSubject());
      case "back":
        return navRef.current.back();
      case "forward":
        return navRef.current.forward();
      case "explorer":
        return withStudy(a => a.toggleExplorer());
      case "rename":
        return api?.rename();
      case "help":
        return setHelp(true);
      case "goToday":
        return go("today");
      case "goPersonal":
        return go("personal");
      case "goSchool":
        return go("school");
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    // The mouse's side buttons go back and forward.
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.button === 3) navRef.current.back();
      else navRef.current.forward();
    };
    addEventListener("keydown", onKey);
    addEventListener("mouseup", onMouse);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("mouseup", onMouse);
    };
  }, []);

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
            <button className="today-card" onClick={() => go("personal")}>
              <Library size={18} />
              <span>{t.today.openPersonal}</span>
            </button>
            <button className="today-card" style={{ marginTop: 0 }} onClick={() => go("school")}>
              <GraduationCap size={18} />
              <span>{t.today.openSchool}</span>
            </button>
          </div>
        </div>
      );
      break;
    }
    case "personal":
    case "school":
      page = (
        <StudyView
          key={area}
          section={area}
          subjects={study}
          request={studyRequest}
          onElsewhere={path => openStudy({ path })}
          nav={nav}
          onPlace={path => visit(area, path)}
          apiRef={studyApi}
        />
      );
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
          whereOf={path => studyItem(study, path)?.where ?? study.find(s => path.startsWith(`${s.dir}/`))?.title}
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
  // The palette: every action of the app with its shortcut. Actions on the open item only show
  // while one is open.
  const current = isStudyArea(area) ? studyApi.current?.current() : null;
  const sc = shortcutLabel;
  const commands: Command[] = [
    { id: "open", label: t.switcher.title, icon: <Search size={16} />, keys: sc("open"), run: () => setSwitcher("open") },
    { id: "search", label: t.search.title, icon: <Search size={16} />, keys: sc("search"), run: openSearch },
    { id: "new-note", label: t.explorer.newNote, icon: <FilePlus size={16} />, keys: sc("newNote"), run: () => withStudy(a => a.newNote()) },
    { id: "new-subject", label: t.explorer.newSubject, icon: <FolderPlus size={16} />, keys: sc("newSubject"), run: () => withStudy(a => a.newSubject()) },
    { id: "new-group", label: t.study.newGroup, icon: <FolderPlus size={16} />, run: () => withStudy(a => a.newGroup()) },
    ...(current
      ? [
          { id: "rename", label: `${t.explorer.rename}: ${current.title}`, icon: <Pencil size={16} />, keys: sc("rename"), run: () => studyApi.current?.rename() },
          { id: "move", label: `${t.explorer.move.replace("…", "")}: ${current.title}`, icon: <FolderInput size={16} />, run: () => studyApi.current?.move() },
          { id: "pin", label: `${t.explorer.pin} / ${t.explorer.unpin}: ${current.title}`, icon: <Pin size={16} />, run: () => studyApi.current?.pin() },
        ]
      : []),
    { id: "review", label: t.study.reviewCards, icon: <Layers size={16} />, run: () => openStudy({ review: true }) },
    { id: "back", label: t.explorer.back, icon: <ArrowLeft size={16} />, keys: sc("back"), run: nav.back },
    { id: "forward", label: t.explorer.forward, icon: <ArrowRight size={16} />, keys: sc("forward"), run: nav.forward },
    { id: "explorer", label: t.shortcuts.names.explorer, icon: <PanelLeft size={16} />, keys: sc("explorer"), run: () => withStudy(a => a.toggleExplorer()) },
    ...AREAS.map(a => ({
      id: `go-${a.id}`,
      label: t.switcher.goTo(t.area[a.id]),
      icon: a.icon,
      keys: a.id === "today" ? sc("goToday") : a.id === "personal" ? sc("goPersonal") : a.id === "school" ? sc("goSchool") : undefined,
      run: () => go(a.id),
    })),
    { id: "help", label: t.shortcuts.title, icon: <Keyboard size={16} />, keys: sc("help"), run: () => setHelp(true) },
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
        <QuickSwitcher
          mode={switcher}
          places={linkPlaces(linkLists)}
          commands={commands}
          onOpen={openPlace}
          onCreate={title => withStudy(a => a.newNote(title))}
          onClose={() => setSwitcher(null)}
        />
      )}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      <nav className="bottombar" aria-label={t.shell.areas}>
        {BOTTOM.map(id => {
          const a = AREAS.find(x => x.id === id);
          const active = id === "more" ? inMore : area === id;
          return (
            <button key={id} className={`nav-item${active ? " active" : ""}`} onClick={() => go(id)}>
              {a ? a.icon : <Menu size={20} />}
              <span>{barLabel(id)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
