(() => {
  "use strict";
  const D = window.Deepworks,
    E = D.Engine,
    F = D.Factory,
    MAX_AWAY = 7200; // seconds of away-time the factory will fast-forward
  E.reduced = !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  F.init();
  D.Mining.init();
  D.Perf.init();
  let awayClock = 0,
    saveClock = 0;
  E.start({
    update(real) {
      D.Perf.update(real);
      if (D.Scenes.current === "factory") {
        // Watching the factory: real-time simulation. A long gap (tab was
        // asleep) is credited in bigger steps instead of dropped.
        if (real <= 0.05) F.update(real);
        else F.simulate(Math.min(real, MAX_AWAY));
        awayClock = 0;
      } else {
        // Factory off screen: nothing is drawn, and the same production rules
        // run in bigger steps. Coming back shows the credited result.
        awayClock += Math.min(real, MAX_AWAY);
        if (awayClock >= 0.25 || real > 0.25) {
          F.simulate(awayClock);
          awayClock = 0;
        }
      }
      D.Mining.update(Math.min(real, 0.05) * 60);
      D.Scenes.update(E.dt);
      saveClock += real;
      if (saveClock >= 5) {
        D.save();
        saveClock = 0;
      }
    },
    draw: (g) => D.Scenes.draw(g),
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) D.save();
  });
  window.addEventListener("pagehide", () => D.save());
})();
