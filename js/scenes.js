// Scenes: everything the player sees, drawn on the canvas.
(() => {
  "use strict";
  const D = window.Deepworks,
    S = D.state,
    E = D.Engine,
    UI = D.UI,
    M = D.Mining,
    F = D.Factory,
    H = F.h,
    input = E.input;
  const Scenes = (D.Scenes = {});
  Scenes.current = "mining";
  let introOpen = true;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => 1 - (1 - k) * (1 - k);
  const GOLD = "#ffd36b",
    MINT = "#6fe0b0",
    DIM = "#9fb9b1";

  // ---- layout --------------------------------------------------------------
  const WX = 16,
    WY = 72; // mining world origin on screen (world is 900x520)
  const SIDE = { x: 932, y: 72, w: 332, h: 600 };
  const TOWER = { x: 16, y: 72, w: 900, h: 600 };
  const ROW_H = 190,
    ROW_SCALE = 1.3; // machines are drawn a bit larger than their logic size

  // ---- shared drawing ------------------------------------------------------
  function background(g) {
    const bg = g.createLinearGradient(0, 0, 0, E.VH);
    bg.addColorStop(0, "#112127");
    bg.addColorStop(1, "#0a1215");
    g.fillStyle = bg;
    g.fillRect(0, 0, E.VW, E.VH);
  }
  function pill(g, x, y, w, label, value, color) {
    UI.panel(g, x, y, w, 38, { fill: "#101c20", stroke: "#2c4549", r: 19 });
    E.text(g, label, x + 16, y + 19, { size: 11, weight: 700, color: DIM });
    E.text(g, value, x + w - 16, y + 19, {
      size: 17,
      weight: 900,
      color,
      align: "right",
    });
  }
  const TABS = [
    { id: "mining", icon: "⛏", label: "Mining" },
    { id: "factory", icon: "🏭", label: "Factory" },
    { id: "upgrades", icon: "⬆", label: "Upgrades" },
  ];
  function topBar(g) {
    g.fillStyle = "#0b1518";
    g.fillRect(0, 0, E.VW, 60);
    g.fillStyle = "#24393c";
    g.fillRect(0, 59, E.VW, 2);
    E.text(g, "DEEP CORE", 22, 24, { size: 24, weight: 900, color: GOLD });
    E.text(g, "MINE & BUILD", 24, 45, { size: 11, weight: 800, color: DIM });
    TABS.forEach((t, i) => {
      if (
        UI.button(g, "tab" + t.id, 236 + i * 150, 10, 142, 40, t.label, {
          icon: t.icon,
          iconSize: 18,
          align: "left",
          active: Scenes.current === t.id,
          size: 15,
        })
      )
        Scenes.go(t.id);
    });
    const stock = Object.values(S.stock).reduce((a, b) => a + b, 0);
    pill(g, 710, 11, 168, "CREDITS", "¢" + Math.floor(S.money), GOLD);
    pill(g, 890, 11, 150, "LEVEL", S.depth + 1, MINT);
    pill(g, 1052, 11, 200, "WEAPONS", stock, "#ff9a4d");
  }
  function messageBar(g) {
    UI.panel(g, 16, 682, 1248, 32, {
      fill: "#0d1a1d",
      stroke: "#2a4245",
      r: 8,
    });
    const fresh = clamp(1 - UI.noteAge() / 0.6, 0, 1);
    E.text(g, "›", 30, 698, { size: 16, weight: 900, color: GOLD });
    E.text(g, UI.noteText(), 48, 698, {
      size: 13.5,
      weight: 600,
      color: fresh > 0 ? "#fff3c4" : "#cfe0da",
      maxW: 1200,
    });
  }
  Scenes.go = (id) => {
    Scenes.current = id;
  };

  // ---- mining --------------------------------------------------------------
  function drawMining(g) {
    // world frame
    UI.panel(g, WX - 4, WY - 4, 908, 528, {
      fill: "#08110f",
      stroke: "#35565a",
      r: 12,
      lw: 2,
    });
    g.save();
    g.translate(WX, WY);
    g.beginPath();
    E.rr(g, 0, 0, 900, 520, 8);
    g.clip();
    M.drawWorld(g);
    const hover =
      !UI.blocked &&
      !input.touch &&
      input.x >= WX &&
      input.x <= WX + 900 &&
      input.y >= WY &&
      input.y <= WY + 520;
    if (hover && !M.aiming()) {
      const ax = clamp(input.x - WX, 8, 892);
      g.strokeStyle = "rgba(255,226,138,.35)";
      g.lineWidth = 2;
      g.setLineDash([5, 6]);
      g.beginPath();
      g.moveTo(ax, 0);
      g.lineTo(ax, clamp(input.y - WY, 8, 512));
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();

    // side panel
    const x = SIDE.x,
      w = SIDE.w;
    UI.panel(g, x, SIDE.y - 4, w, 528);
    E.text(g, "WEAPONS", x + 16, 92, { size: 12, weight: 800, color: DIM });
    Object.keys(D.weapons).forEach((k, i) => {
      const wp = D.weapons[k],
        recipe = Object.entries(wp.recipe)
          .filter(([r]) => r !== "seconds")
          .map(([r, n]) => n + " " + (r === "grenade" ? "hand grenade" : r))
          .join(" + ");
      if (
        UI.button(g, "w" + k, x + 12, 104 + i * 52, w - 24, 46, wp.name, {
          icon: wp.icon,
          align: "left",
          sub: "In stock: " + S.stock[k],
          active: S.selectedWeapon === k,
          disabled: S.stock[k] < 1,
          tip: wp.name + " · Recipe: " + recipe,
        })
      )
        M.selectWeapon(k);
    });
    E.text(g, "ORE CARGO", x + 16, 324, { size: 12, weight: 800, color: DIM });
    D.ores.forEach((o, i) => {
      const y = 346 + i * 26;
      g.fillStyle = o.color;
      g.beginPath();
      g.arc(x + 24, y, 6, 0, 6.29);
      g.fill();
      E.text(g, o.name + " · ¢" + o.value, x + 40, y, {
        size: 13,
        weight: 600,
      });
      E.text(g, S.ore[o.id], x + w - 18, y, {
        size: 14,
        weight: 900,
        align: "right",
      });
      if (UI.over(x + 12, y - 12, w - 24, 24))
        UI.tip(
          o.name +
            " is used to craft factory parts and sells for " +
            o.value +
            " credits per unit.",
        );
    });
    const goal = M.goal();
    E.text(
      g,
      "LEVEL " +
        (S.depth + 1) +
        " · " +
        M.groundName().toUpperCase() +
        " GROUND",
      x + 16,
      462,
      {
        size: 12,
        weight: 800,
        color: DIM,
      },
    );
    UI.bar(g, x + 16, 474, w - 32, 12, S.digScore / goal);
    E.text(
      g,
      Math.floor(S.digScore) + " / " + goal + " ground cleared for next level",
      x + 16,
      500,
      { size: 11.5, weight: 500, color: DIM, maxW: w - 32 },
    );
    if (
      UI.button(
        g,
        "advance",
        x + 12,
        516,
        w - 24,
        34,
        "Descend to next level",
        { disabled: S.digScore < goal, fill: "#2b4a2f" },
      )
    )
      M.advance();
    if (
      UI.button(g, "resetMine", x + 12, 556, w - 24, 30, "Reset mining zone", {
        size: 13,
        tip: "Rebuild this level. Your ore cargo and factory are safe.",
      })
    )
      M.resetWorld();

    // hints + reset
    E.text(
      g,
      "Click: drop a bomb at the cursor    ·    Drag and release: throw (longer drag = faster)    ·    Space: drop",
      WX,
      612,
      { size: 13, weight: 500, color: DIM, maxW: 900 },
    );
    E.text(
      g,
      "Bombs explode 3 s after first impact (dynamite 5 s). Sticky grenades stay where they land.",
      WX,
      634,
      { size: 13, weight: 500, color: "#7f9a93", maxW: 900 },
    );
    E.text(
      g,
      "Each level is one kind of ground. Dirt slides when steeper than 45°, gravel when steeper than 20°, rock holds but is harder to dig.",
      WX,
      656,
      { size: 13, weight: 500, color: "#7f9a93", maxW: 900 },
    );
    if (
      UI.button(
        g,
        "resetData",
        SIDE.x + 12,
        640,
        w - 24,
        30,
        "Reset all game data",
        { size: 12, fill: "#3a2224", stroke: "#6b3b3d" },
      )
    ) {
      if (
        window.confirm(
          "Reset all game data? This erases your factory, resources, weapons, skills, and mining progress.",
        )
      ) {
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
        D.noSave = true;
        location.reload();
      }
    }
  }

  // ---- factory -------------------------------------------------------------
  const CAT = {
    gen: ["#1b3a31", "#4fbf94"],
    ctor: ["#40291f", "#e08a4a"],
    deposit: ["#1c3045", "#5aa5e0"],
    seller: ["#3c3320", "#e0bf55"],
  };
  const catOf = (t) =>
    t.endsWith("Gen") ? "gen" : t.endsWith("Ctor") ? "ctor" : t;
  const slotAnim = new Map(), // "fi_si" -> {emit, receive} seconds left
    sparkAcc = new Map(),
    rowFx = [],
    born = new Map();
  const fxFor = (fi) => rowFx[fi] || (rowFx[fi] = UI.makeFx());
  const slotCenter = (si) => si * H.PITCH + H.BAY / 2;
  F.onFx = (fi, si, cls) => {
    const k = fi + "_" + si,
      a = slotAnim.get(k) || { emit: 0, receive: 0 };
    a[cls] = cls === "emit" ? 0.36 : 0.3;
    slotAnim.set(k, a);
  };
  F.onFloat = (fi, si, text) => fxFor(fi).float(slotCenter(si), 36, text, GOLD);
  // A truck leaves the seller's bay with the goods every time something sells.
  const trucks = [];
  F.onSale = (fi, si) => {
    if (trucks.length < 8)
      trucks.push({ fi, x: slotCenter(si), t: 0, puff: 0 });
  };
  function updateTrucks(dt) {
    for (let i = trucks.length - 1; i >= 0; i--) {
      const k = trucks[i],
        f = S.floors[k.fi];
      k.t += dt;
      k.x += (50 + 330 * Math.min(1, k.t / 1.2)) * dt; // pulls away, then speeds up
      k.puff += dt;
      if (k.puff > 0.09 && !E.reduced) {
        k.puff = 0;
        fxFor(k.fi).puff(k.x - 16, 122);
      }
      if (!f || k.x > f.slots.length * H.PITCH + 90) trucks.splice(i, 1);
    }
  }
  function drawTruck(g, k) {
    const f = S.floors[k.fi],
      end = (f ? f.slots.length : 6) * H.PITCH + 90,
      bob = Math.sin(k.t * 28) * 0.8,
      a = clamp(Math.min(k.t / 0.15, (end - k.x) / 60), 0, 1);
    g.save();
    g.globalAlpha = a;
    g.translate(k.x, 107 + bob);
    g.scale(-1, 1); // the emoji faces left; the truck drives right
    E.text(g, "🚚", 0, 0, { size: 28, weight: 400, align: "center" });
    g.restore();
  }

  function drawPacket(g, p, y) {
    if (!born.has(p.id)) born.set(p.id, E.time);
    const age = clamp((E.time - born.get(p.id)) / 0.18, 0, 1);
    let sc = 0.3 + 0.7 * ease(age),
      alpha = age,
      py = y + Math.sin(E.time * 11 + p.id) * 1.4;
    const k = clamp((p.timer || 0) / 0.28, 0, 1);
    if (p.phase === "pull") {
      py -= 22 * k;
      sc *= 1 - 0.75 * k;
      alpha *= 1 - k * 0.6;
    } else if (p.phase === "burn") {
      sc *= 1 + 0.6 * k;
      alpha *= 1 - k;
    }
    g.save();
    g.globalAlpha = clamp(alpha, 0, 1);
    g.translate(p.x, py);
    g.scale(sc, sc);
    if (p.kind === "weapon" || D.weapons[p.kind]) {
      g.shadowColor = "#ffb277";
      g.shadowBlur = 10;
      E.text(g, H.packetLabel(p), 0, 0, {
        size: 17,
        weight: 400,
        align: "center",
      });
    } else {
      const col =
        p.kind === "iron"
          ? "#9bd6e5"
          : p.kind === "fuel"
            ? "#ff9a4d"
            : "#9be8a5";
      E.rr(g, -11, -9, 22, 18, 5);
      g.fillStyle = col;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(0,0,0,.45)";
      g.stroke();
      E.text(g, H.packetLabel(p), 0, 0.5, {
        size: 10.5,
        weight: 900,
        color: "#10201c",
        align: "center",
      });
    }
    g.restore();
  }

  function drawSlot(g, fi, si, m, selected) {
    const x = si * H.PITCH,
      y = 40,
      w = H.BAY,
      h = 70,
      t = H.type(m),
      key = fi + "_" + si,
      a = slotAnim.get(key),
      cx = x + w / 2,
      cy = y + h / 2;
    const placing = !!S.selectedPart && !t;
    if (!t) {
      E.rr(g, x, y, w, h, 10);
      g.fillStyle = "rgba(255,255,255,.03)";
      g.fill();
      g.setLineDash([6, 5]);
      g.lineWidth = placing ? 2.5 : 1.5;
      g.strokeStyle = placing
        ? "rgba(255,226,138," + (0.45 + 0.4 * Math.sin(E.time * 6)) + ")"
        : "#314b4e";
      g.stroke();
      g.setLineDash([]);
      E.text(g, "＋", cx, cy - 4, {
        size: 24,
        weight: 400,
        color: placing ? GOLD : "#3d5a5c",
        align: "center",
      });
      E.text(g, "Empty bay", cx, y + h - 11, {
        size: 9.5,
        weight: 600,
        color: "#4f6b6d",
        align: "center",
      });
      return;
    }
    const [fill, edge] = CAT[catOf(t)],
      info = F.hudInfo(m, t),
      p = D.parts[t];
    let sc = 1;
    if (a) {
      if (a.emit > 0) sc *= 1 + 0.09 * Math.sin((1 - a.emit / 0.36) * Math.PI);
      if (a.receive > 0)
        sc *= 1 - 0.06 * Math.sin((1 - a.receive / 0.3) * Math.PI);
    }
    g.save();
    g.translate(cx, cy);
    g.scale(sc, sc);
    g.translate(-cx, -cy);
    E.rr(g, x, y, w, h, 10);
    g.fillStyle = fill;
    g.fill();
    if (a && a.emit > 0) {
      g.fillStyle = "rgba(255,224,131," + 0.28 * (a.emit / 0.36) + ")";
      g.fill();
    }
    if (a && a.receive > 0) {
      g.fillStyle = "rgba(255,255,255," + 0.22 * (a.receive / 0.3) + ")";
      g.fill();
    }
    g.lineWidth = selected ? 3 : m.working ? 2.4 : 1.6;
    g.strokeStyle = selected ? GOLD : m.working ? "#ffd36b" : edge;
    g.stroke();
    // icon (wobbles while working, dims when a generator is full)
    g.save();
    g.translate(cx, cy - 6);
    if (m.working) g.rotate(Math.sin(E.time * 7) * 0.1);
    g.globalAlpha = info && info.full ? 0.5 : 1;
    const pulse = m.working ? 1 + 0.06 * Math.sin(E.time * 14) : 1;
    g.scale(pulse, pulse);
    E.text(g, p.icon, 0, 0, { size: 30, weight: 400, align: "center" });
    g.restore();
    E.text(g, p.name, cx, y + h - 11, {
      size: 9.5,
      weight: 700,
      color: "#d6e6e0",
      align: "center",
      maxW: w - 8,
      minSize: 6.5,
    });
    g.restore();

    // readout above the machine
    if (info) {
      E.text(g, info.label, cx, 9, {
        size: 10,
        weight: 800,
        color: "#cfe5da",
        align: "center",
        maxW: H.PITCH - 8,
        minSize: 6.5,
      });
      if (info.sub) {
        E.text(g, info.sub, cx, 23, {
          size: 9.5,
          weight: 700,
          color: "#9fd3c0",
          align: "center",
          maxW: H.PITCH - 8,
          minSize: 6.5,
        });
        E.text(g, info.text, cx, 35, {
          size: 9.5,
          weight: 600,
          color: DIM,
          align: "center",
        });
      } else {
        UI.bar(g, x + 3, 18, w - 6, 7, info.progress, {
          color: info.noInput ? "#a65246" : info.full ? "#c9a24a" : "#6fe0b0",
        });
        if (info.text)
          E.text(g, info.text, cx, 35, {
            size: 9.5,
            weight: 700,
            color: info.noInput ? "#e08a7c" : "#b8d4ca",
            align: "center",
          });
      }
    }
    // sparks + steam while a constructor works
    if (m.working && !E.reduced) {
      const acc = (sparkAcc.get(key) || 0) + E.dt;
      if (acc > 0.07) {
        const f = fxFor(fi);
        f.spark(cx + (Math.random() - 0.5) * 30, y + 14);
        if (Math.random() < 0.3) f.puff(cx + (Math.random() - 0.5) * 20, y + 6);
        sparkAcc.set(key, 0);
      } else sparkAcc.set(key, acc);
    }
  }

  function drawRow(g, f, fi, y0) {
    const len = f.slots.length,
      sc = Math.min(ROW_SCALE, 776 / (len * H.PITCH + 48)),
      active = H.activeLine(f);
    UI.panel(g, TOWER.x + 8, y0, TOWER.w - 16, ROW_H - 8, {
      fill: "#101c20",
      stroke: S.selectedFloor === fi ? "#6a8f66" : "#243a3d",
      r: 12,
    });
    if (
      UI.button(
        g,
        "floor" + fi,
        TOWER.x + 18,
        y0 + 10,
        64,
        ROW_H - 28,
        String(fi + 1),
        {
          sub: "FLOOR",
          size: 26,
          subSize: 11,
          active: S.selectedFloor === fi,
          tip: "Select floor " + (fi + 1) + " for placement",
        },
      )
    )
      S.selectedFloor = fi;
    UI.pushXf(g, TOWER.x + 96, y0 + 4, sc);
    // conveyor rail
    const railW = len * H.PITCH + 8;
    E.rr(g, -4, 114, railW, 12, 6);
    g.fillStyle = "#26363a";
    g.fill();
    g.save();
    E.rr(g, -4, 114, railW, 12, 6);
    g.clip();
    const off = active ? (E.time * H.SPEED) % 35 : 0;
    g.fillStyle = active ? "#6f8a7e" : "#3a4d50";
    for (let x = -35 + off; x < railW; x += 35) g.fillRect(x, 114, 12, 12);
    g.restore();
    if (active)
      E.text(g, "MATERIALS →", railW - 14, 133, {
        size: 9,
        weight: 800,
        color: "#7fa293",
        align: "right",
      });
    // machines
    f.slots.forEach((m, si) => {
      const sel =
        !!S.selectedModule &&
        S.selectedModule.fi === fi &&
        S.selectedModule.si === si;
      drawSlot(g, fi, si, m, sel);
      const x = si * H.PITCH;
      const t = H.type(m);
      if (UI.over(x, 40, H.BAY, 70)) {
        UI.hovering = true;
        UI.tip(
          t
            ? D.parts[t].detail
            : "Empty bay. Select a factory part, then tap this bay to place it.",
        );
      }
      if (UI.clickedIn(x, 40, H.BAY, 70)) F.tapSlot(fi, si);
    });
    // packets ride the rail
    for (const p of S.packets) if (p.fi === fi) drawPacket(g, p, 120);
    for (const k of trucks) if (k.fi === fi) drawTruck(g, k);
    // extend button
    const ext = !H.canPay(F.EXTEND_COST);
    if (
      UI.button(g, "ext" + fi, len * H.PITCH + 2, 40, 38, 70, "＋", {
        size: 22,
        disabled: ext,
        tip: "Extend this floor · " + H.costText(F.EXTEND_COST),
      })
    )
      F.tapExtend(fi);
    fxFor(fi).draw(g);
    UI.popXf(g);
  }

  function drawFactory(g) {
    UI.panel(g, TOWER.x, TOWER.y - 4, TOWER.w, TOWER.h + 4, {
      fill: "#0c161a",
      stroke: "#2a4245",
      r: 14,
    });
    const contentH = 16 + S.floors.length * ROW_H + 60;
    const sy = UI.scrollBegin(
      g,
      "tower",
      TOWER.x,
      TOWER.y,
      TOWER.w,
      TOWER.h - 2,
      contentH,
    );
    S.floors.forEach((f, fi) => {
      const y0 = TOWER.y + 8 + fi * ROW_H;
      if (y0 + ROW_H < TOWER.y + sy || y0 > TOWER.y + sy + TOWER.h) return; // off screen: skip drawing
      drawRow(g, f, fi, y0);
    });
    const ay = TOWER.y + 8 + S.floors.length * ROW_H;
    if (
      UI.button(
        g,
        "addFloorTower",
        TOWER.x + 8,
        ay,
        TOWER.w - 16,
        44,
        "＋  Add floor · " + H.costText(F.FLOOR_COST),
        {
          disabled: !H.canPay(F.FLOOR_COST),
          size: 15,
          fill: "#14262a",
          stroke: "#2f4d50",
        },
      )
    )
      F.addFloor();
    UI.scrollEnd(g);

    // parts panel
    const x = SIDE.x,
      w = SIDE.w;
    UI.panel(g, x, SIDE.y - 4, w, SIDE.h + 4);
    E.text(g, "FACTORY PARTS", x + 16, 90, {
      size: 12,
      weight: 800,
      color: DIM,
    });
    Object.keys(D.parts).forEach((k, i) => {
      const p = D.parts[k],
        stored = S.partInventory[k] || 0,
        afford = stored > 0 || H.canPay(p.cost);
      if (
        UI.button(g, "part" + k, x + 10, 102 + i * 42, w - 20, 38, p.name, {
          icon: p.icon,
          iconSize: 18,
          align: "left",
          size: 12.5,
          sub: "Stored " + stored + " · Craft: " + H.costText(p.cost),
          subSize: 10.5,
          active: S.selectedPart === k,
          activeFill: "#4a3d1d",
          activeStroke: GOLD,
          subColor: afford ? "#9fd3c0" : "#c98b80",
          tip: p.detail + " · Cost: " + H.costText(p.cost),
        })
      )
        F.selectPart(k);
    });
    E.text(g, "SEND FINISHED WEAPONS TO", x + 16, 494, {
      size: 11,
      weight: 800,
      color: DIM,
    });
    const hasDep =
        F.h.type &&
        S.floors.some((f) => f.slots.some((s) => H.type(s) === "deposit")),
      hasSel = S.floors.some((f) =>
        f.slots.some((s) => H.type(s) === "seller"),
      );
    if (
      UI.button(g, "routeStock", x + 10, 504, (w - 28) / 2, 32, "Deposit", {
        icon: "📦",
        iconSize: 15,
        align: "left",
        active: S.route === "stock",
        disabled: !hasDep,
        size: 13,
      })
    )
      F.setRoute("stock");
    if (
      UI.button(
        g,
        "routeSell",
        x + 18 + (w - 28) / 2,
        504,
        (w - 28) / 2,
        32,
        "Seller",
        {
          icon: "💰",
          iconSize: 15,
          align: "left",
          active: S.route === "sell",
          disabled: !hasSel,
          size: 13,
        },
      )
    )
      F.setRoute("sell");
    if (
      UI.button(
        g,
        "addFloor",
        x + 10,
        544,
        w - 20,
        32,
        "Add floor · " + H.costText(F.FLOOR_COST),
        { disabled: !H.canPay(F.FLOOR_COST), size: 13 },
      )
    )
      F.addFloor();
    const sm =
      S.selectedModule &&
      H.type(
        S.floors[S.selectedModule.fi] &&
          S.floors[S.selectedModule.fi].slots[S.selectedModule.si],
      );
    if (
      UI.button(
        g,
        "removePart",
        x + 10,
        582,
        w - 120,
        30,
        "Unequip selected part",
        {
          disabled: !sm,
          size: 12,
          tip: "Store the selected machine back into your parts inventory.",
        },
      )
    )
      F.removeSelected();
    if (
      UI.button(
        g,
        "timerText",
        x + w - 104,
        582,
        94,
        30,
        "Timer: " + (S.showTimerText === false ? "Off" : "On"),
        { size: 12 },
      )
    )
      F.toggleTimerText();
    const fl = S.floors[S.selectedFloor] || S.floors[0];
    E.text(
      g,
      "Floor " +
        (S.selectedFloor + 1) +
        " · " +
        fl.length +
        " bays. " +
        (S.selectedPart
          ? "Selected: " + D.parts[S.selectedPart].name + ". Tap an empty bay."
          : "Select a part, then tap an empty bay."),
      x + 16,
      628,
      { size: 11, weight: 500, color: DIM, maxW: w - 32 },
    );
    E.text(
      g,
      "Packets " +
        S.packets.length +
        " · Stock " +
        H.stockCount() +
        " · Limit " +
        H.cap() +
        "/type · Route: " +
        (S.route === "stock" ? "deposit" : "sales"),
      x + 16,
      648,
      { size: 11, weight: 500, color: "#7f9a93", maxW: w - 32 },
    );
  }

  // ---- upgrades ------------------------------------------------------------
  const upFx = UI.makeFx();
  function drawUpgrades(g) {
    const branches = ["Mining", "Factory", "Commerce"];
    branches.forEach((b, bi) => {
      const x = 16 + bi * 420,
        w = 408;
      UI.panel(g, x, 68, w, 604);
      E.text(g, b.toUpperCase(), x + 18, 90, {
        size: 17,
        weight: 900,
        color: GOLD,
      });
      const list = F.UPGRADES.filter((u) => u.branch === b);
      g.strokeStyle = "#2c4a4a";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + 22, 112);
      g.lineTo(x + 22, 112 + (list.length - 1) * 92 + 44);
      g.stroke();
      list.forEach((u, i) => {
        const y = 108 + i * 92,
          info = F.upgradeInfo(u),
          nx = x + 12,
          nw = w - 24;
        const status = info.max
          ? "MAX"
          : info.locked
            ? "Requires " + info.req.name + " Lv " + u.requires.level
            : "Next · ¢" + info.cost;
        const col = info.max
          ? MINT
          : info.locked
            ? "#7f8f8c"
            : info.afford
              ? "#9ff0c4"
              : "#e0a090";
        if (
          UI.button(g, "up" + u.id, nx, y, nw, 84, u.name, {
            align: "left",
            size: 15,
            sub: u.detail,
            subSize: 11.5,
            disabled: info.locked || info.max,
            active: info.lv > 0,
            activeFill: "#1d3b33",
            activeStroke: "#4e9d82",
            tip: u.detail + " · Up to level 10",
          })
        ) {
          if (F.buyUpgrade(u.id)) {
            upFx.burst(nx + nw / 2, y + 42, "#9ff0c4", 14);
            UI.note(u.name + " upgraded to level " + (info.lv + 1) + ".");
          } else
            UI.note(
              info.afford
                ? "Locked: " + status
                : "Not enough credits for " + u.name + " (¢" + info.cost + ").",
            );
        }
        // level pips + status drawn over the button
        for (let p = 0; p < 10; p++) {
          E.rr(g, nx + 14 + p * 17, y + 66, 13, 6, 3);
          g.fillStyle = p < info.lv ? MINT : "#16262a";
          g.fill();
        }
        E.text(g, "Lv " + info.lv + " / 10", nx + nw - 14, y + 18, {
          size: 12,
          weight: 800,
          color: info.lv ? MINT : DIM,
          align: "right",
        });
        E.text(g, status, nx + nw - 14, y + 68, {
          size: 12,
          weight: 800,
          color: col,
          align: "right",
          maxW: 170,
        });
      });
    });
    upFx.draw(g);
  }

  // ---- intro modal ---------------------------------------------------------
  function drawIntro(g) {
    g.fillStyle = "rgba(4,9,11,.78)";
    g.fillRect(0, 0, E.VW, E.VH);
    const w = 600,
      h = 320,
      x = (E.VW - w) / 2,
      y = (E.VH - h) / 2;
    UI.panel(g, x, y, w, h, {
      fill: "#112025",
      stroke: "#4e9d82",
      r: 18,
      lw: 2,
    });
    E.text(g, "Welcome to Deep Core", x + w / 2, y + 48, {
      size: 28,
      weight: 900,
      color: GOLD,
      align: "center",
    });
    let yy = y + 90;
    yy +=
      E.wrap(
        g,
        "Bombs clear ground and expose hidden ore veins. Mine ore to craft new factory parts. Generators create iron and fuel for weapon constructors.",
        x + 40,
        yy,
        w - 80,
        { size: 15, color: "#d6e6e0" },
      ) + 12;
    E.wrap(
      g,
      "A built-in conveyor carries generator materials to constructors. Route finished weapons to your deposit or seller. Every shot uses one weapon from stock.",
      x + 40,
      yy,
      w - 80,
      { size: 15, color: "#d6e6e0" },
    );
    UI.blocked = false;
    if (
      UI.button(
        g,
        "start",
        x + w / 2 - 110,
        y + h - 70,
        220,
        46,
        "Start blasting",
        { size: 17, fill: "#25624f", stroke: "#7ee2b8" },
      )
    )
      introOpen = false;
  }

  // ---- frame hooks ---------------------------------------------------------
  Scenes.update = (dt) => {
    UI.update(dt);
    for (const [k, a] of slotAnim) {
      a.emit = Math.max(0, a.emit - dt);
      a.receive = Math.max(0, a.receive - dt);
      if (!a.emit && !a.receive) slotAnim.delete(k);
    }
    if (Scenes.current === "factory") {
      updateTrucks(dt);
      rowFx.forEach((f) => f && f.update(dt));
    } else trucks.length = 0;
    upFx.update(dt);
    if (born.size > S.packets.length + 80) {
      const live = new Set(S.packets.map((p) => p.id));
      for (const id of born.keys()) if (!live.has(id)) born.delete(id);
    }
  };
  Scenes.draw = (g) => {
    UI.beginFrame();
    background(g);
    UI.blocked = introOpen;
    const s = Scenes.current;
    if (s === "mining") drawMining(g);
    else if (s === "factory") drawFactory(g);
    else drawUpgrades(g);
    topBar(g);
    messageBar(g);
    if (introOpen) drawIntro(g);
    UI.blocked = false;
    UI.endFrame(g);
  };

  // ---- input routing -------------------------------------------------------
  const inWorld = (x, y) =>
    x >= WX && x <= WX + 900 && y >= WY && y <= WY + 520;
  E.on.down = (x, y) => {
    if (introOpen || Scenes.current !== "mining") return;
    if (inWorld(x, y)) M.pointerDown(x - WX, y - WY);
  };
  E.on.move = (x, y) => {
    if (introOpen || Scenes.current !== "mining") return;
    if (M.aiming() || inWorld(x, y)) M.pointerMove(x - WX, y - WY);
  };
  E.on.up = (x, y, ok) => {
    if (M.aiming()) M.pointerUp(x - WX, y - WY, ok);
  };
  E.on.key = (e) => {
    if (introOpen) return;
    if (e.code === "Space" && Scenes.current === "mining") {
      e.preventDefault();
      M.drop();
    } else if (e.key === "1") Scenes.go("mining");
    else if (e.key === "2") Scenes.go("factory");
    else if (e.key === "3") Scenes.go("upgrades");
  };
})();
