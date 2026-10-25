# Studying with Studium (learning notes)

Why the Personal study area works the way it does, and what each part does. Written in October
2026, after reading how one person actually studies (an Obsidian vault of long numbered notes that
follow a book, a `_meuResumo.md` in their own words, empty files for topics still to study, a
practice repository) and what the research on learning says.

## What the research says, in short

- **Retrieval practice** (trying to recall before looking) and **spacing** (coming back days later)
  are the two techniques with the strongest evidence (Dunlosky et al., 2013, *Psychological Science
  in the Public Interest*). **Self-explanation** and **interleaving** are useful too.
- **Rereading, highlighting and summarizing by copying** are rated low: they feel like learning
  ("illusion of fluency") without much of it.
- **Guessing before reading helps even when the guess is wrong** (pretesting / errorful generation).
- **Effort that feels hard often teaches more**, and people judge their own learning badly (Bjork's
  desirable difficulties). So feedback should inform, not score.
- **Streaks, counters and "you are behind" pressure** tend to replace the reason for studying with
  the reason for keeping the counter (mostly qualitative evidence, but consistent).

So Studium keeps where you stopped, never how much is left, and puts recall where the text
already is instead of asking for flashcards to be written first. Flashcards stay, quietly.

## Ready-made material and your own version

Two layers per subject, kept apart on purpose:

| | Ready-made material | My notebook |
| --- | --- | --- |
| What | A handout, a book, a course you study from | Your own version: your words, the examples you needed |
| Where | `materials/<name>.md` (headings are chapters) | the subject's notes whose title starts with a number |
| Order | its headings | the number (`00.`, `01.` … `15.`) |
| Where I stopped | `at:` in the material's header | `notebook_at:` in `subject.md` |

A note written from a material chapter keeps `material:` and `chapter:`, so the two layers point at
each other. "In my own words" (the body of `subject.md`) is the short explanation of the whole
subject (Feynman).

## The parts

**Bring a folder** (subject page → My notebook). A folder is copied, never changed:

- *My notes*: each `.md` becomes a note, keeping its file name as the title (so `08. Transações em
  JDBC` stays chapter 8). Sub-folders become sub-subjects. A `_…resumo.md` / `_…summary.md` becomes
  "In my own words" when that is empty. Pictures and PDFs go to `attachments/`, Excalidraw
  drawings to `drawings/`, so `![[…]]` embeds keep working. A title already in the subject is
  skipped, so bringing the folder again only adds what is new.
- *A ready-made material*: the files, in name order, become one material with a chapter per file
  (their own headings go one level down).

**A subject that only holds others** (Java with `00. Básico`, `01. OOP`…; Programação is the
group above it) needs no new kind of folder: when a subject has sub-subjects and no notes,
materials, PDFs, links or projects of its own, its page is an index of them (today's suggestions
for all of them, its "In my own words" if written, the sub-subjects). Adding a note or a material
makes it a normal subject page again. So *Banco de dados*, whose first part is already studied
directly, simply stays a normal page with its sub-subjects listed in the overview.

**Finished or not.** Each notebook row has a circle: click it when a chapter is done
(`finished: true` in the note's header). The note's top bar has the same as "Done". An empty chapter
says "to write"; a finished one is ticked and greyed. "Continue" skips a finished chapter, and
"still to write" is the next one not finished.

**Menus.** Right-click (hold on the phone, or the `⋯` at the end of the row) on a notebook row or a
note card in *Notes* opens the same menu as the note in the tree: Open, Try to recall, Mark as
finished, Rename, Move, Duplicate, Pin, Copy link, Delete.

**Try to recall** (the "Try to recall" button in a note's top bar, or a row's menu). On top it says
where the headings come from (your note's `##` headings) with an "Edit the note" button. The note shows only its headings.
For each, explain it in your head or in the box (not saved), then show the text. At the end, "how
did it go?" (Forgot a lot / Partly / Remembered) only sets when the whole note comes back:
`review: "<due> <interval days> <ease %>"` in its header, 1, 3 or 5 days the first time, then
growing like a card. No score is shown.

**Review points.** The callouts a note already has become things to look at again, each hidden
behind its label and section until shown: quotes starting with *Atenção / Ponto de Atenção /
Cuidado*, *Conceito*, *Importante*, *Obs. / Observação*, *Resumindo / Resumo*, *Dica*; paragraphs
starting with `**Importante:**` or `Obs.`; "Resumindo" headings and tables; Obsidian callouts
(`> [!warning]`, `> [!important]`, …). Write `> **Dificuldade**` or `> [!dificuldade]` where
something was hard to understand: those come first. Code blocks are never read.

The easy way to write one: type `/` in a note and pick **Review point: …** (`/ponto`, `/dif`,
`/atenção` find them). It writes an Obsidian callout with the right type and the caret inside:
`> [!difficulty] Dificuldade`, `[!warning] Atenção`, `[!important]`, `[!concept]`, `[!summary]`,
`[!tip]`, `[!note]`. Obsidian shows them as callouts too.

**For today.** At most three suggestions, never a count: where reading stopped (a material chapter
or a notebook chapter, whichever was opened last), one note to try to recall (one whose day came,
else one written 3–60 days ago and never reviewed, a different one each day, hard ones first) and
the next notebook chapter not finished ("still to write"). Flashcards due show as one quiet line,
"N flashcards to review, whenever you like".

## Not done (ideas from the same review)

Code from a note as an exercise (lines to put in order, a gap to fill), an "experiment" block
(command → expected → happened → learned), linking a workbench project to a local repository,
mixed review across subjects, unlinked mentions, a short "what stayed from today" when closing a
note, and the FSRS scheduler for cards.
