(() => {
  "use strict";
  const D = window.Deepworks,
    S = D.state,
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
  // ---- destructible terrain -----------------------------------------------
  // The ground is a 900x520 grid of 1px cells (0 air, 1 dirt, 2 rock, 3
  // bedrock, 4 gravel). Blasts remove every cell inside their circle, sideways
  // and overhead included, so tunnels, caves and overhangs all work. Each
  // level is ONE kind of ground (S.mineType). Dirt and gravel are loose and slide
  // when undermined (dirt holds slopes up to 45 degrees, gravel only ~20); rock
  // stays put but is harder to dig.
  const GW = 900,
    GH = 520,
    FLOOR_Y = Math.floor(GH * 0.96), // bedrock starts here and can't be dug
    ROCK_K = 0.62, // rock is only carved within 62% of a blast's radius
    DIRT = 1,
    ROCK = 2,
    BEDROCK = 3,
    GRAVEL = 4,
    REPOSE = 3, // gravel: a drop of 2+ cells over 3 columns slides, so piles settle near 20 degrees
    REPOSE_DIRT = 1; // dirt: a drop of 2+ cells over 1 column slides, so piles settle at 45 degrees
  const GROUND = { dirt: DIRT, gravel: GRAVEL, rock: ROCK };
  const GROUND_NAME = { dirt: "Dirt", gravel: "Gravel", rock: "Rock" };
  const isLoose = (m) => m === DIRT || m === GRAVEL;
  const grid = new Uint8Array(GW * GH),
    colorTex = new Uint32Array(GW * GH),
    groundX = new Float32Array(GW);
  let gridReady = false,
    rleCache = null,
    dirty = null;
  const inLoose = new Uint8Array(GW * GH), // gravel cells that may still move
    readyAt = new Float32Array(GW * GH);
  let loose = [],
    gravClock = 0,
    rowGravel = [],
    rowDirt = [];
  const cellCv = document.createElement("canvas"),
    cellCx = cellCv.getContext("2d");
  cellCv.width = GW;
  cellCv.height = GH;
  const cellImg = cellCx.createImageData(GW, GH),
    cell32 = new Uint32Array(cellImg.data.buffer);
  function markDirty(x0, y0, x1, y1) {
    terrainDirty = true; // any changed cell means the picture must be redrawn this frame
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(GW, Math.ceil(x1));
    y1 = Math.min(GH, Math.ceil(y1));
    if (!dirty) dirty = { x0, y0, x1, y1 };
    else {
      dirty.x0 = Math.min(dirty.x0, x0);
      dirty.y0 = Math.min(dirty.y0, y0);
      dirty.x1 = Math.max(dirty.x1, x1);
      dirty.y1 = Math.max(dirty.y1, y1);
    }
  }
  function solidAt(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (y >= GH) return true;
    if (y < 0 || x < 0 || x >= GW) return false;
    return grid[y * GW + x] !== 0;
  }
  const airAt = (x, y) =>
    x < 0 || x >= GW
      ? false
      : y < 0
        ? true
        : y >= GH
          ? false
          : grid[y * GW + x] === 0;

  function buildGrid() {
    grid.fill(0);
    for (let x = 0; x < GW; x++) {
      const g = surface(x);
      for (let y = Math.max(0, Math.ceil(g)); y < GH; y++) {
        let m = GROUND[S.mineType] || DIRT; // the whole level is one kind of ground
        if (y >= FLOOR_Y) m = BEDROCK;
        grid[y * GW + x] = m;
      }
    }
    gridReady = true;
    rleCache = null;
    loose = [];
    inLoose.fill(0);
    computeColors();
    markDirty(0, 0, GW, GH);
  }
  // Per-cell colours (depth gradient, strata lines, speckle) are derived, not saved.
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };
  const hexRGB = (c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const DIRT_STOPS = [
      [0, "#795b43"],
      [0.35, "#66503f"],
      [0.58, "#555157"],
      [0.8, "#414655"],
      [1, "#292f40"],
    ].map(([t, c]) => [t, hexRGB(c)]),
    ROCK_STOPS = [
      [0, "#767a82"],
      [1, "#4c515d"],
    ].map(([t, c]) => [t, hexRGB(c)]);
  function ramp(stops, t) {
    for (let i = 1; i < stops.length; i++)
      if (t <= stops[i][0] || i === stops.length - 1) {
        const [t0, a] = stops[i - 1],
          [t1, b] = stops[i],
          k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
        return [
          a[0] + (b[0] - a[0]) * k,
          a[1] + (b[1] - a[1]) * k,
          a[2] + (b[2] - a[2]) * k,
        ];
      }
  }
  const EDGE = {
    1: [180, 154, 112],
    2: [158, 164, 174],
    3: [70, 80, 98],
    4: [204, 192, 168],
  };
  const GRAVEL_STOPS = [
    [0, "#938a7a"],
    [1, "#6c675f"],
  ].map(([t, c]) => [t, hexRGB(c)]);
  // Dirt and gravel move, so their colour is computed from where they are, not stored.
  function dirtColor(x, y) {
    const n = hash(x, y),
      c = rowDirt[y],
      depth = y - groundX[x],
      k =
        ((n & 15) - 8) * 0.7 +
        ((n >>> 8) % 29 === 0 ? 14 : 0) -
        (depth % 80 < 2 && depth > 8 ? 10 : 0);
    return pack(c[0] + k, c[1] + k, c[2] + k);
  }
  // Gravel moves, so its colour is computed from where it is, not stored.
  function gravelColor(x, y) {
    const n = hash(x, y),
      c = rowGravel[y],
      k =
        ((n & 15) - 8) * 1.7 +
        ((n >>> 8) % 7 === 0 ? 34 : 0) -
        ((n >>> 12) % 9 === 0 ? 30 : 0);
    return pack(c[0] + k, c[1] + k, c[2] + k);
  }
  const pack = (r, g, b) =>
    (0xff000000 |
      (Math.max(0, Math.min(255, b)) << 16) |
      (Math.max(0, Math.min(255, g)) << 8) |
      Math.max(0, Math.min(255, r))) >>>
    0;
  function computeColors() {
    const b0 = base(),
      shift = Math.min(S.depth * 0.012, 0.2);
    for (let x = 0; x < GW; x++) groundX[x] = surface(x);
    const rowRock = [];
    rowGravel = [];
    rowDirt = [];
    for (let y = 0; y < GH; y++) {
      const t = Math.max(0, (y - b0) / (GH - b0)) + shift * 0.4;
      rowGravel.push(ramp(GRAVEL_STOPS, Math.min(1, t)));
      rowDirt.push(ramp(DIRT_STOPS, t));
      rowRock.push(ramp(ROCK_STOPS, Math.min(1, t)));
    }
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x,
          m = grid[i];
        if (!m) continue;
        const n = hash(x, y),
          v = (n & 15) - 8;
        let c, k;
        if (m === ROCK) {
          c = rowRock[y];
          k =
            v * 0.9 +
            ((n >>> 8) % 23 === 0 ? 26 : 0) -
            ((n >>> 14) % 61 === 0 ? 22 : 0);
        } else if (m === BEDROCK) {
          c = [38, 44, 58];
          k = v * 0.5;
        } else {
          c = rowDirt[y];
          const depth = y - groundX[x];
          k =
            v * 0.7 +
            ((n >>> 8) % 29 === 0 ? 14 : 0) -
            (depth % 80 < 2 && depth > 8 ? 10 : 0);
        }
        colorTex[i] = pack(c[0] + k, c[1] + k, c[2] + k);
      }
  }
  // Refresh the pixels of every cell touched since the last call.
  function flushCells() {
    if (!dirty) return;
    const { x0, y0, x1, y1 } = dirty;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * GW + x,
          m = grid[i];
        if (!m) {
          cell32[i] = 0;
          continue;
        }
        const edge =
          airAt(x - 1, y) ||
          airAt(x + 1, y) ||
          airAt(x, y - 1) ||
          airAt(x, y + 1) ||
          airAt(x, y - 2) ||
          airAt(x - 2, y) ||
          airAt(x + 2, y) ||
          airAt(x, y + 2);
        if (edge) {
          const e = EDGE[m];
          cell32[i] = pack(e[0], e[1], e[2]);
        } else
          cell32[i] =
            m === GRAVEL
              ? gravelColor(x, y)
              : m === DIRT
                ? dirtColor(x, y)
                : colorTex[i];
      }
    cellCx.putImageData(cellImg, 0, 0, x0, y0, x1 - x0, y1 - y0);
    dirty = null;
  }
  // Remove cells inside a circle. Dirt goes at full radius, rock at ROCK_K of it,
  // bedrock never. Returns how many cells were removed.
  function carve(cx, cy, r) {
    const x0 = Math.max(0, Math.floor(cx - r)),
      x1 = Math.min(GW - 1, Math.ceil(cx + r)),
      y0 = Math.max(0, Math.floor(cy - r)),
      y1 = Math.min(FLOOR_Y - 1, Math.ceil(cy + r)),
      rr = r * r,
      rk = rr * ROCK_K * ROCK_K;
    let removed = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * GW + x,
          m = grid[i];
        if (!m || m === BEDROCK) continue;
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= (m === ROCK ? rk : rr)) {
          grid[i] = 0;
          removed += m === ROCK ? 1 / (ROCK_K * ROCK_K) : 1; // rock is smaller per blast, so it counts for more
        }
      }
    if (removed) {
      markDirty(x0 - 3, y0 - 3, x1 + 4, y1 + 4);
      rleCache = null;
      // loose ground that lost its support (above or beside the hole) starts to slide
      wakeBox(x0 - 6, y0 - 90, x1 + 6, y1 + 2, 0.12, 0.5);
    }
    return removed;
  }
  // ---- loose ground (dirt and gravel) -----------------------------------------
  // Loose cells hold for a moment after losing support, then fall straight down
  // if the cell below is free, or slide sideways when the slope is steeper than
  // the material holds (gravel ~20 degrees, dirt 45). Settled piles keep that angle.
  function wake(i, delay, spread) {
    if (!isLoose(grid[i]) || inLoose[i]) return;
    inLoose[i] = 1;
    readyAt[i] = gravClock + delay + Math.random() * spread;
    loose.push(i);
  }
  function wakeBox(x0, y0, x1, y1, delay, spread) {
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(GW - 1, x1);
    y1 = Math.min(GH - 2, y1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) wake(y * GW + x, delay, spread);
  }
  function wakeUnstable() {
    for (let i = 0; i < GW * (GH - 1); i++)
      if (isLoose(grid[i]) && gravelMove(i) >= 0) wake(i, 0.1, 0.4);
  }
  // Where would the gravel cell at index i go? -1 if it stays.
  function gravelMove(i) {
    const x = i % GW,
      y = (i / GW) | 0;
    if (y + 1 >= GH) return -1;
    if (grid[i + GW] === 0) {
      // free fall, up to two cells per step so a slide has some speed
      return y + 2 < GH && grid[i + 2 * GW] === 0 ? i + 2 * GW : i + GW;
    }
    // Supported from below. It still hops sideways onto a free neighbour when
    // the surface R columns away is 2+ cells lower than this one: R = 3 for
    // gravel (piles settle near 20 degrees), R = 1 for dirt (45 degrees).
    const R = grid[i] === DIRT ? REPOSE_DIRT : REPOSE,
      d = Math.random() < 0.5 ? -1 : 1;
    for (const dir of [d, -d]) {
      const nx = x + dir * R;
      if (x + dir < 0 || x + dir >= GW || grid[i + dir] !== 0) continue;
      // steeper than 45 degrees always slides (this also fills narrow cracks);
      // shallower faces slide only past the material's own angle
      if (grid[i + GW + dir] === 0) return i + dir;
      if (nx < 0 || nx >= GW || grid[i + GW + dir * R] !== 0) continue;
      return i + dir;
    }
    return -1;
  }
  function stepGravel(dt) {
    if (!loose.length) return;
    gravClock += dt;
    let budget = 16000,
      next = [],
      bx0 = GW,
      by0 = GH,
      bx1 = 0,
      by1 = 0;
    const touch = (x, y) => {
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    };
    for (let n = 0; n < loose.length; n++) {
      const i = loose[n];
      if (budget-- <= 0) {
        next.push(i);
        continue;
      }
      if (!isLoose(grid[i])) {
        inLoose[i] = 0;
        continue;
      }
      if (gravClock < readyAt[i]) {
        next.push(i);
        continue;
      }
      // a cell can hop several times per frame, so slides finish in seconds
      let cur = i,
        moved = false;
      const mat = grid[i], // dirt or gravel: it keeps its material while it moves
        R = mat === DIRT ? REPOSE_DIRT : REPOSE;
      for (let hop = 0; hop < 8; hop++) {
        const j = gravelMove(cur);
        if (j < 0) break;
        grid[j] = mat;
        grid[cur] = 0;
        inLoose[cur] = 0;
        const cx = cur % GW,
          cy = (cur / GW) | 0,
          jx = j % GW,
          jy = (j / GW) | 0;
        touch(Math.min(cx, jx), Math.min(cy, jy));
        touch(Math.max(cx, jx), Math.max(cy, jy));
        // whatever rested on or beside the cell it left may now slide too
        // the cell above, the sides, and cells 3 columns away (their slope test reads this spot)
        for (const w of [
          cur - GW,
          cur - GW - 1,
          cur - GW + 1,
          cur - 1,
          cur + 1,
          cur - GW - R,
          cur - GW + R,
          cur - R,
          cur + R,
        ])
          if (w >= 0 && w < GW * GH) wake(w, 0, 0.03);
        cur = j;
        moved = true;
      }
      if (moved) {
        inLoose[cur] = 1;
        readyAt[cur] = gravClock;
        next.push(cur);
      } else inLoose[i] = 0; // supported: it stays
    }
    loose = next; // (cells woken during the loop were already visited above)
    if (bx1 >= bx0) {
      markDirty(bx0 - 3, by0 - 3, bx1 + 4, by1 + 4);
      rleCache = null;
    }
  }
  // Saved as run-length pairs [material, count, ...].
  function encodeGrid() {
    if (rleCache) return rleCache;
    const out = [];
    let prev = grid[0],
      run = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === prev) run++;
      else {
        out.push(prev, run);
        prev = grid[i];
        run = 1;
      }
    }
    out.push(prev, run);
    return (rleCache = out);
  }
  function decodeGrid(rle) {
    let total = 0;
    for (let k = 1; k < rle.length; k += 2) total += rle[k];
    if (total !== GW * GH) return false;
    let i = 0;
    for (let k = 0; k < rle.length; k += 2) {
      grid.fill(rle[k], i, i + rle[k + 1]);
      i += rle[k + 1];
    }
    rleCache = rle;
    return true;
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
    goo = [];
    terrainDirty = true;
    buildGrid();
    makeCaches();
  }
  function resize() {
    let nw = W(),
      nh = H(),
      d = Math.min(2, Math.max(1, D.Engine.scale * D.Engine.dpr));
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
    terrain.width = Math.round(nw * d);
    terrain.height = Math.round(nh * d);
    tx.setTransform(d, 0, 0, d, 0, 0);
    dpr = d;
    terrainDirty = true;
    if (!ground.length) makeWorld();
    else if (!gridReady) buildGrid(); // older save: build the grid from its surface
  }
  function countOre() {
    return Object.values(S.ore).reduce((a, b) => a + b, 0);
  }
  function goal() {
    return (420 + S.depth * 160) * 5;
  }
  function updateUI() {} // panels are drawn live by the scene
  // A blast carves a true circle out of the terrain, in every direction.
  function blast(b, py) {
    const rad = b.r / (1 + S.depth * 0.14);
    S.digScore += carve(b.px, py, rad) / 12;
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
    if (b.weapon === "sticky" && M.gooActive()) spawnGoo(b.px, py);
    for (const k of bombs)
      if (k.stuckOre && !caches.includes(k.stuckOre)) {
        k.stuckOre = null; // its ore is gone: it falls
        k.stuck = false;
      }
    shake = 7;
    rings.push({ px: b.px, py, r: 0, t: 1, max: rad });
    const dustN = Math.max(8, Math.round(26 * (D.Engine.fxScale ?? 1)));
    for (let i = 0; i < dustN; i++) {
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
    sp.ox = o.px;
    sp.oy = o.py;
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
  // ---- falling ore -----------------------------------------------------------
  // On dirt and gravel levels an ore chunk whose ground has slid or been blasted
  // away drops until it lands on something. On rock levels everything holds.
  const oreVel = new WeakMap();
  let oreCheck = 0,
    oreFalling = false;
  function oreSupported(o) {
    for (const q of o.cells) if (solidAt(q[0], q[1] + 2)) return true;
    return false;
  }
  function shiftOre(o, dy) {
    o.py += dy;
    for (const b of bombs) if (b.stuckOre === o) b.py += dy; // a sticky grenade follows its ore
    for (const v of o.verts) v[1] += dy;
    for (const q of o.cells) q[1] += dy;
    for (const c of o.cuts) c.py += dy;
  }
  function settleOre(frames) {
    if (S.mineType === "rock") return;
    oreCheck += frames;
    const look = oreCheck >= 6;
    if (look) oreCheck = 0;
    let any = false;
    for (const o of caches) {
      let v = oreVel.get(o) || 0;
      if (!v) {
        if (!look || !o.cells.length || oreSupported(o)) continue;
        v = 0.5;
      }
      v = Math.min(9, v + 0.34 * frames);
      let move = v * frames;
      while (move > 0) {
        const d = Math.min(1, move);
        shiftOre(o, d);
        move -= d;
        if (oreSupported(o)) {
          v = 0;
          break;
        }
      }
      oreVel.set(o, v);
      terrainDirty = true;
      any = any || v > 0;
    }
    oreFalling = any;
  }
  function paintVeins() {
    // Ore sits under the terrain layer: it shows only where dirt was carved away.
    const below = new Path2D();
    below.moveTo(0, H());
    for (let i = 0; i < ground.length; i++) below.lineTo(i * step, ground[i]);
    below.lineTo(W(), H());
    below.closePath();
    tx.save();
    tx.clip(below);
    for (const o of caches) {
      if (!o.cells.length) continue;
      const sp = oreSprite(o);
      tx.drawImage(
        sp.out,
        sp.bx + (o.px - sp.ox),
        sp.by + (o.py - sp.oy),
        sp.bw,
        sp.bh,
      );
    }
    tx.restore();
  }
  function renderTerrain() {
    const w = W(),
      h = H();
    flushCells();
    tx.clearRect(0, 0, w, h);
    let sky = tx.createLinearGradient(0, 0, 0, base());
    sky.addColorStop(0, "#45666a");
    sky.addColorStop(1, "#283b40");
    tx.fillStyle = sky;
    tx.fillRect(0, 0, w, h);
    paintVeins();
    tx.imageSmoothingEnabled = dpr > 1.05;
    tx.drawImage(cellCv, 0, 0, w, h);
  }
  M.drawWorld = (ctx) => {
    let w = W(),
      h = H();
    if (terrainDirty) {
      renderTerrain();
      terrainDirty = false;
    }
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
    for (const g of goo) {
      const stuck = g.state === "stuck",
        fade = stuck ? Math.min(1, g.life) : 1,
        r = stuck
          ? g.r * (0.6 + 0.4 * fade) * (0.94 + 0.06 * Math.sin(g.t * 9))
          : 5;
      ctx.globalAlpha = 0.92 * fade;
      ctx.fillStyle = "#5bd65c";
      ctx.strokeStyle = "#2c8a3a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, 6.29);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c8ffb0";
      ctx.beginPath();
      ctx.arc(g.x - r * 0.3, g.y - r * 0.3, r * 0.28, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
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
  // ---- placing a weapon ------------------------------------------------------------
  // A bomb needs a free gap around its start point: not inside dirt, gravel, rock
  // or ore, and not in a hole narrower than about 22px. Clicking within a few
  // pixels above the ground still works (it is nudged up out of the way).
  const PLACE_R = BOMB_R + 3;
  const placeRing = [[0, 0]];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    placeRing.push([Math.cos(a) * PLACE_R, Math.sin(a) * PLACE_R]);
    if (k % 2 === 0)
      placeRing.push([
        Math.cos(a) * PLACE_R * 0.5,
        Math.sin(a) * PLACE_R * 0.5,
      ]);
  }
  function roomAt(x, y) {
    for (const [dx, dy] of placeRing) {
      const px = x + dx,
        py = y + dy;
      if (py < 0 || px < 0 || px >= W()) continue; // above the top / off the side: open air
      if (py >= H() || solidAt(px, py)) return false;
    }
    for (const o of caches) {
      if (
        Math.abs(o.px - x) > o.rx + PLACE_R + 2 ||
        Math.abs(o.py - y) > o.ry + PLACE_R + 2
      )
        continue;
      for (const q of o.cells) {
        const dx = q[0] - x,
          dy = q[1] - y;
        if (dx * dx + dy * dy < PLACE_R * PLACE_R && !solidAt(q[0], q[1]))
          return false;
      }
    }
    return true;
  }
  // The spot a weapon would really start from, or null if there is no room there.
  function placeSpot(px, py) {
    px = Math.max(BOMB_R, Math.min(W() - BOMB_R, px));
    py = Math.max(BOMB_R, Math.min(H() - BOMB_R, py));
    for (const lift of [0, 2, 4, 6, 8, 10, 12])
      if (roomAt(px, py - lift))
        return { x: px, y: Math.max(BOMB_R, py - lift) };
    return null;
  }
  M.placeSpot = placeSpot;
  function launchBomb(px, py, vx = 0, vy = 0) {
    if (S.stock[S.selectedWeapon] < 1) {
      window.DeepworksUI.note(
        "No " +
          D.weapons[S.selectedWeapon].name +
          " in stock. Factory production is finite.",
      );
      return false;
    }
    const spot = placeSpot(px, py);
    if (!spot) {
      window.DeepworksUI.note(
        "No room to place it there. A bomb needs a free gap about 22 px wide, and it can't start inside dirt, gravel, rock or ore.",
      );
      return false;
    }
    px = spot.x;
    py = spot.y;
    S.stock[S.selectedWeapon]--;
    let w = D.weapons[S.selectedWeapon],
      specificRadius =
        S.selectedWeapon === "grenade"
          ? S.skills.grenadeRadius * 0.08
          : S.selectedWeapon === "sticky"
            ? S.skills.stickyRadius * 0.08
            : 0;
    const fuseTime = S.selectedWeapon === "dynamite" ? 5 : 3;
    bombs.push({
      px,
      py,
      vx,
      vy,
      angle: 0,
      fuseStarted: false,
      fuseTime,
      fuse: fuseTime,
      r: w.radius * (1 + S.skills.blast * 0.1 + specificRadius),
      weapon: S.selectedWeapon,
    });
    window.DeepworksUI.note(
      w.name +
        (S.selectedWeapon === "sticky"
          ? " thrown. It sticks wherever it lands, then explodes after 3 seconds" +
            (M.gooActive() ? " and bursts into goo." : ".")
          : " thrown. It explodes " +
            fuseTime +
            " seconds after first impact."),
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
    for (let it = 0; it < 30; it++) {
      let sx = 0,
        sy = 0,
        n = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8,
          x = b.px + Math.cos(a) * BOMB_R,
          y = b.py + Math.sin(a) * BOMB_R;
        if (solidAt(x, y)) {
          sx += b.px - x;
          sy += b.py - y;
          n++;
        }
      }
      if (!n) break;
      const len = Math.hypot(sx, sy),
        nx = len > 0.001 ? sx / len : 0,
        ny = len > 0.001 ? sy / len : -1,
        push = 0.35 + 0.12 * n;
      b.px += nx * push;
      b.py += ny * push;
      hit = { nx, ny };
    }
    return hit;
  }
  // Exposed ore pushes back along the average direction of all cells it touches.
  let lastOreHit = null; // the ore chunk the last collideOre() call touched
  function collideOre(b) {
    let sx = 0,
      sy = 0,
      n = 0,
      minD = BOMB_R,
      best = null;
    lastOreHit = null;
    for (const o of caches) {
      if (
        Math.abs(o.px - b.px) > o.rx + BOMB_R + 2 ||
        Math.abs(o.py - b.py) > o.ry + BOMB_R + 2
      )
        continue;
      for (const q of o.cells) {
        const dx = b.px - q[0];
        if (dx > BOMB_R || dx < -BOMB_R || solidAt(q[0], q[1])) continue;
        const dy = b.py - q[1],
          d2 = dx * dx + dy * dy;
        if (d2 >= BOMB_R * BOMB_R) continue;
        const d = Math.sqrt(d2) || 0.01;
        sx += dx / d;
        sy += dy / d;
        n++;
        if (d < minD) {
          minD = d;
          best = o;
        }
      }
    }
    if (!n) return null;
    lastOreHit = best;
    const len = Math.hypot(sx, sy);
    const nx = len > 0.001 ? sx / len : 0,
      ny = len > 0.001 ? sy / len : -1;
    b.px += nx * (BOMB_R - minD + 0.05);
    b.py += ny * (BOMB_R - minD + 0.05);
    return { nx, ny };
  }
  function stepBomb(b, ds) {
    if (b.stuck) return; // a stuck bomb never moves again (until its goo wears off or its ore is gone)
    for (const g of goo) {
      if (g.state !== "stuck") continue;
      const dx = b.px - g.x,
        dy = b.py - g.y,
        rr = g.r + BOMB_R;
      if (dx * dx + dy * dy < rr * rr) {
        b.stuck = true; // touched goo: stuck to it
        b.gooBlob = g;
        b.vx = b.vy = 0;
        if (!b.fuseStarted) {
          b.fuseStarted = true;
          b.fuse = b.fuseTime || 3;
        }
        return;
      }
    }
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
    const onGround = collideGround(b),
      n = onGround || collideOre(b);
    if (!n) return;
    if (!b.fuseStarted) {
      b.fuseStarted = true;
      b.fuse = b.fuseTime || 3;
    }
    if (b.weapon === "sticky") {
      b.vx = 0;
      b.vy = 0;
      b.stuck = true;
      if (!onGround && lastOreHit) b.stuckOre = lastOreHit; // rides along if that ore falls
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
  // ---- sticky goo ----------------------------------------------------------------
  // With the Sticky goo upgrade on, an exploding sticky grenade throws blobs of
  // goo in random directions. Each flies until it touches a surface, then sticks
  // there for 5 seconds; any other weapon that touches a stuck blob sticks to it.
  const GOO_LIFE = 5,
    GOO_R = 10;
  let goo = [];
  M.gooActive = () =>
    (S.skills.stickyGoo || 0) > 0 &&
    !(S.settings && S.settings.gooOn === false);
  function gooBlocked(x, y) {
    if (x < 0 || x >= W() || y >= H()) return true;
    if (y < 0) return false;
    if (solidAt(x, y)) return true;
    for (const o of caches) {
      if (Math.abs(o.px - x) > o.rx + 3 || Math.abs(o.py - y) > o.ry + 3)
        continue;
      for (const q of o.cells) {
        const dx = q[0] - x,
          dy = q[1] - y;
        if (dx * dx + dy * dy <= 5 && !solidAt(q[0], q[1])) return true;
      }
    }
    return false;
  }
  function spawnGoo(x, y) {
    const n = 5 + (S.skills.stickyGoo || 0) * 2;
    for (let i = 0; i < n && goo.length < 40; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 3 + Math.random() * 5;
      goo.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        state: "fly",
        life: GOO_LIFE,
        r: GOO_R * (0.85 + Math.random() * 0.3),
        t: 0,
      });
    }
  }
  function releaseGoo(g) {
    for (const b of bombs)
      if (b.gooBlob === g) {
        b.gooBlob = null;
        b.stuck = false; // the goo let go: it falls
      }
  }
  function updateGoo(frames) {
    for (let i = goo.length - 1; i >= 0; i--) {
      const g = goo[i];
      g.t += frames / 60;
      if (g.state === "fly") {
        const n = Math.max(1, Math.ceil((Math.hypot(g.vx, g.vy) * frames) / 3)),
          ds = frames / n;
        for (let k = 0; k < n; k++) {
          const px = g.x,
            py = g.y;
          g.vy += 0.2 * ds;
          g.x += g.vx * ds;
          g.y += g.vy * ds;
          if (gooBlocked(g.x, g.y)) {
            g.x = px;
            g.y = py;
            g.state = "stuck"; // touched a surface
            g.vx = g.vy = 0;
            break;
          }
        }
        if (g.y > H() + 30) goo.splice(i, 1);
      } else {
        g.life -= frames / 60;
        if (g.life <= 0) {
          releaseGoo(g);
          goo.splice(i, 1);
        }
      }
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
  function scheduleFrame() {}
  let physAcc = 0;
  // Advance bombs / effects by `frames` 60Hz-frames (real time * 60).
  M.update = (frames) => {
    const scale = Math.min(3, frames);
    stepGravel(scale / 60);
    settleOre(scale);
    updateGoo(scale);
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
  };
  function unpackOre(o) {
    if (!o.cells10) return o; // older save: cells already stored as pairs
    const { cells10, ...rest } = o,
      cells = [];
    for (let i = 0; i + 1 < cells10.length; i += 2)
      cells.push([cells10[i] / 10, cells10[i + 1] / 10]);
    return { ...rest, cells };
  }
  M.init = () => {
    let z = D.mineSave;
    if (z && Array.isArray(z.ground) && Array.isArray(z.caches)) {
      ground = z.ground;
      caches = z.caches
        .map(unpackOre)
        .filter((o) => o.cells && o.cells.length >= MIN_ORE_CELLS);
      w0 = z.w || 0;
      h0 = z.h || 0;
      if (
        Array.isArray(z.grid) &&
        w0 === GW &&
        h0 === GH &&
        decodeGrid(z.grid)
      ) {
        gridReady = true;
        computeColors();
        markDirty(0, 0, GW, GH);
        wakeUnstable(); // gravel that was mid-slide when the game was saved
      }
    }
    resize();
    D.Engine.onResize.push(resize);
  };
  // Pointer input arrives in world coordinates (the scene subtracts its origin).
  M.pointerDown = (x, y) => {
    aimX = x;
    aimY = y;
    aimStart = { x, y };
    aimPointer = { x, y };
  };
  M.pointerMove = (x, y) => {
    aimX = x;
    aimY = y;
    if (aimStart) aimPointer = { x, y };
  };
  M.pointerUp = (x, y, ok) => {
    if (!aimStart) return;
    const start = aimStart;
    aimStart = null;
    aimPointer = null;
    if (!ok) return;
    const dx = x - start.x,
      dy = y - start.y,
      len = Math.hypot(dx, dy);
    if (len < 7) drop(start.x, start.y);
    else {
      const speed = Math.min(150, len) * 0.08 * (1 + S.skills.throwForce * 0.1);
      launchBomb(start.x, start.y, (dx / len) * speed, (dy / len) * speed);
    }
  };
  M.drop = () => drop(aimX, aimY);
  M.aiming = () => !!aimStart;
  M.selectWeapon = (k) => {
    if (S.stock[k] > 0) S.selectedWeapon = k;
  };
  M.resetWorld = () => {
    makeWorld();
    window.DeepworksUI.note(
      "Mining zone reset. Your ore cargo and factory are safe.",
    );
  };
  M.advance = () => {
    if (S.digScore < goal()) return false;
    S.digScore = 0;
    S.depth++;
    // every level is a single kind of ground, never the same one twice in a row
    const others = Object.keys(GROUND).filter((t) => t !== S.mineType);
    S.mineType = others[Math.floor(Math.random() * others.length)];
    makeWorld();
    window.DeepworksUI.note(
      "You descended to level " +
        (S.depth + 1) +
        ": " +
        GROUND_NAME[S.mineType].toLowerCase() +
        " ground. New ores are rarer.",
    );
    return true;
  };
  M.goal = goal;
  // true while anything in the mine is still moving (used to pick a safe moment to refresh)
  M.busy = () =>
    bombs.length > 0 || loose.length > 0 || oreFalling || goo.length > 0;
  M.groundName = () => GROUND_NAME[S.mineType] || "Dirt";
  M.W = W;
  M.H = H;
  M.updateUI = updateUI;
  M.resize = resize;
  // Ore cells are saved as a flat list of tenths of a pixel to keep the save small.
  const packOre = (o) => {
    const { cells, ...rest } = o,
      flat = new Array(cells.length * 2);
    for (let i = 0; i < cells.length; i++) {
      flat[i * 2] = Math.round(cells[i][0] * 10);
      flat[i * 2 + 1] = Math.round(cells[i][1] * 10);
    }
    return { ...rest, cells10: flat };
  };
  M.saveData = () => ({
    ground,
    caches: caches.map(packOre),
    grid: encodeGrid(),
    w: w0,
    h: h0,
  });
})();
