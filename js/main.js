(() => {
  "use strict";
  const D = window.Deepworks;
  window.DeepworksUI = {
    note(t) {
      document.getElementById("message").textContent = t;
    },
  };
  document.getElementById("start").onclick = () =>
    document.getElementById("intro").classList.add("hide");
  document.getElementById("resetData").onclick = () => {
    if (
      !window.confirm(
        "Reset all game data? This erases your factory, resources, weapons, skills, and mining progress.",
      )
    )
      return;
    for (const k of [
      "deep-core-modules-v6",
      "deep-core-modules-v5",
      "deep-core-modules-v4",
      "deep-core-factory-v3",
      "deep-core-v2",
      "deep-core-v1",
      "deep-core-reset-v5",
    ])
      localStorage.removeItem(k);
    location.reload();
  };
  document.querySelectorAll(".tab").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll(".tab,.screen")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        document.getElementById(b.dataset.screen).classList.add("active");
        if (b.dataset.screen === "mining") D.Mining.resize();
        // Panels are only kept up to date while visible, so rebuild on entry.
        if (b.dataset.screen === "factory") D.Factory.render();
        if (b.dataset.screen === "upgrades") D.Factory.refresh();
      }),
  );
  D.Factory.init();
  D.Mining.init();
  const factoryScreen = document.getElementById("factory"),
    MAX_AWAY = 7200; // seconds of away-time the factory will fast-forward
  let last = performance.now(),
    saveClock = 0,
    uiClock = 0,
    hudClock = 0,
    awayClock = 0;
  function loop(now) {
    const real = Math.max(0, (now - last) / 1000);
    last = now;
    const visible = factoryScreen.classList.contains("active");
    if (visible) {
      // Watching the factory: real-time simulation plus drawing. A long gap
      // (tab was asleep) is credited in bigger steps instead of dropped.
      if (real <= 0.05) D.Factory.update(real);
      else D.Factory.simulate(Math.min(real, MAX_AWAY));
      awayClock = 0;
      D.Factory.drawPackets();
      hudClock += real;
      if (hudClock >= 0.066) {
        D.Factory.updateHUD();
        hudClock = 0;
      }
    } else {
      // Factory off screen: no drawing at all, and the same production rules
      // run in bigger steps. Coming back to the tab shows the credited result.
      awayClock += Math.min(real, MAX_AWAY);
      if (awayClock >= 0.25 || real > 0.25) {
        D.Factory.simulate(awayClock);
        awayClock = 0;
      }
    }
    uiClock += real;
    if (D.uiDirty && uiClock >= 0.2) {
      D.uiDirty = false;
      uiClock = 0;
      D.Mining.updateUI();
    }
    saveClock += real;
    if (saveClock >= 5) {
      D.save();
      saveClock = 0;
    }
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) D.save();
  });
  window.addEventListener("pagehide", () => D.save());
  requestAnimationFrame(loop);
})();
