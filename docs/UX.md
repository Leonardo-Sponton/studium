# Navigation and organizing (UX notes)

How Studium gets you to a note and lets you organize study material, why it works this way, and
what is still missing. Written after the October 2026 UX review.

## Rules for every change

The app is for studying, not for learning the app. Before adding or changing anything:

1. **Simple first.** One obvious way to do a thing. A feature that needs explaining, or that the
   user would not use, is not added. Fewer, clearer screens beat more options.
2. **Every item has its menu.** Anything shown as a row or a card (subject, note, notebook
   chapter, material, group) opens the same `ContextMenu` on right-click, on hold (touch), with the
   `⋯` button and with Shift+F10. The same item gets the same menu wherever it shows.
3. **Say where things come from.** A screen built from the user's data says from what, and how to
   change it ("the headings below are your note's — Edit the note"), with the button right there.
4. **Words, not only icons.** A new or uncommon action has a label (an icon alone only for the
   well known: back, pin, delete, more). Every icon button has a `title` and an `aria-label`.
5. **Shortcuts and `/`.** Frequent actions have a key (in `ui/shortcuts.ts`, so the palette and F1
   list it) or a `/` item in the editor. Nothing announces a key that does not work.
6. **No pressure.** No percentages, no "2/6", no streaks, no due counts on badges; at most three
   suggestions, each optional.
7. **Nothing to configure when it can be inferred.** A subject with only sub-subjects becomes an
   index by itself; numbered notes become the notebook; callouts become review points.
8. **Reversible.** Undo after rename, move, delete and review; Esc cancels; data stays plain
   Markdown that Obsidian opens.
9. **Checked before it ships.** Typecheck, tests, build, and the screen itself driven headless on a
   wide window and at phone width (390 px); the right-click and the keyboard tried, not assumed.
10. **Accessible.** Roles, names and focus as in the Accessibility section below; reduced motion.

## What the review found

| Problem | Where | Effect |
| --- | --- | --- |
| A note was 4–5 steps away: Personal → group card → subject card → scroll to Notes → note. | Personal home (cards view, the default) | Every visit rebuilt the same path. |
| Opening something hid the tree (the "focus" layout of the cards view); back went up one level at a time. | `StudyView` | No way to jump sideways (JDBC → transactions note) without climbing back up. |
| The tree sorted subjects by "last studied". | `SubjectTree` | Rows moved while you edited, so the place you were looking at changed under you. |
| No keyboard in the tree; right-click only on subjects, and it opened a modal dialog. Groups and notes had no actions. | `SubjectTree`, `StudyView` | Rename, move or duplicate a note meant opening it and editing the heading or the files by hand. |
| No back/forward, no favorites, recent files only inside Ctrl+O. | — | Returning to the previous note needed the whole path again. |
| The command palette (Ctrl+P) only listed the areas; shortcuts were scattered (Shell, editor) with no list. | `Shell` | Features hard to discover; nothing told you a shortcut existed. |
| Search results said "Study" for everything. | `SearchView` | You could not tell which subject a hit came from. |
| Moving the last subject out of a group made the group vanish. | groups | A "folder" disappeared when emptied. |
| The code editor had no accessible name; the context menu took no arrow keys; no reduced-motion rule. | editor, `ContextMenu`, CSS | Screen readers announced an unnamed text box; keyboard users could not use the menu. |
| `index.html` in the repo had been overwritten by the built one. | repo | `npm run build` failed. Restored from git. |

## What changed

**One side panel that stays.** In Personal study the panel (`ui/study/Explorer.tsx`) sits beside the
home *and* whatever is open, on any screen 720 px or wider: back/forward, New note, New subject,
Collapse all, then **Pinned**, **Recent** (last five) and the **tree**. Ctrl+Shift+E (or its button)
folds it to a thin rail; the choice is remembered on the device. Phones keep the home with the tree
in the list view (there is no room for a panel), and back works as before.

**Groups and subjects are the folders.** No new taxonomy and no files moved: a group is the top
level, a subject can hold sub-subjects (`parent:`), and inside a subject are its materials, PDFs,
notes, links and workbench projects. Everything is A–Z, so rows stay put. Opening an item opens the
branches down to it. Nothing is created for you; empty groups can still be made (palette → New group)
and stay when emptied.

**Actions where the item is.** Right-click, hold (touch), the `⋯` button on the row, Shift+F10 or the
Menu key open the same menu (`ContextMenu`, keyboard ↑ ↓ Home End, a letter jumps, Esc closes,
focus returns to the row):

| Item | Actions |
| --- | --- |
| Group | New subject in this group · Rename · Remove group (subjects stay, with no group) |
| Subject | New note here · New subject inside · Rename · Move to… · Pin · Copy link `[[…]]` · Delete |
| Note | Rename · Move to… · Duplicate · Pin · Copy link `[[…]]` · Delete |
| Material | Rename · Pin · Copy link · Delete |

- **Rename** happens in the row (F2, Enter keeps, Esc cancels). Outside the tree (F2 with a note open,
  the palette) a small dialog asks. `[[links]]` to the old title are rewritten in every study file,
  unless something else still has that title. Undo puts back the name and the links.
- **Move** opens a filtered list (type to narrow, the current place is marked "here now"). Notes can
  also be dragged onto a subject, subjects onto a group or another subject (never into themselves).
  A moved note drops the material/chapter/PDF it was about (they belong to the old subject). Undo.
- **Delete** asks once (it goes to the trash) and offers Undo. Delete only acts in the tree, so it
  can never erase a note while typing.
- **Pins** are kept in `study/_pinned.md`, so they travel with the data folder and the sync.

**Where am I, and back.** A note's top bar shows `group › parent › subject`, each part a link
(hidden on phones, and on medium windows where the panel already shows it). Back and forward
(`ui/history.ts`) remember the areas and the items opened in this session: Ctrl+Alt+← / →, the
mouse side buttons or the arrows on the panel. Going back from Search to the note you came from
works too.

**New notes land in the right place.** Ctrl+N (or "New note") makes the note in the subject that is
open; with none open it asks which subject, listing personal ones first with their group. Ctrl+O's
"Create note …" does the same with the typed title.

**Code.** A code block shows its language and a **Copy** button (the code exactly as written,
indentation and tabs included) while the caret is outside it.

**Hub or study folder.** Every personal subject is one of two types, picked in New subject
(`kind: hub | study` in `subject.md`). The type never changes afterwards: a hub stays a hub, a study
folder stays one; to switch, delete it and make a new one. The settings only show which it is.
- **Study folder**: the full page (Overview with My notebook and "in my own words", Flashcards,
  Notes, Materials, Workbench). All study folders look the same, even with sub-subjects.
- **Hub**: only gathers subjects (Java → JDBC, Collections). Its page is today's picks from the
  subjects inside and the subjects as cards, with a quick search (names, the subjects inside them and
  their notes' titles; a card found through something inside says what), filter chips (In progress,
  To review, Still empty, Hubs: each shown only when it splits the list) and an order (Name, Studied
  last, Most notes; remembered on the device). No "in my own words" here. Notes that end up in a hub
  are still listed, so nothing hides.
Subjects made before the choice existed keep the old guess (a hub when they hold sub-subjects and
nothing of their own) until the type is chosen once in their settings ("Make it a …").

**Covers.** A hub or a study folder can have its own cover (settings → Cover: add, change, remove),
kept as `cover.jpg` in its folder and made small on the way in, like group covers. The banner shows
the subject's own cover, else the nearest one above it (JDBC shows the Java hub's), else its group's.
**Adjust cover** (opens by itself right after a picture is picked; also a button next to Change cover,
on a group's page and in a subject's settings): drag the picture to choose the part that shows, zoom
with the slider or the mouse wheel (arrow keys and +/- work too), with a preview cropped like the real
banner and one like the card. Saved as `cover_frame: "x y zoom"` in the subject's header, or under
`frames:` in `study/_groups.md` for a group; a new picture starts centered.
Subject cards (in a hub, a study folder and a group page) show the picture when there is one.

**Note tags.** A note's card says where it belongs: **Notebook** (a numbered chapter, "00. …"),
**Material**, **PDF**, or **Standalone** (tied to nothing). The Notes filter has a My notebook chip.

## Shortcuts

One table (`ui/shortcuts.ts`) feeds the listener in the Shell, the palette, the menus and the F1
list, so nothing announces a key that does not work. Ctrl is ⌘ on a Mac.

| Keys | Action |
| --- | --- |
| Ctrl+P | Command palette (every action, with its keys) |
| Ctrl+O | Open a note by its name (recent first; "Create note …") |
| Ctrl+Shift+F (Ctrl+F outside a note) | Search everything |
| Ctrl+N / Ctrl+Shift+N | New note / new subject |
| F2 | Rename the open item (in the tree: the focused row) |
| Ctrl+Alt+← / → | Back / forward |
| Ctrl+Shift+E | Show or hide the side panel |
| Ctrl+1 / 2 / 3 | Today / Personal study / School |
| F1 | The list of shortcuts |

Tree: ↑ ↓ move, → opens or goes in, ← closes or goes up, Home/End, Enter opens, F2, Delete,
Shift+F10. Editor keys (Ctrl+B, Ctrl+K link, Ctrl+F find…) are unchanged.

**Why not Ctrl+K for the palette:** Ctrl+K already makes a link in the editor (as in Obsidian), and
taking it elsewhere would make the same key do two things. Ctrl+P is Obsidian's and VS Code's palette.
**Why Ctrl+Alt+← and not Alt+←:** in the editor Alt+← moves by syntax units (CodeMirror), so back
would only work outside the text. Ctrl+Alt+← is Obsidian's and works everywhere.
App shortcuts do nothing while a dialog is open.

## Heuristics applied (Nielsen)

1. **Visibility of system status:** the note bar says Saved / Saving / Unsaved / Error; every rename,
   move, pin and delete answers with a short message; the open item is highlighted in the tree and
   its branch opens.
2. **Match with the real world:** groups and subjects behave like folders (right-click, drag, rename
   in place), with the words the app already used.
3. **User control and freedom:** Undo after rename, move and delete; Esc cancels renaming and closes
   menus; back/forward.
4. **Consistency:** the same menu for a row, a subject card and a school subject; the same shortcuts
   shown in menus, palette and F1; Ctrl+O/P as in Obsidian.
5. **Error prevention:** subjects cannot move into themselves; Delete asks and only works in the
   tree; renaming to the same name does nothing; links are not rewritten when another item has the
   old title.
6. **Recognition rather than recall:** breadcrumbs, recent and pinned lists, "here now" in Move,
   search results with their subject, shortcuts printed next to actions.
7. **Flexibility and efficiency:** keyboard for everything frequent; drag for the mouse; hold on touch.
8. **Minimalist design:** one-line rows, the `⋯` button only on hover, focus or the open row; no new
   cards or dashboards; the panel can be hidden.
9. **Help users recover from errors:** failures show the reason in a toast; Undo where the change
   can be reversed.
10. **Help and documentation:** F1, the palette, this file.

## Accessibility (WCAG 2.2 AA as the reference)

Checked: the tree is a WAI-ARIA tree (roles, `aria-level`, `aria-expanded`, `aria-selected`, roving
focus); menus have `role=menu`/`menuitem` and keyboard; the pick list is a listbox with
`aria-activedescendant`; focus is visible on every new control and returns where it was; the editor
has a name; `prefers-reduced-motion` turns animations off; rows are 44 px tall on touch screens.
Contrast of the new colors measured on the default theme: muted text 4.77:1 on the panel, 4.66:1 on
the page; the one pair under 4.5:1 (muted on the selection color, 3.93:1) was changed.
axe-core 4.10 (WCAG 2.0/2.1/2.2 A+AA + best practices) reported no violations on the Personal home
with the panel, an open note, the context menu and the palette.

Not verified: a real screen reader (Orca/TalkBack) pass; the light theme and the other palettes
were not measured one by one (they use the same tokens); 200% zoom was only tried as a narrow
window.

## Limits and next steps

- School keeps its own list (course → semester → subjects) instead of the side panel.
- Materials cannot be moved to another subject (notes point at them by file name); exercises,
  PDFs and workbench projects open from the tree but have no menu of their own yet.
- Renaming a group has no Undo (it rewrites every subject in it); it can be renamed back.
- Back/forward is per session, not saved.
- Dragging works with a mouse; on touch, use hold → Move to….
