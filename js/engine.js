// Engine: one canvas, a fixed 1280x720 virtual screen scaled to fit the window,
// unified mouse/touch input, text helpers, and the main loop.
(() => {
  "use strict";
  const D = window.Deepworks;
  const E = (D.Engine = {});
  const VW = 1280,
    VH = 720,
    FONT =
      '"Segoe UI", system-ui, -apple-system, "Noto Sans", Arial, sans-serif';
  const canvas = document.getElementById("game"),
    g = canvas.getContext("2d");
  Object.assign(E, {
    VW,
    VH,
    g,
    canvas,
    FONT,
    scale: 1,
    ox: 0,
    oy: 0,
    dpr: 1,
    time: 0,
    dt: 0.016,
  });
  const input = (E.input = {
    x: -1000,
    y: -1000,
    down: false,
    downX: 0,
    downY: 0,
    pressed: false,
    released: false,
    dragged: false,
    wheel: 0,
    touch: false,
    id: null,
  });
  E.on = { down: null, move: null, up: null, key: null };
  E.onResize = [];

  function resize() {
    const cw = window.innerWidth,
      ch = window.innerHeight,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    E.dpr = dpr;
    E.scale = Math.min(cw / VW, ch / VH);
    E.ox = (cw - VW * E.scale) / 2;
    E.oy = (ch - VH * E.scale) / 2;
    E.onResize.forEach((f) => f());
  }
  const vx = (e) => (e.clientX - E.ox) / E.scale,
    vy = (e) => (e.clientY - E.oy) / E.scale;

  canvas.addEventListener("pointerdown", (e) => {
    if (input.id !== null && e.pointerId !== input.id) return;
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    input.id = e.pointerId;
    input.touch = e.pointerType === "touch";
    input.x = input.downX = vx(e);
    input.y = input.downY = vy(e);
    input.down = input.pressed = true;
    input.dragged = false;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    if (E.on.down) E.on.down(input.x, input.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (input.id !== null && e.pointerId !== input.id) return;
    input.touch = e.pointerType === "touch";
    input.x = vx(e);
    input.y = vy(e);
    if (
      input.down &&
      Math.hypot(input.x - input.downX, input.y - input.downY) > 8
    )
      input.dragged = true;
    if (E.on.move) E.on.move(input.x, input.y);
  });
  const end = (e, ok) => {
    if (e.pointerId !== input.id) return;
    input.x = vx(e);
    input.y = vy(e);
    if (ok) input.released = true;
    if (E.on.up) E.on.up(input.x, input.y, ok);
    input.down = false;
    input.id = null;
  };
  canvas.addEventListener("pointerup", (e) => end(e, true));
  canvas.addEventListener("pointercancel", (e) => end(e, false));
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      input.wheel += e.deltaY;
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (E.on.key) E.on.key(e);
  });

  // ---- drawing helpers ----------------------------------------------------
  E.rr = (c, x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  // text(g, "hello", x, y, {size, color, weight, align, base, maxW, minSize, shadow})
  E.text = (c, str, x, y, o = {}) => {
    let size = o.size || 14;
    const weight = o.weight || 600;
    c.font = weight + " " + size + "px " + FONT;
    str = String(str);
    if (o.maxW) {
      let w = c.measureText(str).width;
      if (w > o.maxW) {
        size = Math.max(o.minSize || 7, (size * o.maxW) / w);
        c.font = weight + " " + size + "px " + FONT;
        w = c.measureText(str).width;
        while (w > o.maxW && str.length > 2) {
          str = str.slice(0, -2) + "…";
          w = c.measureText(str).width;
        }
      }
    }
    c.textAlign = o.align || "left";
    c.textBaseline = o.base || "middle";
    if (o.shadow) {
      c.fillStyle = "rgba(0,0,0,.55)";
      c.fillText(str, x, y + 1);
    }
    c.fillStyle = o.color || "#e9f2ee";
    c.fillText(str, x, y);
  };
  // word-wrapped text; returns the height used
  E.wrap = (c, str, x, y, maxW, o = {}) => {
    const size = o.size || 13,
      lh = o.lh || size * 1.35;
    c.font = (o.weight || 500) + " " + size + "px " + FONT;
    const words = String(str).split(" ");
    let line = "",
      yy = y;
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (c.measureText(t).width > maxW && line) {
        E.text(c, line, x, yy, o);
        yy += lh;
        line = w;
      } else line = t;
    }
    if (line) {
      E.text(c, line, x, yy, o);
      yy += lh;
    }
    return yy - y;
  };

  E.start = (cfg) => {
    resize();
    window.addEventListener("resize", resize);
    let last = performance.now();
    function frame(now) {
      const real = Math.max(0, (now - last) / 1000);
      last = now;
      E.dt = Math.min(real, 0.05);
      E.time += E.dt;
      cfg.update(real);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = "#070d10";
      g.fillRect(0, 0, canvas.width, canvas.height);
      const k = E.dpr * E.scale;
      g.setTransform(k, 0, 0, k, E.dpr * E.ox, E.dpr * E.oy);
      g.save();
      g.beginPath();
      g.rect(0, 0, VW, VH);
      g.clip();
      cfg.draw(g);
      g.restore();
      input.pressed = input.released = false;
      input.wheel = 0;
      if (input.touch && !input.down) input.x = input.y = -1000;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
})();
