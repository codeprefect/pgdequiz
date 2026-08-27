/**
 * app.js
 * ------
 * Rendering + interaction. Talks to QuizBank (engine.js) for quiz logic and
 * QuizProgress (progress.js) for persistence. Contains zero course-specific
 * content — swap or add course files and this still works unmodified.
 */
(function () {
  "use strict";

  const root = document.getElementById("app");

  const state = {
    course: null,
    modules: new Set(),
    parts: new Set(["A", "B"]),
    feedbackMode: "instant", // "instant" | "exam"
    shuffleOn: true,
    countChoice: 50,
    session: null,
    selection: [], // currently ticked option ids for the active question
    locked: false, // true once current question has been submitted
    timeRemaining: 0,
    timerId: null,
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue; // skip null/undefined/false attrs entirely
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ---------------------------------------------------------------- init

  function init() {
    const courses = QuizBank.listCourses();
    if (courses.length === 0) {
      renderNoCourses();
      return;
    }
    if (courses.length === 1) {
      selectCourse(courses[0]);
    } else {
      renderCoursePicker(courses);
    }
  }

  function renderNoCourses() {
    clear(root);
    document.title = "No question bank loaded";
    root.appendChild(
      el("div", { class: "sheet" }, [
        el("h1", { class: "setup-title" }, ["No question bank loaded"]),
        el("p", { class: "muted" }, [
          "Add a course file under courses/ and list it in index.html — see courses/_template.js.",
        ]),
      ])
    );
  }

  function selectCourse(course) {
    state.course = course;
    state.modules = new Set(QuizBank.getModules(course));
    state.parts = new Set(["A", "B"]);
    document.title = `${course.code} — ${course.title}`;
    renderSetup();
  }

  // ---------------------------------------------------------- course picker

  function renderCoursePicker(courses) {
    clear(root);
    document.title = "Practice Quiz";
    const list = el("div", { class: "sheet" }, [
      el("span", { class: "eyebrow" }, ["Choose a question bank"]),
      el("h1", { class: "setup-title" }, ["Practice Quiz"]),
      el("p", { class: "setup-sub" }, ["Pick a course to begin."]),
    ]);
    courses.forEach((c) => {
      list.appendChild(
        el(
          "button",
          {
            class: "course-card",
            onclick: () => selectCourse(c),
          },
          [
            el("span", { class: "code" }, [c.code]),
            el("h3", {}, [c.title]),
            el("p", {}, [c.description || ""]),
          ]
        )
      );
    });
    root.appendChild(list);
  }

  // -------------------------------------------------------------- setup

  function renderSetup() {
    const course = state.course;
    const modules = QuizBank.getModules(course);
    const missed = QuizProgress.getMissed(course.id);
    const stats = QuizProgress.getStats(course.id);

    clear(root);
    const sheet = el("div", { class: "sheet" });

    // breadcrumb: back to course picker
    const backCrumb = el("div", { class: "breadcrumbs" }, [
      el(
        "a",
        {
          href: "#",
          onclick: (e) => {
            e.preventDefault();
            state.course = null;
            renderCoursePicker(QuizBank.listCourses());
          },
        },
        ["\u2190 Back to courses"]
      ),
    ]);
    sheet.appendChild(backCrumb);
    sheet.appendChild(el("span", { class: "eyebrow" }, [course.code]));
    sheet.appendChild(el("h1", { class: "setup-title" }, [course.title]));
    sheet.appendChild(
      el("p", { class: "setup-sub" }, [
        course.description || "Select a range of questions to practice below.",
      ])
    );

    // NOTE: module and question-format selection removed per preference

    // Feedback mode
    const fbGroup = el("div", { class: "field-group" });
    fbGroup.appendChild(el("span", { class: "field-label" }, ["Feedback"]));
    const fbRow = el("div", { class: "chip-row" });
    [
      ["instant", "Show answer after each question"],
      ["exam", "Reveal answers at the end"],
    ].forEach(([code, label]) => {
      fbRow.appendChild(
        el(
          "button",
          {
            class: "chip" + (state.feedbackMode === code ? " active" : ""),
            onclick: () => {
              state.feedbackMode = code;
              renderSetup();
            },
          },
          [label]
        )
      );
    });
    fbGroup.appendChild(fbRow);
    sheet.appendChild(fbGroup);

    // Count + shuffle
    const countGroup = el("div", { class: "field-group" });
    countGroup.appendChild(el("span", { class: "field-label" }, ["Session length"]));
    const countRow = el("div", { class: "count-row" });
    [20, 50, 60, 80, 100].forEach((n) => {
      countRow.appendChild(
        el(
          "button",
          {
            class: "chip" + (state.countChoice === n ? " active" : ""),
            onclick: () => {
              state.countChoice = n;
              renderSetup();
            },
          },
          [String(n)]
        )
      );
    });
    countGroup.appendChild(countRow);
    countGroup.appendChild(
      el("label", { class: "toggle-row", style: "margin-top:12px;" }, [
        el("input", {
          type: "checkbox",
          checked: state.shuffleOn ? "checked" : null,
          onchange: (e) => {
            state.shuffleOn = e.target.checked;
          },
        }),
        el("span", {}, ["Shuffle question order"]),
      ])
    );
    sheet.appendChild(countGroup);

    // pool count + start
    const pool = QuizBank.buildPool(course, {
      modules: Array.from(state.modules),
      parts: Array.from(state.parts),
    });
    const footer = el("div", { class: "setup-footer" });
    // compute effective session size by asking the engine to build a session
    const testSession = QuizBank.createSession(pool, { shuffle: false, limit: state.countChoice });
    const effectiveSize = testSession.questions.length;
    footer.appendChild(
      el("span", { class: "pool-count" }, [
          `${pool.length} question${pool.length === 1 ? "" : "s"} match your filters · Session: ${effectiveSize} questions`,
      ])
    );
    const startBtn = el(
      "button",
      {
        class: "btn btn-primary",
        disabled: pool.length === 0 ? "disabled" : null,
        onclick: () => startQuiz(pool),
      },
      ["Start practice \u2192"]
    );
    footer.appendChild(startBtn);
    sheet.appendChild(footer);

    // stats + missed
    if (stats.attempts > 0 || missed.size > 0) {
      const strip = el("div", { class: "stats-strip" });
      if (stats.attempts > 0) {
        strip.appendChild(el("span", {}, [el("b", {}, [`${stats.lastPct}%`]), " last score"]));
        strip.appendChild(el("span", {}, [el("b", {}, [`${stats.bestPct}%`]), " best score"]));
        strip.appendChild(el("span", {}, [el("b", {}, [String(stats.attempts)]), ` session${stats.attempts === 1 ? "" : "s"} completed`]));
      }
      if (missed.size > 0) {
        strip.appendChild(
          el(
            "span",
            {},
            [
              el("b", {}, [String(missed.size)]),
              " question" + (missed.size === 1 ? "" : "s") + " to review — ",
              el(
                "a",
                {
                  href: "#",
                  onclick: (e) => {
                    e.preventDefault();
                    const missedPool = QuizBank.buildPool(course, { onlyIds: Array.from(missed) });
                    startQuiz(missedPool, { isReview: true });
                  },
                },
                ["retry them now"]
              ),
            ]
          )
        );
      }
      sheet.appendChild(strip);
    }

    root.appendChild(sheet);
  }

  // -------------------------------------------------------------- quiz

  function startQuiz(pool, opts) {
    opts = opts || {};
    const limit = opts.isReview ? null : state.countChoice;
    // fetch recent question ids to deprioritize recently seen
    const recent = QuizProgress.getRecentQuestionIds ? QuizProgress.getRecentQuestionIds(state.course.id, 200) : [];
    state.session = QuizBank.createSession(pool, {
      shuffle: opts.isReview ? true : state.shuffleOn,
      limit,
      recentIds: recent,
    });
    state.session.isReview = !!opts.isReview;
    state.selection = [];
    state.locked = false;
    clearQuestionTimer();
    renderQuiz();
    startQuestionTimer();
  }

  function currentQuestion() {
    return state.session.questions[state.session.index];
  }

  function renderQuiz() {
    const session = state.session;
    const q = currentQuestion();
    clear(root);

    const sheet = el("div", { class: "sheet" });

    // (no breadcrumb here — prevent returning to setup during an active quiz)

    // header
    const header = el("div", { class: "quiz-header" });
    header.appendChild(
      el("div", { class: "q-tally" }, [
        el("span", { class: "num" }, [String(session.index + 1)]),
        ` / ${session.questions.length}`,
        session.isReview ? "  \u00b7 review" : "",
      ])
    );
    header.appendChild(
      el("div", { class: "q-locator" }, [
        el("div", {}, [q.module]),
        el("div", {}, [q.session]),
      ])
    );
    sheet.appendChild(header);

    // progress bar
    const pct = Math.round((session.index / session.questions.length) * 100);
    sheet.appendChild(
      el("div", { class: "progress-track" }, [el("div", { class: "progress-fill", style: `width:${pct}%` })])
    );

    // type tag
    sheet.appendChild(
      el("span", { class: "q-type-tag " + q.type }, [
        q.type === "single" ? "Choose one" : `Choose ${q.correct.length}`,
      ])
    );

    // timer display
    sheet.appendChild(el("div", { class: "countdown" }, [`Time left: ${state.timeRemaining}s`]));

    // attempt hint
    const record = state.session.answers[q.id] || {};
    const attemptsSoFar = record.attempts || 0;
    const attemptText = attemptsSoFar >= 1 ? `Attempt ${attemptsSoFar + 1} of 2` : `Attempt 1 of 2`;
    sheet.appendChild(el("div", { class: "attempt-hint" }, [attemptText]));

    sheet.appendChild(el("p", { class: "q-prompt" }, [q.prompt]));

    // options
    const optWrap = el("div", { class: "options" });
    q.options.forEach((opt) => {
      const isSelected = state.selection.includes(opt.id);
      const classes = ["option"];
      if (isSelected) classes.push("selected");
      if (state.locked) {
        classes.push("locked");
        const isCorrectOpt = q.correct.includes(opt.id);
        if (isCorrectOpt) classes.push("reveal-correct");
        else if (isSelected) classes.push("reveal-wrong");
      }
      optWrap.appendChild(
        el(
          "button",
          {
            class: classes.join(" "),
            onclick: () => {
              if (state.locked) return;
              toggleOption(q, opt.id);
            },
          },
          [el("span", { class: "mark" }, [opt.id]), el("span", {}, [opt.text])]
        )
      );
    });
    sheet.appendChild(optWrap);

    // feedback banner (instant mode, after lock)
    if (state.locked && state.feedbackMode === "instant") {
      const record = session.answers[q.id];
      const banner = el("div", { class: "feedback-banner " + (record.correct ? "correct" : "wrong") }, [
        record.correct ? "Correct." : `Not quite. Correct answer: ${q.correct.join(", ")}.`,
      ]);
      sheet.appendChild(banner);
    }

    // actions
    const actions = el("div", { class: "quiz-actions" });
    actions.appendChild(
      el(
        "button",
        {
          class: "btn btn-ghost",
          onclick: () => {
            if (confirm("End this session now and see your results so far?")) finishSession();
          },
        },
        ["End session"]
      )
    );

    if (!state.locked) {
      actions.appendChild(
        el(
          "button",
          {
            class: "btn btn-primary",
            disabled: state.selection.length === 0 ? "disabled" : null,
            onclick: () => submitAnswer(q),
          },
          ["Submit"]
        )
      );
    } else {
      const isLast = session.index === session.questions.length - 1;
      actions.appendChild(
        el(
          "button",
          {
            class: "btn btn-primary",
            onclick: () => (isLast ? finishSession() : nextQuestion()),
          },
          [isLast ? "See results \u2192" : "Next question \u2192"]
        )
      );
    }
    sheet.appendChild(actions);

    root.appendChild(sheet);
  }

  function startQuestionTimer() {
    clearQuestionTimer();
    state.timeRemaining = 40;
    state.timerId = setInterval(() => {
      state.timeRemaining -= 1;
      if (state.timeRemaining <= 0) {
        clearQuestionTimer();
        // treat timeout as final failed attempt and advance
        const q = currentQuestion();
        // record as final failed attempt
        const prev = state.session.answers[q.id];
        const attempts = prev ? (prev.attempts || 1) : 0;
        const newAttempts = attempts + 1;
        state.session.answers[q.id] = { given: prev ? prev.given : [], correct: false, attempts: newAttempts };
        QuizProgress.recordAnswer(state.course.id, q.id, false);
        QuizProgress.recordQuestionSeen && QuizProgress.recordQuestionSeen(state.course.id, q.id);
        state.locked = true;
        renderQuiz();
        setTimeout(() => {
          nextQuestion();
        }, 800);
      } else {
        // update countdown display
        const cd = document.querySelector('.countdown');
        if (cd) cd.textContent = `Time left: ${state.timeRemaining}s`;
      }
    }, 1000);
  }

  function clearQuestionTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function toggleOption(q, optId) {
    if (q.type === "single") {
      state.selection = [optId];
    } else {
      const i = state.selection.indexOf(optId);
      if (i >= 0) state.selection.splice(i, 1);
      else state.selection.push(optId);
    }
    renderQuiz();
  }

  function submitAnswer(q) {
    const result = QuizBank.scoreAnswer(q, state.selection);
    const prev = state.session.answers[q.id];
    const attempts = prev ? (prev.attempts || 1) : 0;
    const newAttempts = attempts + 1;
    state.session.answers[q.id] = { given: state.selection.slice(), correct: result.correct, attempts: newAttempts };

    // only record missed/correct in progress on final attempt or when correct
    if (result.correct) {
      QuizProgress.recordAnswer(state.course.id, q.id, true);
      QuizProgress.recordQuestionSeen && QuizProgress.recordQuestionSeen(state.course.id, q.id);
      state.locked = true;
      clearQuestionTimer();
      renderQuiz();
      setTimeout(() => {
        nextQuestion();
      }, 800);
      return;
    }

    // wrong answer
    if (newAttempts >= 2) {
      // final failed attempt
      QuizProgress.recordAnswer(state.course.id, q.id, false);
      QuizProgress.recordQuestionSeen && QuizProgress.recordQuestionSeen(state.course.id, q.id);
      state.locked = true;
      clearQuestionTimer();
      renderQuiz();
      setTimeout(() => {
        nextQuestion();
      }, 800);
      return;
    }

    // first wrong attempt: allow a second attempt, do not reveal correct answer yet
    state.selection = [];
    // keep timer running (user gets remaining time for second attempt)
    renderQuiz();
  }

  function nextQuestion() {
    state.session.index += 1;
    state.selection = [];
    state.locked = false;
    clearQuestionTimer();
    if (state.session.index >= state.session.questions.length) {
      finishSession();
      return;
    }
    renderQuiz();
    startQuestionTimer();
  }

  // ----------------------------------------------------------- results

  function optionText(q, id) {
    const o = q.options.find((o) => o.id === id);
    return o ? `${o.id}. ${o.text}` : id;
  }

  function finishSession() {
    const session = state.session;
    const score = QuizBank.sessionScore(session);
    const byModule = QuizBank.scoreByModule(session);
    const pct = score.answered ? Math.round((score.right / score.answered) * 100) : 0;
    QuizProgress.recordSessionResult(state.course.id, pct);
    renderResults(score, byModule, pct);
  }

  function renderResults(score, byModule, pct) {
    const session = state.session;
    clear(root);
    const sheet = el("div", { class: "sheet" });

    const verdict = pct >= 70 ? "distinction" : pct >= 50 ? "pass" : "retake";
    const verdictLabel = pct >= 70 ? "Distinction" : pct >= 50 ? "Pass" : "Retake";
    sheet.appendChild(
      el("div", { class: "stamp-wrap" }, [
        el("div", { class: "stamp " + (pct >= 50 ? "pass" : "fail") }, [
          el("span", { class: "pct" }, [`${pct}%`]),
          el("span", { class: "verdict" }, [verdictLabel]),
        ]),
      ])
    );

    sheet.appendChild(el("h2", { class: "results-title" }, ["Session complete"]));
    sheet.appendChild(
      el("p", { class: "results-sub" }, [
        `${score.right} of ${score.answered} answered correctly` +
          (score.answered < score.total ? ` \u00b7 ${score.total - score.answered} left unanswered` : ""),
      ])
    );

    // module breakdown
    const moduleKeys = Object.keys(byModule);
    if (moduleKeys.length > 1) {
      const bd = el("div", { class: "module-breakdown" });
      moduleKeys.forEach((m) => {
        const { right, total } = byModule[m];
        const p = total ? Math.round((right / total) * 100) : 0;
        bd.appendChild(
          el("div", { class: "module-row" }, [
            el("span", { class: "label" }, [m]),
            el("span", { class: "bar-track" }, [el("span", { class: "bar-fill", style: `width:${p}%` })]),
            el("span", { class: "frac" }, [`${right}/${total}`]),
          ])
        );
      });
      sheet.appendChild(bd);
    }

    // review missed
    if (score.missed.length > 0) {
      sheet.appendChild(el("span", { class: "field-label" }, [`Review (${score.missed.length})`]));
      const list = el("div", { class: "review-list" });
      score.missed.forEach((qid) => {
        const q = session.questions.find((qq) => qq.id === qid);
        const record = session.answers[qid];
        const item = el("div", { class: "review-item" });
        item.appendChild(el("div", { class: "r-meta" }, [`${q.module} \u00b7 ${q.session}`]));
        item.appendChild(el("p", { class: "r-prompt" }, [q.prompt]));
        item.appendChild(
          el("p", { class: "r-answer your-line" }, [
            "Your answer: " + (record.given.length ? record.given.map((id) => optionText(q, id)).join(" | ") : "(none)"),
          ])
        );
        item.appendChild(
          el("p", { class: "r-answer correct-line" }, [
            "Correct answer: " + q.correct.map((id) => optionText(q, id)).join(" | "),
          ])
        );
        list.appendChild(item);
      });
      sheet.appendChild(list);
    }

    const actions = el("div", { class: "results-actions" });
    const missedNow = QuizProgress.getMissed(state.course.id);
    if (missedNow.size > 0) {
      actions.appendChild(
        el(
          "button",
          {
            class: "btn btn-danger-ghost",
            onclick: () => {
              const missedPool = QuizBank.buildPool(state.course, { onlyIds: Array.from(missedNow) });
              startQuiz(missedPool, { isReview: true });
            },
          },
          [`Retry ${missedNow.size} missed question${missedNow.size === 1 ? "" : "s"}`]
        )
      );
    }
    actions.appendChild(
      el(
        "button",
        {
          class: "btn btn-ghost",
          onclick: () => renderSetup(),
        },
        ["Back to setup"]
      )
    );
    actions.appendChild(
      el(
        "button",
        {
          class: "btn btn-primary",
          onclick: () => {
            const pool = QuizBank.buildPool(state.course, {
              modules: Array.from(state.modules),
              parts: Array.from(state.parts),
            });
            startQuiz(pool);
          },
        },
        ["New practice set"]
      )
    );
    sheet.appendChild(actions);

    root.appendChild(sheet);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
