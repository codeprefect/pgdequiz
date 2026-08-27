/**
 * _template.js
 * ------------
 * Copy this file to build a new course pack. Rename it (e.g.
 * "phil101-logic.js"), fill in the details below, then add
 *   <script src="courses/phil101-logic.js"></script>
 * to index.html, just above <script src="app.js"></script>.
 *
 * You do NOT need to touch engine.js, progress.js or app.js — they read
 * whatever courses are registered here.
 */
QuizBank.registerCourse({
  // Unique, url-safe id. Used as the key for saved progress, so keep it
  // stable once you start practicing with it.
  id: "template-course",

  // Short course code, shown as a label (e.g. "PGDE 707").
  code: "COURSE 000",

  // Full course title.
  title: "Course Title Goes Here",

  // Optional: where the material comes from.
  institution: "",

  // One or two sentences shown on the setup screen.
  description: "Describe what this question bank covers.",

  // The question bank itself. Each question needs:
  //   id       — unique number (or string) within this course
  //   part     — free-form label, e.g. "A" / "B" (used for the format filter)
  //   type     — "single" (exactly one correct option) or "multi" (2+)
  //   module   — top-level grouping, shown as a filter chip
  //   session  — finer-grained grouping, shown next to the question
  //   prompt   — the question text
  //   options  — array of {id, text}; ids are typically "A","B","C"...
  //   correct  — array of option ids that are correct
  //              (length 1 for "single", 2+ for "multi")
  questions: [
    {
      id: 1,
      part: "A",
      type: "single",
      module: "Module 1",
      session: "Session 1: Example topic",
      prompt: "This is an example question — replace me.",
      options: [
        { id: "A", text: "First option" },
        { id: "B", text: "Second option (correct)" },
        { id: "C", text: "Third option" },
        { id: "D", text: "Fourth option" },
      ],
      correct: ["B"],
    },

    // ...more questions
  ],
});
