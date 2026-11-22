// UI toolkit drawn on the canvas: buttons, panels, bars, scroll areas,
// tooltips, notes and a small particle / floating-text system.
(() => {
  "use strict";
  const D = window.Deepworks,
    E = D.Engine,
    input = E.input,
    UI = (D.UI = {});
  UI.cy = 0; // current scroll offset (content is drawn unscrolled, input is shifted)
  UI.clip = null;
  UI.hovering = false;
  UI.tipText = null;
  const anim = new Map(),
    scrolls = new Map();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function inside(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }
  function clipOk(px, py) {
    const c = UI.clip;
    return !c || inside(px, py, c.x, c.y, c.w, c.h);
  }
  // Local transform (set with pushXf) so scaled rows still get correct hit tests.
  UI.xf = null;
  UI.blocked = false; // true while a modal is open: nothing underneath reacts
  UI.pushXf = (g, ox, oy, s) => {
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    UI.xf = { ox, oy, s };
  };
  UI.popXf = (g) => {
    g.restore();
    UI.xf = null;
  };
  const local = (px, py) => {
    const f = UI.xf;
    return f
      ? [(px - f.ox) / f.s, (py + UI.cy - f.oy) / f.s]
      : [px, py + UI.cy];
  };
  // pointer-over test in the current (scrolled / scaled) space
  UI.over = (x, y, w, h) => {
    if (UI.blocked || !clipOk(input.x, input.y)) return false;
    const [px, py] = local(input.x, input.y);
    return inside(px, py, x, y, w, h);
  };
  UI.wasDownIn = (x, y, w, h) => {
    if (UI.blocked || !clipOk(input.downX, input.downY)) return false;
    const [px, py] = local(input.downX, input.downY);
    return inside(px, py, x, y, w, h);
  };
  UI.clickedIn = (x, y, w, h) =>
    input.released &&
    !input.dragged &&
    UI.over(x, y, w, h) &&
    UI.wasDownIn(x, y, w, h);

  UI.panel = (g, x, y, w, h, o = {}) => {
    E.rr(g, x, y, w, h, o.r ?? 10);
    g.fillStyle = o.fill || "rgba(18,30,34,.92)";
    g.fill();
    if (o.stroke !== null) {
      g.lineWidth = o.lw || 1.5;
      g.strokeStyle = o.stroke || "#2f4a4b";
      g.stroke();
    }
  };

  // Draws a button and returns true on the frame it is clicked.
  UI.button = (g, id, x, y, w, h, label, o = {}) => {
    const dis = !!o.disabled,
      over = !dis && UI.over(x, y, w, h),
      held = over && input.down && UI.wasDownIn(x, y, w, h);
    let a = anim.get(id);
    if (!a) anim.set(id, (a = { h: 0, p: 0 }));
    const k = Math.min(1, E.dt * 16);
    a.h += ((over ? 1 : 0) - a.h) * k;
    a.p += ((held ? 1 : 0) - a.p) * Math.min(1, E.dt * 30);
    if (over) {
      UI.hovering = true;
      if (o.tip && !input.touch) UI.tipText = o.tip;
    }
    const s = 1 - 0.035 * a.p + 0.012 * a.h,
      cx = x + w / 2,
      cy = y + h / 2;
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.translate(-cx, -cy);
    g.globalAlpha = dis ? 0.42 : 1;
    const base = o.active ? o.activeFill || "#25624f" : o.fill || "#1f3338";
    E.rr(g, x, y, w, h, o.r ?? 9);
    g.fillStyle = base;
    g.fill();
    if (a.h > 0.01 || a.p > 0.01) {
      g.fillStyle = "rgba(255,255,255," + (0.07 * a.h + 0.08 * a.p) + ")";
      g.fill();
    }
    g.lineWidth = o.active ? 2 : 1.5;
    g.strokeStyle = o.active
      ? o.activeStroke || "#7ee2b8"
      : a.h > 0.3
        ? "#6aa79c"
        : o.stroke || "#35565a";
    g.stroke();
    const left = o.align === "left",
      pad = 12,
      iconW = o.icon ? (o.iconSize || 22) + 8 : 0;
    if (o.icon)
      E.text(
        g,
        o.icon,
        left ? x + pad : cx - (iconW + (o.textW || 0)) / 2,
        cy,
        {
          size: o.iconSize || 22,
          weight: 400,
          align: left ? "left" : "left",
        },
      );
    const tx = left ? x + pad + iconW : cx,
      mw = w - pad * 2 - iconW;
    if (o.sub) {
      E.text(g, label, tx, cy - 8, {
        size: o.size || 14,
        weight: 800,
        align: left ? "left" : "center",
        maxW: mw,
        color: o.color,
      });
      E.text(g, o.sub, tx, cy + 10, {
        size: o.subSize || 11,
        weight: 500,
        align: left ? "left" : "center",
        maxW: mw,
        color: o.subColor || "#9fb9b1",
      });
    } else
      E.text(g, label, tx, cy, {
        size: o.size || 14,
        weight: 800,
        align: left ? "left" : "center",
        maxW: mw,
        color: o.color,
      });
    g.restore();
    return !dis && UI.clickedIn(x, y, w, h);
  };

  UI.bar = (g, x, y, w, h, frac, o = {}) => {
    E.rr(g, x, y, w, h, h / 2);
    g.fillStyle = o.bg || "#0d1719";
    g.fill();
    const fw = Math.max(0, Math.min(1, frac)) * w;
    if (fw > 0.5) {
      E.rr(g, x, y, Math.max(fw, h), h, h / 2);
      g.fillStyle = o.color || "#6fe0b0";
      g.fill();
    }
  };

  UI.tip = (t) => {
    if (!input.touch) UI.tipText = t;
  };

  // Vertical scroll area. Draw content at absolute coordinates starting at y;
  // wheel and drag scroll it. Returns the current scroll offset.
  UI.scrollBegin = (g, id, x, y, w, h, contentH) => {
    let s = scrolls.get(id);
    if (!s) scrolls.set(id, (s = { y: 0, drag: false, y0: 0 }));
    const max = Math.max(0, contentH - h),
      over = inside(input.x, input.y, x, y, w, h);
    if (over && input.wheel) s.y += input.wheel * 0.7;
    if (input.pressed && inside(input.downX, input.downY, x, y, w, h)) {
      s.drag = true;
      s.y0 = s.y;
    }
    if (!input.down) s.drag = false;
    if (s.drag && input.dragged) s.y = s.y0 - (input.y - input.downY);
    s.y = clamp(s.y, 0, max);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.translate(0, -s.y);
    UI.clip = { x, y, w, h };
    UI.cy = s.y;
    return s.y;
  };
  UI.scrollEnd = (g) => {
    g.restore();
    UI.clip = null;
    UI.cy = 0;
  };

  // ---- notes + tooltip ----------------------------------------------------
  let noteText = "Welcome to Deep Core.",
    noteT = 0;
  UI.note = (t) => {
    noteText = t;
    noteT = 0;
  };
  UI.noteText = () => noteText;
  UI.noteAge = () => noteT;
  window.DeepworksUI = { note: UI.note };
  UI.update = (dt) => {
    noteT += dt;
  };

  UI.beginFrame = () => {
    UI.hovering = false;
    UI.tipText = null;
  };
  UI.endFrame = (g) => {
    E.canvas.style.cursor = UI.hovering ? "pointer" : "default";
    if (UI.tipText) {
      g.font = "500 13px " + E.FONT;
      const maxW = 280,
        words = UI.tipText.split(" "),
        lines = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (g.measureText(t).width > maxW && line) {
          lines.push(line);
          line = w;
        } else line = t;
      }
      lines.push(line);
      const bw =
          Math.min(
            maxW,
            Math.max(...lines.map((l) => g.measureText(l).width)),
          ) + 20,
        bh = lines.length * 18 + 14;
      let x = clamp(input.x + 14, 6, E.VW - bw - 6),
        y = clamp(input.y + 18, 6, E.VH - bh - 6);
      UI.panel(g, x, y, bw, bh, {
        fill: "rgba(8,14,16,.96)",
        stroke: "#58807a",
        r: 8,
      });
      lines.forEach((l, i) =>
        E.text(g, l, x + 10, y + 16 + i * 18, { size: 13, weight: 500 }),
      );
    }
  };

  // ---- particles + floating text -------------------------------------------
  UI.makeFx = () => {
    const parts = [],
      floats = [],
      cap = () => Math.max(16, Math.round(140 * (E.fxScale ?? 1)));
    return {
      spark(x, y, col) {
        if (parts.length > cap()) return;
        parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 70,
          vy: -40 - Math.random() * 60,
          t: 0,
          life: 0.45 + Math.random() * 0.3,
          c: col || "#ffd36b",
          r: 2.2,
          g: 160,
        });
      },
      puff(x, y) {
        if (parts.length > cap()) return;
        parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 14,
          vy: -22 - Math.random() * 16,
          t: 0,
          life: 0.9,
          c: "rgba(200,215,210,",
          r: 3,
          grow: 6,
          g: -6,
          soft: true,
        });
      },
      burst(x, y, col, n = 8) {
        for (let i = 0; i < n && parts.length < cap(); i++) {
          const a = Math.random() * 6.28,
            s = 40 + Math.random() * 70;
          parts.push({
            x,
            y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - 20,
            t: 0,
            life: 0.5 + Math.random() * 0.25,
            c: col || "#ffe083",
            r: 2.4,
            g: 200,
          });
        }
      },
      float(x, y, text, col) {
        if (floats.length < 12)
          floats.push({ x, y, text, t: 0, c: col || "#ffe083" });
      },
      update(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.t += dt;
          p.vy += (p.g || 0) * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.grow) p.r += p.grow * dt;
          if (p.t >= p.life) parts.splice(i, 1);
        }
        for (let i = floats.length - 1; i >= 0; i--) {
          floats[i].t += dt;
          if (floats[i].t > 0.95) floats.splice(i, 1);
        }
      },
      draw(g) {
        for (const p of parts) {
          const k = 1 - p.t / p.life;
          if (p.soft) {
            g.fillStyle = p.c + 0.35 * k + ")";
          } else {
            g.globalAlpha = Math.max(0, k);
            g.fillStyle = p.c;
          }
          g.beginPath();
          g.arc(p.x, p.y, p.r * (p.soft ? 1 : 0.6 + 0.4 * k), 0, 6.29);
          g.fill();
          g.globalAlpha = 1;
        }
        for (const f of floats) {
          const k = f.t / 0.95;
          g.globalAlpha = Math.max(0, 1 - k * k);
          E.text(g, f.text, f.x, f.y - 8 - 34 * k, {
            size: 14,
            weight: 900,
            color: f.c,
            align: "center",
            shadow: true,
          });
          g.globalAlpha = 1;
        }
      },
      get count() {
        return parts.length + floats.length;
      },
    };
  };
})();
