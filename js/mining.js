(() => {
  "use strict";
  const D = window.Deepworks,
    S = D.state,
    c = document.getElementById("mineCanvas"),
    ctx = c.getContext("2d"),
    terrain = document.createElement("canvas"),
    tx = terrain.getContext("2d");
  D.Mining = {};
  const M = D.Mining;
  const MIN_ORE_CELLS = 24;
  // Static world (sky, ground, ore) is drawn once into `terrain` and only
  // redrawn after it changes; every frame just blits it and draws the movers.
  let terrainDirty = true,
    dpr = 1;
  const sprites = new WeakMap(); // ore -> cached sprite (shape + outline)
  const BOMB_R = 8,
    STEP = 0.5; // fixed physics step, in 60Hz-frame units (120Hz)
  let ground = [],
    caches = [],
    step = 4,
    w0 = 0,
    h0 = 0,
    aimX = 450,
    aimY = 8,
    aimStart = null,
    aimPointer = null,
    bombs = [],
    dust = [],
    rings = [],
    shake = 0;
  const WORLD_W = 900,
    WORLD_H = 520;
  function W() {
    return WORLD_W;
  }
  function H() {
    return WORLD_H;
  }
  function base() {
    return H() * 0.35;
  }
  function surface(x) {
    let i = Math.max(0, Math.min(ground.length - 2, Math.floor(x / step))),
      t = x / step - i;
    return ground[i] * (1 - t) + ground[i + 1] * t;
  }
  function chooseOre() {
    let d = S.depth,
      w = [Math.max(24, 62 - d * 3), 25, 11 + d * 2, 2 + d],
      r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r < 0) return D.ores[i].id;
    }
    return "coal";
  }
  function inside(x, y, v) {
    let z = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      let a = v[i],
        b = v[j];
      if (
        a[1] > y !== b[1] > y &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
      )
        z = !z;
    }
    return z;
  }
  function makeCaches() {
    caches = [];
    for (let n = 0; n < 30; n++) {
      let px = Math.random() * W(),
        py = base() + 15 + Math.random() * (H() - base() - 25),
        rx = 10 + Math.random() * 24,
        ry = 8 + Math.random() * 19,
        count = 6 + Math.floor(Math.random() * 5),
        phase = Math.random() * 6.28,
        verts = [];
      for (let i = 0; i < count; i++) {
        let a = phase + (i * 6.28) / count,
          r = 0.72 + Math.random() * 0.52;
        verts.push([px + Math.cos(a) * rx * r, py + Math.sin(a) * ry * r]);
      }
      let cells = [];
      for (let x = px - rx; x <= px + rx; x += 2)
        for (let y = py - ry; y <= py + ry; y += 2)
          if (inside(x, y, verts)) cells.push([x, y]);
      if (cells.length >= MIN_ORE_CELLS)
        caches.push({
          px,
          py,
          rx,
          ry,
          verts,
          cells,
          type: chooseOre(),
          hardness: 1.05 + S.depth * 0.13 + Math.random() * 0.55,
          progress: 0,
          cuts: [],
        });
    }
  }
  function makeWorld() {
    ground = [];
    for (let x = 0; x <= W(); x += step)
      ground.push(
        base() +
          Math.sin(x * 0.018 + S.depth) * 8 +
          Math.sin(x * 0.043 + 1.3) * 4,
      );
    ground.push(ground[ground.length - 1]);
    w0 = W();
    h0 = H();
    bombs = [];
    terrainDirty = true;
    makeCaches();
    M.draw();
  }
  function resize() {
    let nw = W(),
      nh = H(),
      d = Math.min(devicePixelRatio || 1, 2);
    if (ground.length && w0 && h0 && (w0 !== nw || h0 !== nh)) {
      let old = ground.slice(),
        ow = w0,
        oh = h0,
        ob = oh * 0.35,
        nb = nh * 0.35;
      ground = [];
      for (let px = 0; px <= nw; px += step) {
        let ox = (px / nw) * ow,
          i = Math.max(0, Math.min(old.length - 2, Math.floor(ox / step))),
          t = ox / step - i,
          y = old[i] * (1 - t) + old[i + 1] * t;
        ground.push(nb + ((y - ob) * (nh - nb)) / (oh - ob));
      }
      ground.push(ground[ground.length - 1]);
      let sx = nw / ow,
        sy = nh / oh;
      for (const o of caches) {
        o.px *= sx;
        o.py = nb + (o.py - ob) * sy;
        o.rx *= sx;
        o.ry *= sy;
        o.verts = o.verts.map((v) => [v[0] * sx, nb + (v[1] - ob) * sy]);
        o.cells = o.cells.map((v) => [v[0] * sx, nb + (v[1] - ob) * sy]);
        o.cuts = o.cuts.map((q) => ({
          px: q.px * sx,
          py: nb + (q.py - ob) * sy,
          r: q.r * sx,
        }));
      }
    }
    w0 = nw;
    h0 = nh;
    c.width = nw * d;
    c.height = nh * d;
    terrain.width = c.width;
    terrain.height = c.height;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    tx.setTransform(d, 0, 0, d, 0, 0);
    dpr = d;
    terrainDirty = true;
    if (!ground.length) makeWorld();
    else M.draw();
  }
  function countOre() {
    return Object.values(S.ore).reduce((a, b) => a + b, 0);
  }
  function goal() {
    return (420 + S.depth * 160) * 5;
  }
  // Write to the DOM only when the content actually changed.
  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el._h !== html) {
      el._h = html;
      el.innerHTML = html;
    }
  }
  function updateUI() {
    document.getElementById("level").textContent = document.getElementById(
      "currentLevel",
    ).textContent = S.depth + 1;
    document.getElementById("money").textContent = Math.floor(S.money);
    document.getElementById("banked").textContent = Object.values(
      S.stock,
    ).reduce((a, b) => a + b, 0);
    setHTML(
      "oreList",
      D.ores
        .map(
          (o) =>
            '<div class="resource" title="' +
            o.name +
            " is used to craft factory parts and sells for " +
            o.value +
            ' credits per unit."><span><i class="ore-dot" style="background:' +
            o.color +
            '"></i>' +
            o.name +
            " · ¢" +
            o.value +
            "</span><b>" +
            S.ore[o.id] +
            "</b></div>",
        )
        .join(""),
    );
    setHTML(
      "weaponStockList",
      Object.keys(D.weapons)
        .map(
          (k) =>
            '<div class="resource"><span>' +
            D.weapons[k].icon +
            " " +
            D.weapons[k].name +
            "</span><b>" +
            S.stock[k] +
            "</b></div>",
        )
        .join(""),
    );
    document.getElementById("levelProgress").style.width =
      Math.min(100, (S.digScore / goal()) * 100) + "%";
    document.getElementById("progressText").textContent =
      Math.floor(S.digScore) +
      " / " +
      goal() +
      " ground cleared for next level";
    document.getElementById("advanceLevel").disabled = S.digScore < goal();
    setHTML(
      "weapons",
      Object.keys(D.weapons)
        .map(
          (k) =>
            '<button class="weapon ' +
            (S.selectedWeapon === k ? "active" : "") +
            '" title="' +
            D.weapons[k].name +
            " · Recipe: " +
            Object.entries(D.weapons[k].recipe)
              .filter(([r]) => r !== "seconds")
              .map(([r, n]) => n + " " + (r === "grenade" ? "hand grenade" : r))
              .join(" + ") +
            '" data-w="' +
            k +
            '" ' +
            (S.stock[k] < 1 ? "disabled" : "") +
            ">" +
            D.weapons[k].icon +
            " " +
            D.weapons[k].name +
            " · " +
            S.stock[k] +
            "</button>",
        )
        .join(""),
    );
    D.Factory.refresh();
  }
  // Craters are true circles centred on the explosion. The ground is a
  // height map, so a column is lowered to the bottom of the circle; columns
  // whose surface sits above the circle (it would be a cave) are left alone.
  function blast(b, py) {
    const rad = b.r / (1 + S.depth * 0.14),
      floor = H() * 0.96;
    let dug = 0;
    for (let i = 0; i < ground.length; i++) {
      const dx = i * step - b.px;
      if (Math.abs(dx) >= rad) continue;
      const half = Math.sqrt(rad * rad - dx * dx),
        g = ground[i];
      if (g < py - half) continue;
      const bottom = Math.min(floor, py + half);
      if (bottom > g) {
        ground[i] = bottom;
        dug += ((bottom - g) * step) / 12;
      }
    }
    S.digScore += dug;
    terrainDirty = true;
    for (const o of caches) {
      let effective = rad / o.hardness,
        removed = 0;
      if (
        !o.cells.length ||
        Math.abs(o.px - b.px) > effective + o.rx ||
        Math.abs(o.py - py) > effective + o.ry
      )
        continue;
      for (let i = o.cells.length - 1; i >= 0; i--) {
        let q = o.cells[i];
        if (Math.hypot(q[0] - b.px, q[1] - py) <= effective) {
          o.cells.splice(i, 1);
          removed++;
        }
      }
      if (removed) {
        o.cuts.push({ px: b.px, py, r: effective });
        o.progress += (removed / 20) * (1 + S.skills.oreYield * 0.12);
        let amount = Math.floor(o.progress);
        S.ore[o.type] += amount;
        o.progress -= amount;
        if (o.cells.length < MIN_ORE_CELLS) {
          o.cells.length = 0;
          o.cuts.length = 0;
          o.progress = 0;
        }
      }
    }
    caches = caches.filter((o) => o.cells.length >= MIN_ORE_CELLS);
    shake = 7;
    rings.push({ px: b.px, py, r: 0, t: 1, max: rad });
    for (let i = 0; i < 26; i++) {
      let a = Math.random() * 6.28,
        v = 1 + Math.random() * 5;
      dust.push({
        x: b.px,
        y: py,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: 0.8,
        r: 2 + Math.random() * 4,
      });
    }
    window.DeepworksUI.note(
      b.weapon === "dynamiteBurst"
        ? "Dynamite burst! Four sticks scatter outward."
        : b.weapon === "dynamiteShard"
          ? "Dynamite stick detonated!"
          : "BOOM! Hidden veins yield ore only where the blast reaches them.",
    );
    updateUI();
  }
  // One small cached sprite per ore: the remaining shape (polygon minus the
  // blast circles) plus an outline traced around that actual shape. It is
  // rebuilt only when the ore gets cut, not every frame.
  function oreSprite(o) {
    const key = o.cuts.length + "/" + o.cells.length + "/" + dpr;
    let sp = sprites.get(o);
    if (sp && sp.key === key) return sp;
    const pad = 5,
      bx = Math.floor(o.px - o.rx * 1.3 - pad),
      by = Math.floor(o.py - o.ry * 1.3 - pad),
      bw = Math.ceil(o.rx * 2.6 + pad * 2),
      bh = Math.ceil(o.ry * 2.6 + pad * 2);
    if (!sp)
      sp = {
        shape: document.createElement("canvas"),
        out: document.createElement("canvas"),
      };
    sp.key = key;
    sp.bx = bx;
    sp.by = by;
    sp.bw = bw;
    sp.bh = bh;
    const pw = Math.ceil(bw * dpr),
      ph = Math.ceil(bh * dpr);
    sp.shape.width = sp.out.width = pw;
    sp.shape.height = sp.out.height = ph;
    const a = sp.shape.getContext("2d"),
      b = sp.out.getContext("2d");
    a.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
    a.beginPath();
    o.verts.forEach((v, i) =>
      i ? a.lineTo(v[0], v[1]) : a.moveTo(v[0], v[1]),
    );
    a.closePath();
    a.fillStyle = D.ores.find((t) => t.id === o.type).color;
    a.fill();
    a.globalCompositeOperation = "destination-out";
    for (const q of o.cuts) {
      a.beginPath();
      a.arc(q.px, q.py, q.r, 0, 6.29);
      a.fill();
    }
    a.globalCompositeOperation = "source-over";
    // outline = the shape pushed out in 8 directions, tinted dark, under the shape
    const off = 2 * dpr;
    for (let k = 0; k < 8; k++)
      b.drawImage(
        sp.shape,
        Math.cos((k * Math.PI) / 4) * off,
        Math.sin((k * Math.PI) / 4) * off,
      );
    b.globalCompositeOperation = "source-in";
    b.fillStyle = "#182126";
    b.fillRect(0, 0, pw, ph);
    b.globalCompositeOperation = "source-over";
    b.drawImage(sp.shape, 0, 0);
    sprites.set(o, sp);
    return sp;
  }
  function paintVeins() {
    // only the part of an ore that sticks out above the ground is visible
    const sky = new Path2D();
    sky.moveTo(0, 0);
    sky.lineTo(W(), 0);
    for (let i = 0; i < ground.length; i++) sky.lineTo(i * step, ground[i]);
    sky.lineTo(0, ground[0]);
    sky.closePath();
    tx.save();
    tx.clip(sky);
    for (const o of caches) {
      if (!o.cells.length || !o.cells.some((q) => q[1] <= surface(q[0])))
        continue;
      const sp = oreSprite(o);
      tx.drawImage(sp.out, sp.bx, sp.by, sp.bw, sp.bh);
    }
    tx.restore();
  }
  function renderTerrain() {
    const w = W(),
      h = H();
    tx.clearRect(0, 0, w, h);
    let sky = tx.createLinearGradient(0, 0, 0, base());
    sky.addColorStop(0, "#45666a");
    sky.addColorStop(1, "#283b40");
    tx.fillStyle = sky;
    tx.fillRect(0, 0, w, h);
    let g = tx.createLinearGradient(0, base(), 0, h),
      q = Math.min(S.depth * 0.012, 0.2);
    g.addColorStop(0, "#795b43");
    g.addColorStop(Math.max(0.08, 0.35 - q), "#66503f");
    g.addColorStop(Math.max(0.2, 0.58 - q), "#555157");
    g.addColorStop(Math.max(0.38, 0.8 - q), "#414655");
    g.addColorStop(1, "#292f40");
    tx.beginPath();
    tx.moveTo(0, h);
    ground.forEach((y, i) => tx.lineTo(i * step, y));
    tx.lineTo(w, h);
    tx.closePath();
    tx.fillStyle = g;
    tx.fill();
    for (let k = 1; k < 4; k++) {
      tx.beginPath();
      ground.forEach((y, i) => {
        let xx = i * step,
          yy = y + ((h - y) * k) / 4;
        i ? tx.lineTo(xx, yy) : tx.moveTo(xx, yy);
      });
      tx.strokeStyle = "rgba(220,210,190,.07)";
      tx.lineWidth = 2;
      tx.stroke();
    }
    paintVeins();
    tx.beginPath();
    tx.moveTo(0, ground[0]);
    ground.forEach((y, i) => tx.lineTo(i * step, y));
    tx.strokeStyle = "#b49a70";
    tx.lineWidth = 4;
    tx.stroke();
  }
  M.draw = () => {
    let w = W(),
      h = H();
    if (terrainDirty) {
      renderTerrain();
      terrainDirty = false;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (shake) {
      ctx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
      );
      shake *= 0.82;
      if (shake < 0.3) shake = 0;
    }
    ctx.drawImage(terrain, 0, 0, w, h);
    for (const b of bombs) {
      ctx.save();
      ctx.translate(b.px, b.py);
      ctx.rotate(b.angle || 0);
      if (b.weapon === "sticky") {
        ctx.fillStyle = "#63c98b";
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 9, 0, 0, 6.29);
        ctx.fill();
        ctx.fillStyle = "#d2ffab";
        ctx.beginPath();
        ctx.arc(-3, -3, 2.4, 0, 6.29);
        ctx.fill();
        ctx.fillStyle = "#78d99c";
        ctx.fillRect(-2, 7, 4, 4);
      } else if (b.weapon === "dynamite") {
        ctx.lineCap = "round";
        ctx.strokeStyle = "#6f241f";
        ctx.lineWidth = 5;
        for (let j = -1; j <= 2; j++) {
          ctx.beginPath();
          ctx.moveTo(j * 4, -9);
          ctx.lineTo(j * 4, 9);
          ctx.stroke();
        }
        ctx.strokeStyle = "#d64a40";
        ctx.lineWidth = 3.2;
        for (let j = -1; j <= 2; j++) {
          ctx.beginPath();
          ctx.moveTo(j * 4, -9);
          ctx.lineTo(j * 4, 9);
          ctx.stroke();
        }
        ctx.strokeStyle = "#e7c879";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
      } else if (b.weapon === "dynamiteShard") {
        ctx.lineCap = "round";
        ctx.strokeStyle = "#70231d";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 9);
        ctx.stroke();
        ctx.strokeStyle = "#d94a40";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 9);
        ctx.stroke();
        ctx.fillStyle = "#f7bc63";
        ctx.fillRect(-1, -14, 2, 4);
      } else {
        ctx.fillStyle = "#172126";
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 10, 0, 0, 6.29);
        ctx.fill();
        ctx.fillStyle = "#ffb659";
        ctx.fillRect(-2, -14, 4, 5);
      }
      ctx.restore();
    }
    if (aimStart && aimPointer) {
      let dx = aimPointer.x - aimStart.x,
        dy = aimPointer.y - aimStart.y,
        len = Math.hypot(dx, dy),
        scale = len ? Math.min(1, 150 / len) : 0,
        ex = aimStart.x + dx * scale,
        ey = aimStart.y + dy * scale,
        a = Math.atan2(dy, dx);
      ctx.save();
      ctx.strokeStyle = "#ffe28a";
      ctx.fillStyle = "#ffe28a";
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(aimStart.x, aimStart.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 12 * Math.cos(a - 0.45), ey - 12 * Math.sin(a - 0.45));
      ctx.lineTo(ex - 12 * Math.cos(a + 0.45), ey - 12 * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const r of rings) {
      ctx.globalAlpha = r.t;
      ctx.strokeStyle = "#ffd782";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.px, r.py, r.r, 0, 6.29);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of dust) {
      ctx.globalAlpha = Math.max(0, p.t);
      ctx.fillStyle = "#ad9270";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };
  function launchBomb(px, py, vx = 0, vy = 0) {
    if (S.stock[S.selectedWeapon] < 1) {
      window.DeepworksUI.note(
        "No " +
          D.weapons[S.selectedWeapon].name +
          " in stock. Factory production is finite.",
      );
      return false;
    }
    S.stock[S.selectedWeapon]--;
    let w = D.weapons[S.selectedWeapon],
      specificRadius =
        S.selectedWeapon === "grenade"
          ? S.skills.grenadeRadius * 0.08
          : S.selectedWeapon === "sticky"
            ? S.skills.stickyRadius * 0.08
            : 0;
    bombs.push({
      px: Math.max(8, Math.min(W() - 8, px)),
      py: Math.max(8, Math.min(H() - 8, py)),
      vx,
      vy,
      angle: 0,
      fuseStarted: false,
      fuse: 3,
      r: w.radius * (1 + S.skills.blast * 0.1 + specificRadius),
      weapon: S.selectedWeapon,
    });
    window.DeepworksUI.note(
      w.name + " thrown. It explodes 3 seconds after first impact.",
    );
    scheduleFrame();
    updateUI();
    return true;
  }
  function drop(px, py = 8) {
    launchBomb(px, py, 0, 0);
  }
  // ---- bomb physics -------------------------------------------------------
  // A bomb is a circle of radius BOMB_R. Collision samples points around its
  // edge against the ground height map, so walls and slopes push it out along
  // the surface normal instead of snapping it on top of the ground.
  function collideGround(b) {
    let hit = null;
    for (let it = 0; it < 4; it++) {
      let best = 0,
        bn = null;
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6,
          x = b.px + Math.cos(a) * BOMB_R,
          y = b.py + Math.sin(a) * BOMB_R;
        if (x < 0 || x > W()) continue;
        const gy = surface(x);
        if (y <= gy) continue;
        const x0 = Math.max(0, x - 2),
          x1 = Math.min(W(), x + 2),
          m = (surface(x1) - surface(x0)) / Math.max(1, x1 - x0),
          len = Math.sqrt(1 + m * m),
          d = (y - gy) / len;
        if (d > best) {
          best = d;
          bn = { nx: m / len, ny: -1 / len };
        }
      }
      if (!bn) break;
      b.px += bn.nx * (best + 0.05);
      b.py += bn.ny * (best + 0.05);
      hit = bn;
    }
    return hit;
  }
  // Exposed ore pushes back along the average direction of all cells it touches.
  function collideOre(b) {
    let sx = 0,
      sy = 0,
      n = 0,
      minD = BOMB_R;
    for (const o of caches) {
      if (
        Math.abs(o.px - b.px) > o.rx + BOMB_R + 2 ||
        Math.abs(o.py - b.py) > o.ry + BOMB_R + 2
      )
        continue;
      for (const q of o.cells) {
        const dx = b.px - q[0];
        if (dx > BOMB_R || dx < -BOMB_R || q[1] > surface(q[0])) continue;
        const dy = b.py - q[1],
          d2 = dx * dx + dy * dy;
        if (d2 >= BOMB_R * BOMB_R) continue;
        const d = Math.sqrt(d2) || 0.01;
        sx += dx / d;
        sy += dy / d;
        n++;
        if (d < minD) minD = d;
      }
    }
    if (!n) return null;
    const len = Math.hypot(sx, sy);
    const nx = len > 0.001 ? sx / len : 0,
      ny = len > 0.001 ? sy / len : -1;
    b.px += nx * (BOMB_R - minD + 0.05);
    b.py += ny * (BOMB_R - minD + 0.05);
    return { nx, ny };
  }
  function stepBomb(b, ds) {
    b.vy += 0.34 * ds;
    b.px += b.vx * ds;
    b.py += b.vy * ds;
    const minX = BOMB_R,
      maxX = W() - BOMB_R;
    if (b.px < minX || b.px > maxX) {
      b.px = Math.max(minX, Math.min(maxX, b.px));
      b.vx *= -0.48;
    }
    if (b.py > H() - BOMB_R) {
      b.py = H() - BOMB_R;
      b.vy = 0;
    }
    const n = collideGround(b) || collideOre(b);
    if (!n) return;
    if (!b.fuseStarted) {
      b.fuseStarted = true;
      b.fuse = 3;
    }
    if (b.weapon === "sticky") {
      b.vx = 0;
      b.vy = 0;
      return;
    }
    const vn = b.vx * n.nx + b.vy * n.ny;
    if (vn < 0) {
      const bounce = vn < -1.6 ? 0.38 : 0; // tiny impacts just settle
      b.vx -= (1 + bounce) * vn * n.nx;
      b.vy -= (1 + bounce) * vn * n.ny;
      const tx_ = -n.ny,
        ty_ = n.nx,
        vt = b.vx * tx_ + b.vy * ty_,
        keep = Math.pow(vn < -1.6 ? 0.95 : 0.88, ds); // friction along the surface
      b.vx -= vt * (1 - keep) * tx_;
      b.vy -= vt * (1 - keep) * ty_;
    }
    // come to rest on gentle slopes instead of creeping forever
    if (n.ny < -0.6 && Math.hypot(b.vx, b.vy) < 0.45) {
      b.vx = 0;
      b.vy = 0;
    }
  }
  function splitDynamite(b, py) {
    blast({ ...b, r: b.r * 0.35, weapon: "dynamiteBurst" }, py);
    let count = 4 + Math.floor(S.skills.dynamiteShards / 2);
    for (let j = 0; j < count; j++) {
      let a = Math.PI / 4 + (j * Math.PI * 2) / count,
        speed = 5.2 + Math.random() * 1.8;
      bombs.push({
        px: b.px,
        py: py - 3,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1.2,
        angle: a,
        fuseStarted: true,
        fuse: 0.95,
        r: b.r * 0.58,
        weapon: "dynamiteShard",
      });
    }
  }
  let frameRunning = false,
    lastFrameAt = 0;
  function scheduleFrame() {
    if (!frameRunning) {
      frameRunning = true;
      lastFrameAt = 0;
      requestAnimationFrame(frame);
    }
  }
  let physAcc = 0;
  function frame(now) {
    let scale = lastFrameAt ? Math.min(3, (now - lastFrameAt) / 16.6667) : 1;
    lastFrameAt = now;
    let animate = false;
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].r += (rings[i].max || 64) * 0.1 * scale;
      rings[i].t -= 0.06 * scale;
      animate = true;
      if (rings[i].t <= 0) rings.splice(i, 1);
    }
    // fixed 120Hz physics, independent of the display's frame rate
    physAcc = Math.min(physAcc + scale, 3);
    while (physAcc >= STEP && bombs.length) {
      physAcc -= STEP;
      for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        // fast bombs are split into smaller sub-steps so they can't skip surfaces
        const sub = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * STEP) / 4));
        for (let k = 0; k < sub; k++) stepBomb(b, STEP / sub);
        b.angle += (b.vx / 8) * STEP;
        if (b.fuseStarted) {
          b.fuse -= STEP / 60;
          if (b.fuse <= 0) {
            // explode where the bomb actually is
            if (b.weapon === "dynamite") splitDynamite(b, b.py);
            else blast(b, b.py);
            bombs.splice(i, 1);
          }
        }
      }
    }
    if (!bombs.length) physAcc = 0;
    else animate = true;
    for (let i = dust.length - 1; i >= 0; i--) {
      let p = dust[i];
      p.x += p.vx * scale;
      p.y += p.vy * scale;
      p.vy += 0.16 * scale;
      p.t -= 0.022 * scale;
      animate = true;
      if (p.t <= 0) dust.splice(i, 1);
    }
    if (animate) {
      M.draw();
      requestAnimationFrame(frame);
    } else {
      frameRunning = false;
      lastFrameAt = 0;
    }
  }
  M.init = () => {
    let z = D.mineSave;
    if (z && Array.isArray(z.ground) && Array.isArray(z.caches)) {
      ground = z.ground;
      caches = z.caches.filter(
        (o) => o.cells && o.cells.length >= MIN_ORE_CELLS,
      );
      w0 = z.w || 0;
      h0 = z.h || 0;
    }
    resize();
    updateUI();
    const point = (e) => {
      let r = c.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * W()) / (r.width || W()),
        y: ((e.clientY - r.top) * H()) / (r.height || H()),
      };
    };
    c.addEventListener("pointermove", (e) => {
      let p = point(e);
      aimX = p.x;
      aimY = p.y;
      if (aimStart && e.pointerId === aimStart.id) {
        aimPointer = p;
        M.draw();
      }
    });
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      let p = point(e);
      aimX = p.x;
      aimY = p.y;
      aimStart = { ...p, id: e.pointerId };
      aimPointer = p;
      c.setPointerCapture(e.pointerId);
      M.draw();
    });
    c.addEventListener("pointerup", (e) => {
      if (!aimStart || e.pointerId !== aimStart.id) return;
      let start = aimStart,
        p = point(e),
        dx = p.x - start.x,
        dy = p.y - start.y,
        len = Math.hypot(dx, dy);
      aimStart = null;
      aimPointer = null;
      if (len < 7) drop(start.x, start.y);
      else {
        let speed = Math.min(150, len) * 0.08 * (1 + S.skills.throwForce * 0.1);
        launchBomb(start.x, start.y, (dx / len) * speed, (dy / len) * speed);
      }
      M.draw();
    });
    c.addEventListener("pointercancel", (e) => {
      if (aimStart && e.pointerId === aimStart.id) {
        aimStart = null;
        aimPointer = null;
        M.draw();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.code === "Space" &&
        document.getElementById("mining").classList.contains("active")
      ) {
        e.preventDefault();
        drop(aimX, aimY);
      }
    });
    document.getElementById("weapons").onclick = (e) => {
      let b = e.target.closest("[data-w]");
      if (b && S.stock[b.dataset.w] > 0) {
        S.selectedWeapon = b.dataset.w;
        updateUI();
      }
    };
    document.getElementById("resetMine").onclick = () => {
      makeWorld();
      updateUI();
      window.DeepworksUI.note(
        "Mining zone reset. Your ore cargo and factory are safe.",
      );
    };
    document.getElementById("advanceLevel").onclick = () => {
      if (S.digScore < goal()) return;
      S.digScore = 0;
      S.depth++;
      makeWorld();
      updateUI();
      window.DeepworksUI.note(
        "You descended to level " + (S.depth + 1) + ". New ores are rarer.",
      );
    };
  };
  M.updateUI = updateUI;
  M.resize = resize;
  M.saveData = () => ({ ground, caches, w: w0, h: h0 });
})();
