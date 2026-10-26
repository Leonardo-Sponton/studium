# Architecture

Studium is the Study area of [Polaris](https://github.com/Leonardo-Sponton/polaris), taken out
into an app of its own. The code was not rewritten: the Polaris tree was copied and everything
that was not study was removed, so the editor, the screens and the file format behave as they
did inside Polaris.

## Layout

```
src/
├── main.tsx            picks the platform (Electron, Android, or an in-memory folder for `npm run dev`)
├── platform/           Electron bridge, Android plugin bridge, in-memory test platform
├── storage/            the Storage interface every platform implements
├── data/               plain TypeScript, no React: files, frontmatter, study, school, cards (SM-2),
│                       guides, search, trash, backup, sync, settings, appearance, drawings,
│                       organize (rename/move/duplicate/pin from the tree, [[link]] rewriting),
│                       notebook (numbered notes as chapters, folder import, today's picks),
│                       recall (sections, review points, whole-note review) — see docs/LEARNING.md,
│                       gitstatus (parses git status/log for a workbench project's local folder)
├── editor/             CodeMirror 6: live preview, [[links]], tables, "/" menu, render (KaTeX, Mermaid)
├── i18n/               en and pt-BR dictionaries (pt must have every key en has; tests check it)
└── ui/
    ├── Shell.tsx       areas: Today, Study, Search, Trash, Sync, Settings (bottom bar on phones)
    ├── App.tsx         boot, settings, toasts, delete confirmation, drawing editor
    ├── shortcuts.ts    every app shortcut in one table (the Shell listens, menus and F1 show them)
    ├── history.ts      back/forward through the session
    └── study/          the study screens: Personal study and School are areas of their own, each
                        opening on a home (Homes.tsx); tree, subject page, reader, notes, cards,
                        school, workbench
electron/               main process (window, file API limited to the data folder, PDF export, adb sync,
                        read-only git status of linked workbench folders)
android/                Capacitor project; StudiumFilesPlugin.java gives file access and the "Review" shortcut
tools/                  sample data, icons, license notices, Excalidraw fonts
```

## What changed from Polaris

- **Removed areas:** to-do, inbox and quick capture, ideas, projects, books, journal, review,
  thoughts and general notes, with their data modules, tests, i18n sections, Android widgets,
  reminders (desktop tray and Android notifications) and the `--capture` window.
- **Removed:** the local AI flashcards (node-llama-cpp). Cards are written by hand in notes.
- **Moved:** `webLink` (from the books module) to `data/weblink.ts`; the note title helper the
  study module took from the inbox module now lives in `data/study.ts`.
- **New Shell:** Today shows the two study cards Polaris had on its Today (today's classes and
  the review/continue card). The rest of the Study screens are unchanged.
- **Trash:** a trashed folder takes its title from `subject.md`, `assignment.md` or
  `project.md` (Polaris looked for `book.md`).
- **Names:** app id `io.github.leonardo_sponton.studium`, data folder `~/Studium` and
  `Documents/Studium`, app folder `.studium/`, browser storage keys `studium.*`, environment
  variables `STUDIUM_*`, Electron bridge `window.studium`, Android plugin `StudiumFiles`.
- **Android shortcut:** "Review cards" (hold the app icon) opens the flashcard review; it waits
  until the subjects are read, so it also works when it starts the app.

The study files themselves (`study/…`) keep the Polaris format, so a Polaris `study/` folder
can be copied into a Studium folder.

## Workbench and local folders (PC)

A workbench project can be linked to its folder on the PC (`ui/study/RepoBox.tsx`). The project
gets a random `repo_id` in `project.md`; the folder's path is kept only in this PC's
`config.json` (`repos: { id: path }`), so each computer links its own copy and the phone shows
nothing. The main process picks the folder with its own dialog (the page never sends a path),
keeps the repository's top folder, and only reads there, with `GIT_OPTIONAL_LOCKS=0`:
`git status --porcelain=v2 --branch -z`, `git for-each-ref` (branches here and on the remote),
`git ls-files` (the file tree) and `git log`, 50 commits per call (`repo:log`, more load while
the history list is scrolled; a branch name is checked before it reaches git). Clicking a file
shows it next to the tree (`repo:readFile`: up to 512 KB of text, pictures up to 5 MB, nothing
outside the folder or inside `.git`); the text is colored by its file name with the editor's
language list (`highlightFile` in `editor/toHtml.ts`), Markdown drawn like a note.
"Open terminal here" starts `$TERMINAL` or the first known terminal found on `PATH`, in that folder.

## Test helpers (desktop)

`STUDIUM_SHOT=out.png` saves a screenshot and quits; `STUDIUM_SHOT_JS` runs a script in the page
first, `STUDIUM_SHOT_ZOOM` sets the page zoom, `STUDIUM_CONFIG_DIR` uses another config folder
(so a test runs beside the installed app), `STUDIUM_PDF_OUT` saves PDF exports without asking.
