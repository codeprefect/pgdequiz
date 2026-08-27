# Quiz Bank — practice engine

A small, self-contained static site for drilling multiple-choice and
select-all-that-apply question banks. No build step or back-end required —
just open `index.html` in a browser or host the folder on any static host.

Currently included course packs live in `courses/` and are loaded by adding
their `<script>` tag to `index.html` (see "Adding another course" below).

## Project layout

```
index.html                // page shell + list of course script tags
engine.js                 // pure quiz logic: pooling, scoring, session builder
progress.js               // localStorage helpers: missed questions, stats, history
app.js                    // UI layer: setup, quiz, results, timers
styles.css                // visual theme and layout
courses/                  // course packs (register themselves with QuizBank)
  _template.js            // template for adding new course files
  pgd707-educational-psychology.js
  pgd709-education-technology.js
```

The separation keeps course data (large question lists) out of the UI and
logic files so you can drop in new course files without changing the engine.

## How to add a course

1. Copy `courses/_template.js` to `courses/your-course-id.js`.
2. Fill `id`, `code`, `title`, `description`, and the `questions` array.
3. Add the course script to `index.html`, e.g.:
   ```html
   <script src="courses/your-course-id.js"></script>
   ```
4. Reload the page.

When multiple courses are present the app shows a course picker; with one it
goes straight to the setup screen.

### Question shape

Each question must follow the template in `_template.js`. Minimal example:

```js
{
  id: 1,
  part: "A",
  type: "single", // or "multi"
  module: "Module 1",
  session: "Session 1: Topic",
  prompt: "Question text",
  options: [{ id: "A", text: "..." }, { id: "B", text: "..." }],
  correct: ["B"]
}
```

## Current features (what the app actually does)

- Two attempts per question: the UI allows a second try; the correct answer is
  revealed only after a correct response or the final (second) failed attempt.
- 40‑second countdown per question; timeouts count as the final failed attempt
  and the app automatically advances to the next question.
- Per‑question attempt hints and themed countdown UI (visible on the quiz
  screen).
- Session-length options: 20, 50, 60, 80, 100. The engine will enforce caps
  and will report the effective session size in the setup footer.
- Smart session builder: when creating a session the engine attempts to
  preserve an 80/20 split between part A (MCQ) and part B (SATA), distribute
  questions across study sessions, and deprioritise recently seen questions to
  improve coverage.
- Shuffle option: toggle whether the session pool is shuffled when created.
- Progress persistence: `localStorage` stores per-course stats (best/last
  score), a set of missed questions, and a lightweight question history used
  to avoid repeating recently seen items.
- The UI shows the active course in the browser tab title.
- Setup screen includes a "Back to courses" breadcrumb; returning to setup
  while a quiz runs is intentionally disabled to avoid accidental progress
  loss.

## Notes and behaviour details

- Answers are persisted to the missed set only when the question is answered
  correctly or after the final failed attempt; first wrong attempts are kept
  in-session to allow a second try.
- All logic in `engine.js` is framework-free and testable independently of the
  UI.
- Everything runs client-side — no telemetry or data leaves your browser.

## Future improvements (short list — pragmatic to futuristic)

- Adaptive scheduling / spaced‑repetition: prioritise items you get wrong more
  often and schedule them with increasing intervals.
- User accounts & sync: optional backend to sync progress across devices.
- CSV / LMS importers: small utilities to convert Moodle/Blackboard/CSV
  exports into course files.
- Item Response Theory (IRT) based scoring and difficulty calibration.
- Rich analytics dashboard: per‑session trends, weak‑topics heatmap, and
  exportable performance reports for instructors.
- AI helpers: generate distractors, paraphrase prompts, or suggest tags and
  session groupings from raw text.
- Offline-first mobile packaging: a tiny PWA to enable study without a
  network and resume syncing when online.

If any of these sound useful I can add a short design doc or implement a low‑
effort starting point (e.g. CSV importer or basic spaced‑repetition queue).

---

If anything in this README looks out of date for your workflow, tell me what
you'd like to see and I will update it.
