# Quiz Bank — practice engine

A small, self-contained website for drilling multiple-choice / select-all-that-apply
question banks. No build step, no server, no dependencies beyond two Google Fonts —
just open `index.html` in a browser, or host the folder anywhere static files work
(GitHub Pages, Netlify, a course LMS "files" section, etc).

Currently loaded: **PGDE 707 — Educational Psychology** (300 questions, ABU Zaria
Distance Learning Centre course material).

## How it's put together

```
index.html            shell: loads the pieces below, in order
engine.js              pure quiz logic (pooling, shuffling, scoring) — no DOM, no content
progress.js            localStorage wrapper (missed questions, best/last score)
app.js                 renders the screens and wires clicks to engine.js — no course content
styles.css             the "exam script" visual theme
courses/
  pgde707-educational-psychology.js   the 300-question data file for this course
  _template.js                        blank copy-me starting point for a new course
```

The split matters: `engine.js` and `app.js` don't know anything about Educational
Psychology specifically. They just read whatever course objects have been
registered. That's what makes it reusable.

## Adding another course

1. Copy `courses/_template.js` to `courses/your-course-id.js`.
2. Fill in `id`, `code`, `title`, `description`, and the `questions` array
   (schema is documented in the template).
3. Add one line to `index.html`, next to the existing course script tag:
   ```html
   <script src="courses/your-course-id.js"></script>
   ```
4. Reload the page.

If more than one course is registered, the site opens with a course picker.
With just one, it skips straight to the setup screen.

### Converting a question bank you already have (e.g. from a Word doc / PDF)

The shape each question needs is:

```js
{
  id: 1,               // unique within the course
  part: "A",           // any short label — used as a filter chip
  type: "single",       // "single" (1 correct answer) or "multi" (2+)
  module: "Module 1",   // coarse grouping (filter chip)
  session: "Session 1a: Topic name", // finer grouping, shown as context
  prompt: "The question text",
  options: [{ id: "A", text: "..." }, { id: "B", text: "..." }, ...],
  correct: ["B"]         // one or more option ids
}
```

If your source is plain text with a predictable pattern (numbered questions,
lettered options, an answer key at the end — like the PGDE 707 material was),
the fastest path is a short script: read the text, regex out question numbers,
option letters and answer-key pairs, and emit this JSON shape. That's how the
included course pack was generated.

## Features

- Filter by module and by question format before starting a session.
- Choose session length (10 / 20 / 50 / all) and whether to shuffle.
- Two feedback modes: instant (see the answer after each question) or exam
  style (answers revealed only at the end).
- Results screen with a score breakdown by module and a review list of every
  question missed.
- Progress persists in the browser (localStorage): your best/last score per
  course, and a running set of "missed" questions you can retry in one tap —
  independent of whatever filters you used originally.
- Single-select questions render as radio-style options; select-all-that-apply
  questions render as checkboxes and require every correct option (and no
  incorrect ones) to count as correct.

## Notes

- Everything runs client-side; nothing is sent anywhere.
- Progress is stored per-browser (via `localStorage`), keyed by course `id`.
  Clearing site data resets it.
- No frameworks — it's ~500 lines of vanilla JS across engine/progress/app,
  intentionally kept simple so it's easy to extend.
