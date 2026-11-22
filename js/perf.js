// Performance helpers: automatic picture quality and an optional self-refresh.
//  - Auto quality watches the frame rate and lowers render resolution, particles
//    and (on the lowest step) draws every other frame when the game runs slowly.
//  - Auto refresh saves the game and reloads the page after a while, but only at
//    a calm moment (nothing flying, sliding or being dragged), to free memory.
(() => {
  "use strict";
  const D = window.Deepworks,
    E = D.Engine,
    S = D.state;
  const P = (D.Perf = {});
  const QUALITIES = ["auto", "high", "medium", "low"],
    NAMES = ["High", "Medium", "Low"],
    PRESETS = [
      { dprCap: 2, fxScale: 1, frameSkip: 0 },
      { dprCap: 1.5, fxScale: 0.6, frameSkip: 0 },
      { dprCap: 1, fxScale: 0.3, frameSkip: 1 },
    ];
  P.QUALITIES = QUALITIES;
  P.level = 0; // 0 high, 1 medium, 2 low: what is in use right now
  P.fps = 60;
  P.ms = 16.7;
  P.levelName = () => NAMES[P.level];
  P.settings = () =>
    (S.settings = Object.assign(
      { quality: "auto", autoRefresh: 30, gooOn: true },
      S.settings,
    ));

  // ---- picture quality ------------------------------------------------------
  P.apply = (level, resize = true) => {
    level = Math.max(0, Math.min(2, level));
    const p = PRESETS[level],
      changed = E.dprCap !== p.dprCap || E.frameSkip !== p.frameSkip;
    P.level = level;
    Object.assign(E, p);
    if (changed && resize && E.resize) E.resize(); // new resolution
  };
  P.setQuality = (q) => {
    P.settings().quality = q;
    bad = good = 0;
    if (q === "auto") P.apply(0);
    else P.apply(QUALITIES.indexOf(q) - 1);
    D.markUI && D.markUI();
  };
  P.init = () => {
    const q = P.settings().quality;
    P.apply(q === "auto" ? 0 : Math.max(0, QUALITIES.indexOf(q) - 1), false);
  };

  // ---- frame-rate watch (auto quality) ----------------------------------------
  let winT = 0,
    winN = 0,
    bad = 0,
    good = 0,
    lastRaise = 0,
    blockRaiseUntil = 0;
  const now = () => performance.now() / 1000;
  const note = (t) => window.DeepworksUI && window.DeepworksUI.note(t);
  function judge() {
    if (P.settings().quality !== "auto") return;
    if (P.ms > 26) {
      bad++;
      good = 0;
    } else if (P.ms < 18) {
      good++;
      bad = 0;
    } else bad = 0;
    if (bad >= 3 && P.level < 2) {
      // slow for 3 seconds in a row: step the quality down
      if (now() - lastRaise < 60) blockRaiseUntil = now() + 300; // it was fine a minute ago: don't flip-flop
      P.apply(P.level + 1);
      bad = 0;
      note(
        "Auto quality: switched to " +
          NAMES[P.level] +
          " to keep the game smooth.",
      );
    } else if (good >= 45 && P.level > 0 && now() > blockRaiseUntil) {
      P.apply(P.level - 1);
      lastRaise = now();
      good = 0;
      note("Auto quality: running well again, back to " + NAMES[P.level] + ".");
    }
  }

  // ---- self refresh ----------------------------------------------------------
  let playT = 0,
    idleT = 0,
    countdown = -1;
  P.blockers = () => false; // the UI says when a menu is open
  P.refreshIn = () => {
    const m = P.settings().autoRefresh;
    return m > 0 ? Math.max(0, m * 60 - playT) : null; // seconds, or null when off
  };
  P.reload = () => location.reload();
  P.refreshNow = () => {
    playT = 0; // if the reload is blocked for some reason, try again after a full interval
    idleT = 0;
    countdown = -1;
    D.save();
    try {
      sessionStorage.setItem(
        "deep-core-refresh",
        JSON.stringify({ scene: D.Scenes.current }),
      );
    } catch (_) {}
    P.reload();
  };
  const calm = () =>
    !E.input.down && !(D.Mining.busy && D.Mining.busy()) && !P.blockers();

  // called every frame with the real elapsed seconds
  P.update = (real) => {
    if (document.hidden || real > 0.5) {
      winT = winN = 0; // the tab was asleep: don't count that as lag
      idleT = 0;
      return;
    }
    winT += real;
    winN++;
    if (winT >= 1) {
      P.ms = (winT / winN) * 1000;
      P.fps = winN / winT;
      winT = winN = 0;
      judge();
    }
    playT += real;
    const mins = P.settings().autoRefresh;
    if (!(mins > 0) || playT < mins * 60) return;
    if (calm()) idleT += real;
    else {
      idleT = 0;
      if (countdown >= 0) {
        countdown = -1;
        note("Refresh postponed: the game is busy.");
      }
    }
    if (countdown < 0 && idleT >= 3) {
      countdown = 2;
      note("Refreshing in 2 seconds to clear memory. Your progress is saved.");
    } else if (countdown >= 0) {
      countdown -= real;
      if (countdown <= 0) {
        countdown = -1;
        P.refreshNow();
      }
    }
  };
})();
