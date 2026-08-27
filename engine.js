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
   *   - target minimum session length (defaults to opts.limit or pool.length, minimum 50)
   *   - aims for an 80/20 split between part A (MCQ) and part B (SATA)
   *   - distributes selection evenly across study sessions (round-robin)
   *   - deprioritizes recently seen questions when `opts.recentIds` supplied
   */
  function createSession(pool, opts) {
    opts = opts || {};
    const minSessionSize = 20;
    let desired = typeof opts.limit === "number" && opts.limit > 0 ? opts.limit : pool.length;
    // enforce minimum but never exceed pool length
    desired = Math.max(desired, minSessionSize);
    desired = Math.min(desired, pool.length);

    // split pool by part
    const poolA = pool.filter((q) => q.part === "A");
    const poolB = pool.filter((q) => q.part === "B");

    const targetA = Math.min(poolA.length, Math.round(desired * 0.8));
    const targetB = Math.min(poolB.length, desired - targetA);

    // build recent-rank map (lower = more recent). opts.recentIds expected most-recent-first
    const recentRank = {};
    if (Array.isArray(opts.recentIds)) {
      opts.recentIds.forEach((id, i) => {
        recentRank[String(id)] = i;
      });
    }

    function pickFromPart(partPool, target) {
      if (partPool.length === 0 || target <= 0) return [];
      // group by session label
      const bySession = {};
      partPool.forEach((q) => {
        bySession[q.session] = bySession[q.session] || [];
        bySession[q.session].push(q);
      });
      const sessions = Object.keys(bySession);
      // within each session, sort to deprioritize recently seen
      sessions.forEach((s) => {
        bySession[s].sort((a, b) => {
          const ra = recentRank[String(a.id)] !== undefined ? recentRank[String(a.id)] : Infinity;
          const rb = recentRank[String(b.id)] !== undefined ? recentRank[String(b.id)] : Infinity;
          if (ra === rb) return Math.random() - 0.5; // shuffle tie
          return ra - rb; // smaller index = more recent -> keep later; we'll reverse order below
        });
        // reverse so that least-recent (undefined/Infinity) come first
        bySession[s].reverse();
      });

      const selected = [];
      let i = 0;
      while (selected.length < target) {
        const s = sessions[i % sessions.length];
        const bucket = bySession[s];
        if (bucket && bucket.length > 0) {
          // pick next from front
          selected.push(bucket.shift());
        }
        i++;
        // if we've cycled and none left, break
        if (i > sessions.length * 100) break;
      }

      // if still short (not enough unique questions), fill by sampling pool (allow repeats)
      while (selected.length < target) {
        const candidate = partPool[Math.floor(Math.random() * partPool.length)];
        selected.push(candidate);
      }
      return selected;
    }

    const chosenA = pickFromPart(poolA, targetA);
    const chosenB = pickFromPart(poolB, targetB);

    // combine, interleaving to preserve part-ratio across session
    const combined = [];
    let ia = 0,
      ib = 0;
    while (combined.length < desired) {
      if (combined.length % 5 < 4) {
        // prefer A for 80/20 (4 of 5 slots)
        if (ia < chosenA.length) combined.push(chosenA[ia++]);
        else if (ib < chosenB.length) combined.push(chosenB[ib++]);
        else break;
      } else {
        if (ib < chosenB.length) combined.push(chosenB[ib++]);
        else if (ia < chosenA.length) combined.push(chosenA[ia++]);
        else break;
      }
      if (ia >= chosenA.length && ib >= chosenB.length) break;
    }

    // if still short, append more from pool (respect shuffle flag)
    const remainderPool = opts.shuffle ? shuffle(pool) : pool.slice();
    let ridx = 0;
    while (combined.length < desired && remainderPool.length > 0) {
      combined.push(remainderPool[ridx % remainderPool.length]);
      ridx++;
    }

    // final pass: if shuffle option is on, shuffle while trying to avoid immediate repeats
    let final = opts.shuffle ? shuffle(combined) : combined.slice();
    for (let k = 1; k < final.length; k++) {
      if (final[k].id === final[k - 1].id) {
        // swap with random other
        const j = Math.min(final.length - 1, k + 1 + Math.floor(Math.random() * 5));
        [final[k], final[j]] = [final[j], final[k]];
      }
    }

    const limited = final.slice(0, desired);
    return {
      questions: limited,
      index: 0,
      answers: {},
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
