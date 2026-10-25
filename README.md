<p align="center"><img src="resources/icon.png" width="96" alt="Studium icon"></p>

<h1 align="center">Studium</h1>

<p align="center"><a href="README.pt-BR.md">🇧🇷 Leia em português</a></p>

<p align="center">
A study notebook for subjects, handouts, PDFs, study notes, flashcards and school courses.<br>
One app for <b>Linux</b> and <b>Android</b>, 100% offline, with your data kept as plain Markdown files.
</p>

> [!NOTE]
> **Studium is a study app in development.** It already works on Linux and Android, but
> screens and file formats may still change. There is no packaged release yet: build it from
> source (see below).

## Why

- **Offline.** No account, no cloud, no tracking. The Android app does not even ask for the
  Internet permission.
- **Your files.** Everything is a Markdown file with a small YAML header in a folder you choose.
  Open it in any editor, back it up by copying the folder, keep it in git if you like.
- **Same app everywhere.** The same React interface runs in Electron on Linux and in Capacitor on
  Android, with a sidebar layout on wide screens and a bottom bar on phones.
- **Sync over a USB cable.** The PC app copies changes to and from the phone over `adb`, file by
  file, and shows conflicts side by side so you pick what to keep.
- **English and Brazilian Portuguese**, following the device language by default.

## Features

| Area | What it does |
| --- | --- |
| **Today** | Today's classes (from the school timetable), flashcards due and the chapter to continue. |
| **Personal study** | Its own area, opening on a home that shows the subjects as an Obsidian-like tree (groups → subjects → sub-subjects) or as group cards with covers; each with "in my own words" (Feynman), materials, PDFs, exercises, links with kinds (docs, video, article…), study notes and a Workbench of practice projects with guides. |
| **Navigation** | A side panel that stays beside what is open: pinned items, recent ones and the tree, where notes and subjects are renamed in place (F2), moved (menu or drag), duplicated, pinned or deleted, with `[[links]]` updated on rename. Back and forward (Ctrl+Alt+← / →, mouse side buttons), a command palette (Ctrl+P) that shows every shortcut, and the full list on F1. See [docs/UX.md](docs/UX.md). |
| **Materials** | Handouts imported from `.md` files or pasted, read chapter by chapter with read marks and "you stopped here". |
| **Study notes** | Notes per material, chapter or PDF, with tags, filters and orders; `[[links]]` between notes, materials and subjects, with backlinks. |
| **Flashcards** | Written inside notes with Obsidian Spaced Repetition marks (`::`, `:::`, `?`, `??`), reviewed with a simplified SM-2 schedule per subject or for everything. |
| **School** | Courses with semesters, school subjects with teacher, room, timetable, classes, assignments with files, exams, weighted grades, the grade still needed and absences against the limit. |
| **Editor** | Obsidian-flavored Markdown with live preview: `[[links]]` and `![[embeds]]`, pasted or dropped pictures, callouts, `$math$` (KaTeX), ```` ```mermaid ```` diagrams, footnotes, `%%comments%%`, tables that line themselves up, a "/" menu, find & replace, outline, templates, properties, Ctrl+O to open any note and Ctrl+P for commands. Export any note to PDF. |
| **Drawings** | [Excalidraw](https://excalidraw.com) drawings inside notes (`/drawing` or `![[name.excalidraw]]`), saved in the Obsidian Excalidraw plugin's format. |
| **Appearance** | Light/dark, color schemes (Studium, Minimal, Catppuccin, Nord, Gruvbox, Atom One), accent color, fonts, text and interface size, line width and your own CSS snippets. |
| **Also** | Global search, trash with undo, zip backup and restore, and an Android "Review cards" shortcut (hold the app icon). |

PDFs open in the device's PDF app (Linux: the default PDF viewer); notes about a PDF live in Studium.

## Your data

```
Studium/
├── study/
│   ├── _courses/          one file per school course
│   ├── _groups.md         order of the personal groups
│   ├── _covers/           cover pictures of the groups
│   └── <subject>/
│       ├── subject.md     title, group, parent; the body is "in my own words"
│       ├── materials/     handouts, read by chapter
│       ├── notes/         study notes (flashcards live here)
│       ├── pdfs/
│       ├── exercises/
│       ├── workbench/     practice projects
│       ├── assignments/   school subjects only
│       ├── exams/
│       └── links.md
├── drawings/              *.excalidraw.md
├── attachments/
├── templates/
├── .trash/
└── .studium/              settings and sync state
```

A study note with two flashcards looks like this:

```markdown
---
type: study-note
material: sql-handout
chapter: 2
cards:
  0s432w2: 2026-10-23 1 250
---
# SELECT and WHERE

Which clause filters rows? :: WHERE
How are text values written in SQL? :: Between single quotes: 'Recife'
```

Unknown header keys are kept as they are, so you can add your own. The file format is the same
as the Study area of [Polaris](https://github.com/Leonardo-Sponton/polaris), the app Studium was
taken from, so a Polaris `study/` folder can be copied into a Studium folder as it is (with
`attachments/` and `drawings/` too when the notes embed pictures or drawings).

## Install and build

You need Node.js 22 or newer.

```sh
git clone https://github.com/Leonardo-Sponton/studium.git
cd studium
npm install
npm test            # unit tests (Vitest)
npm run electron    # run the desktop app
```

If `npm run electron` says Electron failed to install (newer npm versions can skip install
scripts), run `node node_modules/electron/install.js` once.

**Linux package**

```sh
npm run dist                          # release/: AppImage and tar.gz
cd packaging/arch && makepkg -si      # Arch Linux package
```

**Android** (Android 8.0 or newer; needs the Android SDK and JDK 21)

```sh
npm run android                       # build the web part and copy it into android/
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

On first run the Android app asks for "All files access", so it can read the files the PC copies
over the cable into `Documents/Studium`.

**USB sync:** turn on USB debugging on the phone, connect it, then open *Sync* in the PC app.
`adb` is found in `PATH` or in `~/Android/Sdk/platform-tools`.

## Sample data

To see every screen filled in:

```sh
node tools/sample-data.mjs add ~/StudiumDemo             # English
node tools/sample-data.mjs add ~/StudiumDemo --lang pt   # Portuguese
node tools/sample-data.mjs remove ~/StudiumDemo          # removes only the sample files
```

## Stack

TypeScript, React and Vite · CodeMirror 6 editor with live Markdown preview · Electron (Linux) ·
Capacitor with a small Java plugin for file access (Android) · Vitest. How the app was split from
Polaris is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Credits

The editor follows [Obsidian](https://obsidian.md)'s Markdown and borrows ideas, not code, from
these Obsidian plugins: Spaced Repetition (card marks), Advanced Tables and Recent Files (Tony
Grosinger) and Remember cursor position (Dmitry Savosh). Table editing is done by
[md-advanced-tables](https://github.com/tgrosinger/md-advanced-tables) (MIT); math by
[KaTeX](https://katex.org) and diagrams by [Mermaid](https://mermaid.js.org). Drawings use the
[Excalidraw](https://github.com/excalidraw/excalidraw) editor (MIT) and the file format of the
Obsidian Excalidraw plugin (Zsolt Viczián); Appearance follows Obsidian's settings and the Style
Settings plugin (mgmeyers), again ideas only. Color schemes follow
[Catppuccin](https://catppuccin.com), [Nord](https://www.nordtheme.com),
[Gruvbox](https://github.com/morhetz/gruvbox) and Atom One (all MIT). Every bundled library and
its license is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the app
(Settings → Open-source licenses).

## License

[MIT](LICENSE) © Leonardo Sponton.
