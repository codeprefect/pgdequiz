/**
 * engine.js
 * ---------
 * Pure, framework-free quiz logic. Nothing in this file touches the DOM,
 * so it can sit underneath any course (this one, or a future one) and
 * underneath any UI you choose to build on top of it.
 *
 * A "course" object looks like:
 * {
 *   id: "pgde707-edu-psych",
 *   code: "PGDE 707",
 *   title: "Educational Psychology",
 *   institution: "ABU Zaria Distance Learning Centre",
 *   description: "...",
 *   questions: [
 *     {
 *       id: 1,
 *       part: "A" | "B",
 *       type: "single" | "multi",
 *       module: "Module 1",
 *       session: "Study Session 1a: ...",
 *       prompt: "...",
 *       options: [{id:"A", text:"..."}, ...],
 *       correct: ["B"]            // 1 letter for "single", 2+ for "multi"
 *     }, ...
 *   ]
 * }
 *
 * Course packs register themselves by calling QuizBank.registerCourse(course)
 * (see courses/pgde707-educational-psychology.js for a full example, and
 * courses/_template.js for a blank one to copy for a new subject).
 */
(function (global) {
  "use strict";

  const courses = [];

  function registerCourse(course) {
    if (!course || !course.id) throw new Error("Course must have an id");
    if (courses.some((c) => c.id === course.id)) {
      console.warn(`Course "${course.id}" already registered — skipping duplicate.`);
      return;
    }
    courses.push(course);
  }

  function listCourses() {
    return courses.slice();
  }

  function getCourse(id) {
    return courses.find((c) => c.id === id) || null;
  }

  /** Distinct module labels, in first-seen order, for a course. */
  function getModules(course) {
    const seen = [];
    for (const q of course.questions) {
      if (!seen.includes(q.module)) seen.push(q.module);
    }
    return seen;
  }

  /** Distinct sessions within a module, in first-seen order. */
  function getSessions(course, module) {
    const seen = [];
    for (const q of course.questions) {
      if (q.module === module && !seen.includes(q.session)) seen.push(q.session);
    }
    return seen;
  }

  /**
   * Build a question pool from a course given a filter spec:
   * { modules: [..] | null, parts: ["A","B"], onlyIds: [..] | null }
   * `onlyIds`, when given, restricts to those question ids (used for "retry missed").
   */
  function buildPool(course, filter) {
    filter = filter || {};
    const modules = filter.modules && filter.modules.length ? filter.modules : null;
    const parts = filter.parts && filter.parts.length ? filter.parts : ["A", "B"];
    const onlyIds = filter.onlyIds && filter.onlyIds.length ? new Set(filter.onlyIds) : null;

    return course.questions.filter((q) => {
      if (modules && !modules.includes(q.module)) return false;
      if (!parts.includes(q.part)) return false;
      if (onlyIds && !onlyIds.has(q.id)) return false;
      return true;
    });
  }

  /** Fisher-Yates shuffle, returns a new array. */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Score a single answer.
   * `given` is an array of selected option ids (even for single-select, wrap in an array).
   * Returns { correct: boolean, missing: [...], extra: [...] }
   */
  function scoreAnswer(question, given) {
    const correctSet = new Set(question.correct);
    const givenSet = new Set(given);
    const missing = question.correct.filter((c) => !givenSet.has(c));
    const extra = given.filter((g) => !correctSet.has(g));
    return { correct: missing.length === 0 && extra.length === 0, missing, extra };
  }

  /** Build a fresh session object for a pool of questions.
   *  Features:
   *   - target session length (defaults to opts.limit or pool.length)
   *   - distributes selection evenly across the entire question pool (stratified sampling)
   *   - deprioritizes recently seen questions when `opts.recentIds` supplied
   *   - respects `opts.shuffle` for question order
   *   - per-question option order with positional option preservation
   */
  function createSession(pool, opts) {
    opts = opts || {};
    let desired = typeof opts.limit === "number" && opts.limit > 0 ? opts.limit : pool.length;
    desired = Math.min(desired, pool.length);

    if (pool.length === 0 || desired <= 0) {
      return {
        questions: [],
        index: 0,
        answers: {},
        optionOrder: {},
        startedAt: Date.now(),
      };
    }

    // Sort questions by ID to maintain a consistent linear spectrum of the curriculum
    const sorted = pool.slice().sort((a, b) => a.id - b.id);

    // Build recent-rank map (lower = more recent). opts.recentIds expected most-recent-first
    const recentRank = {};
    if (Array.isArray(opts.recentIds)) {
      opts.recentIds.forEach((id, i) => {
        recentRank[String(id)] = i;
      });
    }

    let selected = [];
    if (desired >= sorted.length) {
      selected = sorted.slice();
    } else {
      // Stratified sampling: divide the pool into `desired` equal strata across the question range
      // so questions are evenly distributed from beginning to end (e.g. 1-100, 101-200, ..., 401-500)
      for (let k = 0; k < desired; k++) {
        const start = Math.floor((k * sorted.length) / desired);
        const end = Math.floor(((k + 1) * sorted.length) / desired);
        const segment = sorted.slice(start, end);

        // Within this segment, pick the least recently seen question (highest rank, Infinity = never seen)
        let maxRank = -1;
        let candidates = [];
        for (let idx = 0; idx < segment.length; idx++) {
          const q = segment[idx];
          const rank = recentRank[String(q.id)] !== undefined ? recentRank[String(q.id)] : Infinity;
          if (rank > maxRank) {
            maxRank = rank;
            candidates = [q];
          } else if (rank === maxRank) {
            candidates.push(q);
          }
        }
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        selected.push(chosen);
      }
    }

    const limited = opts.shuffle ? shuffle(selected) : selected;
    // build per-question option order if requested
    const optionOrder = {};
    for (const q of limited) {
      const ids = q.options.map((o) => o.id);
      if (!opts.shuffleOptions) {
        optionOrder[String(q.id)] = ids.slice();
      } else {
        const lastOpt = q.options[q.options.length - 1];
        const isPositional = lastOpt && /^(all|none) of the above/i.test((lastOpt.text || "").trim());
        if (isPositional) {
          const front = ids.slice(0, -1);
          optionOrder[String(q.id)] = shuffle(front).concat(ids.slice(-1));
        } else {
          optionOrder[String(q.id)] = shuffle(ids);
        }
      }
    }
    return {
      questions: limited,
      index: 0,
      answers: {},
      optionOrder,
      startedAt: Date.now(),
    };
  }

  function sessionScore(session) {
    const total = session.questions.length;
    let right = 0;
    const missed = [];
    for (const q of session.questions) {
      const a = session.answers[q.id];
      if (a && a.correct) {
        right++;
      } else if (a) {
        missed.push(q.id);
      }
    }
    const answered = Object.keys(session.answers).length;
    return { total, answered, right, wrong: answered - right, missed };
  }

  /** Break a session's results down by module, for the results screen. */
  function scoreByModule(session) {
    const byModule = {};
    for (const q of session.questions) {
      const a = session.answers[q.id];
      if (!a) continue;
      if (!byModule[q.module]) byModule[q.module] = { right: 0, total: 0 };
      byModule[q.module].total++;
      if (a.correct) byModule[q.module].right++;
    }
    return byModule;
  }

  global.QuizBank = {
    registerCourse,
    listCourses,
    getCourse,
    getModules,
    getSessions,
    buildPool,
    shuffle,
    scoreAnswer,
    createSession,
    sessionScore,
    scoreByModule,
  };
})(window);
