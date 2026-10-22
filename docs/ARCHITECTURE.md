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
│                       guides, search, trash, backup, sync, settings, appearance, drawings
├── editor/             CodeMirror 6: live preview, [[links]], tables, "/" menu, render (KaTeX, Mermaid)
├── i18n/               en and pt-BR dictionaries (pt must have every key en has; tests check it)
└── ui/
    ├── Shell.tsx       areas: Today, Study, Search, Trash, Sync, Settings (bottom bar on phones)
    ├── App.tsx         boot, settings, toasts, delete confirmation, drawing editor
    └── study/          the study screens (tree, subject page, reader, notes, cards, school, workbench)
electron/               main process (window, file API limited to the data folder, PDF export, adb sync)
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

## Test helpers (desktop)

`STUDIUM_SHOT=out.png` saves a screenshot and quits; `STUDIUM_SHOT_JS` runs a script in the page
first, `STUDIUM_SHOT_ZOOM` sets the page zoom, `STUDIUM_CONFIG_DIR` uses another config folder
(so a test runs beside the installed app), `STUDIUM_PDF_OUT` saves PDF exports without asking.
