/**
 * progress.js
 * -----------
 * Small persistence layer, isolated from engine.js and app.js so storage
 * can be swapped out later (e.g. for a backend) without touching quiz logic.
 * Falls back to an in-memory store if localStorage is unavailable.
 */
(function (global) {
  "use strict";

  const KEY_PREFIX = "quizbank:";
  let memoryFallback = {};
  let storageOK = true;
  try {
    const t = "__quizbank_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
  } catch (e) {
    storageOK = false;
  }

  function read(key, fallback) {
    const full = KEY_PREFIX + key;
    try {
      if (storageOK) {
        const raw = localStorage.getItem(full);
        return raw ? JSON.parse(raw) : fallback;
      }
      return memoryFallback[full] !== undefined ? memoryFallback[full] : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    const full = KEY_PREFIX + key;
    try {
      if (storageOK) {
        localStorage.setItem(full, JSON.stringify(value));
      } else {
        memoryFallback[full] = value;
      }
    } catch (e) {
      /* quota or serialization error: silently ignore, in-memory session still works */
    }
  }

  function missedKey(courseId) {
    return `${courseId}:missed`;
  }
  function statsKey(courseId) {
    return `${courseId}:stats`;
  }
  function historyKey(courseId) {
    return `${courseId}:history`;
  }

  function getMissed(courseId) {
    return new Set(read(missedKey(courseId), []));
  }

  function setMissed(courseId, idSet) {
    write(missedKey(courseId), Array.from(idSet));
  }

  function getQuestionHistory(courseId) {
    return read(historyKey(courseId), {});
  }

  function recordQuestionSeen(courseId, questionId) {
    const hist = getQuestionHistory(courseId);
    hist[String(questionId)] = Date.now();
    write(historyKey(courseId), hist);
  }

  function getRecentQuestionIds(courseId, limit) {
    const hist = getQuestionHistory(courseId);
    const entries = Object.keys(hist).map((k) => [k, hist[k]]);
    entries.sort((a, b) => b[1] - a[1]);
    const ids = entries.map((e) => (isNaN(e[0]) ? e[0] : Number(e[0])));
    return typeof limit === "number" && limit > 0 ? ids.slice(0, limit) : ids;
  }

  /** Record the outcome of one answered question: updates the missed-question set. */
  function recordAnswer(courseId, questionId, wasCorrect) {
    const missed = getMissed(courseId);
    if (wasCorrect) missed.delete(questionId);
    else missed.add(questionId);
    setMissed(courseId, missed);
  }

  function getStats(courseId) {
    return read(statsKey(courseId), { attempts: 0, bestPct: 0, lastPct: null });
  }

  function recordSessionResult(courseId, pct) {
    const stats = getStats(courseId);
    stats.attempts += 1;
    stats.lastPct = pct;
    stats.bestPct = Math.max(stats.bestPct, pct);
    write(statsKey(courseId), stats);
    return stats;
  }

  global.QuizProgress = {
    getMissed,
    setMissed,
    recordAnswer,
    recordQuestionSeen,
    getRecentQuestionIds,
    getStats,
    recordSessionResult,
    storageAvailable: storageOK,
  };
})(window);
