// Extra pages drawn on the canvas: the inventory (bag), Research and Craft.
// They register themselves with Scenes (see scenes.js) and use the same UI kit.
(() => {
  "use strict";
  const D = window.Deepworks,
    S = D.state,
    E = D.Engine,
    UI = D.UI,
    F = D.Factory,
    M = D.Mining,
    Scenes = D.Scenes,
    Inv = F.Inv,
    H = F.h;
  const GOLD = "#ffd36b",
    MINT = "#6fe0b0",
    DIM = "#9fb9b1";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const note = (t) => window.DeepworksUI.note(t);
  const SIDE = { x: 932, y: 72, w: 332, h: 600 },
    AREA = { x: 16, y: 72, w: 900, h: 600 };
  const partOrder = Object.keys(D.research);
  const oreName = (k) => (D.ores.find((o) => o.id === k) || { name: k }).name;
  const costText = (cost) =>
    Object.entries(cost)
      .map(([k, n]) => n + " " + oreName(k))
      .join(" + ");
  const itemOf = (s) => (s.kind === "weapon" ? D.weapons[s.id] : D.parts[s.id]);

  // ---- the bag ---------------------------------------------------------------------
  // Draws the slots of the inventory. Clicking a weapon selects it for throwing,
  // clicking a part selects it for placing in the factory.
  Scenes.inventoryGrid = (g, x, y, o = {}) => {
    const cols = o.cols || 6,
      cell = o.cell || 50,
      gap = o.gap || 4,
      slots = Inv.slots();
    for (let i = 0; i < Inv.SLOTS; i++) {
      const cx = x + (i % cols) * (cell + gap),
        cy = y + Math.floor((i * 1) / cols) * (cell + gap),
        s = slots[i];
      E.rr(g, cx, cy, cell, cell, 8);
      if (!s) {
        g.fillStyle = "rgba(255,255,255,.035)";
        g.fill();
        g.strokeStyle = "#233639";
        g.lineWidth = 1.2;
        g.stroke();
        continue;
      }
      const it = itemOf(s),
        sel =
          s.kind === "weapon"
            ? S.selectedWeapon === s.id
            : S.selectedPart === s.id,
        over = UI.over(cx, cy, cell, cell);
      g.fillStyle = sel
        ? "#4a3d1d"
        : s.kind === "weapon"
          ? "#2a2f27"
          : "#1a2d32";
      g.fill();
      if (over) {
        g.fillStyle = "rgba(255,255,255,.08)";
        g.fill();
        UI.hovering = true;
        UI.tip(
          it.name +
            " · " +
            Inv.count(s.kind, s.id) +
            " in the bag" +
            (s.kind === "weapon"
              ? " · click to select it"
              : " · click, then click an empty bay on the Factory page"),
        );
      }
      g.lineWidth = sel ? 2.5 : 1.5;
      g.strokeStyle = sel ? GOLD : s.kind === "weapon" ? "#5a6a52" : "#3b6a66";
      g.stroke();
      E.text(g, it.icon, cx + cell / 2, cy + cell / 2 - 3, {
        size: cell * 0.46,
        weight: 400,
        align: "center",
      });
      E.text(g, s.count, cx + cell - 5, cy + cell - 8, {
        size: 12,
        weight: 900,
        align: "right",
        shadow: true,
      });
      if (UI.clickedIn(cx, cy, cell, cell)) {
        if (s.kind === "weapon") {
          M.selectWeapon(s.id);
          note(it.name + " selected. Go to the Mining page to throw it.");
        } else {
          F.selectPart(s.id);
          if (S.selectedPart)
            note(
              it.name +
                " selected: click an empty bay on the Factory page to place it.",
            );
        }
      }
    }
    const rows = Math.ceil(Inv.SLOTS / cols);
    return rows * (cell + gap);
  };

  // A small panel that opens over any page (the bag button in the top bar).
  Scenes.invOpen = false;
  Scenes.drawInventoryPanel = (g) => {
    const x = 892,
      y = 68,
      w = 372,
      cell = 52,
      gap = 4;
    const gridH = Math.ceil(Inv.SLOTS / 6) * (cell + gap);
    const h = 62 + gridH + 140;
    UI.panel(g, x, y, w, h, {
      fill: "rgba(14,25,29,.98)",
      stroke: "#58807a",
      r: 14,
      lw: 2,
    });
    E.text(g, "INVENTORY", x + 18, y + 24, {
      size: 15,
      weight: 900,
      color: GOLD,
    });
    E.text(g, Inv.used() + " / " + Inv.SLOTS + " slots", x + w - 18, y + 24, {
      size: 13,
      weight: 800,
      color: Inv.used() >= Inv.SLOTS ? "#e0806e" : MINT,
      align: "right",
    });
    Scenes.inventoryGrid(g, x + 18, y + 44, { cell, gap });
    let yy = y + 44 + gridH + 12;
    E.text(g, "ORE CARGO", x + 18, yy, { size: 12, weight: 800, color: DIM });
    D.ores.forEach((o, i) => {
      const px = x + 18 + (i % 2) * 170,
        py = yy + 22 + Math.floor(i / 2) * 22;
      g.fillStyle = o.color;
      g.beginPath();
      g.arc(px + 6, py, 5, 0, 6.29);
      g.fill();
      E.text(g, o.name + "  " + S.ore[o.id], px + 18, py, {
        size: 12.5,
        weight: 700,
      });
    });
    E.text(
      g,
      "Weapons stack to " +
        Inv.stack("weapon") +
        ", parts to " +
        Inv.stack("part") +
        " per slot.",
      x + 18,
      y + h - 30,
      {
        size: 11,
        weight: 500,
        color: "#7f9a93",
        maxW: w - 36,
      },
    );
    if (
      UI.button(g, "invClose", x + w - 98, y + h - 52, 80, 28, "Close", {
        size: 12,
      })
    )
      Scenes.invOpen = false;
  };

  // ---- research ------------------------------------------------------------------
  let selResearch = "sandGen";
  function drawResearch(g) {
    UI.panel(g, AREA.x, AREA.y - 4, AREA.w, AREA.h + 4, {
      fill: "#0b1518",
      stroke: "#2a4245",
      r: 14,
    });
    const CARD_W = 284,
      CARD_H = 92,
      GAP = 12,
      rows = Math.ceil(partOrder.length / 3);
    UI.scrollBegin(
      g,
      "research",
      AREA.x,
      AREA.y,
      AREA.w,
      AREA.h - 2,
      16 + rows * (CARD_H + GAP),
    );
    partOrder.forEach((k, i) => {
      const x = AREA.x + 14 + (i % 3) * (CARD_W + GAP),
        y = AREA.y + 14 + Math.floor(i / 3) * (CARD_H + GAP),
        p = D.parts[k],
        st = F.researchState(k),
        sub = st.done
          ? "✔ Researched"
          : st.missing.length
            ? "🔒 Needs " + st.missing.map((m) => D.parts[m].name).join(", ")
            : "Research · ¢" + st.cost,
        subColor = st.done
          ? "#9ff0c4"
          : st.missing.length
            ? "#566a68"
            : st.afford
              ? "#ffe083"
              : "#e0a090";
      if (
        UI.button(g, "rs" + k, x, y, CARD_W, CARD_H, p.name, {
          icon: p.icon,
          iconSize: 30,
          align: "left",
          sub,
          subColor,
          subSize: 12,
          size: 14,
          fill: st.done ? "#1b3a32" : st.missing.length ? "#0f181b" : "#1a2c31",
          stroke: st.done
            ? "#4e9d82"
            : st.missing.length
              ? "#26393b"
              : "#4a8c80",
          color: st.missing.length && !st.done ? "#667c79" : undefined,
          tip: p.detail,
        })
      )
        selResearch = k;
      if (selResearch === k) {
        g.strokeStyle = "#fff";
        g.lineWidth = 3;
        E.rr(g, x - 3, y - 3, CARD_W + 6, CARD_H + 6, 12);
        g.stroke();
      }
    });
    UI.scrollEnd(g);

    // details + the research button
    const x = SIDE.x,
      w = SIDE.w,
      k = selResearch,
      p = D.parts[k],
      st = F.researchState(k);
    UI.panel(g, x, SIDE.y - 4, w, SIDE.h + 4);
    E.text(g, "RESEARCH", x + 20, 90, { size: 12, weight: 800, color: DIM });
    E.text(g, p.icon, x + 40, 134, { size: 36, weight: 400, align: "center" });
    E.text(g, p.name, x + 72, 126, { size: 18, weight: 900, maxW: w - 92 });
    E.text(
      g,
      st.done
        ? "RESEARCHED"
        : st.missing.length
          ? "LOCKED"
          : "READY TO RESEARCH",
      x + 72,
      148,
      {
        size: 11,
        weight: 800,
        color: st.done ? "#9ff0c4" : st.missing.length ? "#9aa" : GOLD,
      },
    );
    let y =
      180 +
      E.wrap(g, p.detail, x + 20, 180, w - 40, {
        size: 13.5,
        color: "#cfe0da",
        lh: 19,
      }) +
      12;
    const req = D.research[k].req;
    E.text(g, "Needs", x + 20, y, { size: 12, weight: 800, color: DIM });
    y += 20;
    if (!req.length)
      E.text(g, "✔ Nothing: it is open", x + 20, y, {
        size: 13,
        weight: 700,
        color: "#9ff0c4",
      });
    if (!req.length) y += 20;
    for (const r of req) {
      const ok = !!S.researched[r];
      E.text(g, (ok ? "✔ " : "✖ ") + D.parts[r].name, x + 20, y, {
        size: 13,
        weight: 700,
        color: ok ? "#9ff0c4" : "#e0a090",
        maxW: w - 40,
      });
      y += 20;
    }
    y += 10;
    E.text(g, "Crafting it later costs " + costText(p.cost) + ".", x + 20, y, {
      size: 12.5,
      weight: 600,
      color: "#cfe0da",
      maxW: w - 40,
    });
    y += 30;
    E.text(
      g,
      st.done
        ? "Already researched"
        : "Cost: ¢" + st.cost + "  (you have ¢" + Math.floor(S.money) + ")",
      x + 20,
      y,
      {
        size: 13,
        weight: 700,
        color: st.done ? "#9ff0c4" : st.afford ? "#9ff0c4" : "#e0a090",
        maxW: w - 40,
      },
    );
    y += 18;
    if (
      UI.button(
        g,
        "doResearch",
        x + 20,
        y,
        w - 40,
        46,
        st.done
          ? "Researched ✔"
          : st.missing.length
            ? "Locked"
            : "Research · ¢" + st.cost,
        {
          disabled: st.done || !st.open || !st.afford,
          size: 16,
          fill: "#25624f",
          stroke: "#7ee2b8",
          tip: st.missing.length
            ? "Research the parts it needs first."
            : st.afford
              ? ""
              : "Not enough credits.",
        },
      )
    ) {
      if (F.research(k))
        note(p.name + " researched. You can craft it on the Craft page now.");
    }
    y += 58;
    if (
      st.done &&
      UI.button(g, "toCraft", x + 20, y, w - 40, 40, "Go to Craft", {
        size: 14,
        icon: "🔨",
        align: "left",
      })
    )
      Scenes.go("craft");
  }

  // ---- craft -----------------------------------------------------------------------
  const craftFx = UI.makeFx();
  Scenes.updatePages = (dt) => craftFx.update(dt);
  function drawCraft(g) {
    UI.panel(g, AREA.x, AREA.y - 4, AREA.w, AREA.h + 4, {
      fill: "#0b1518",
      stroke: "#2a4245",
      r: 14,
    });
    const list = partOrder.filter((k) => S.researched[k]),
      CARD_W = 284,
      CARD_H = 128,
      GAP = 12,
      rows = Math.ceil(list.length / 3);
    UI.scrollBegin(
      g,
      "craft",
      AREA.x,
      AREA.y,
      AREA.w,
      AREA.h - 2,
      16 + rows * (CARD_H + GAP) + 64,
    );
    list.forEach((k, i) => {
      const x = AREA.x + 14 + (i % 3) * (CARD_W + GAP),
        y = AREA.y + 14 + Math.floor(i / 3) * (CARD_H + GAP),
        p = D.parts[k],
        can = F.craftCount(k),
        bag = Inv.count("part", k);
      UI.panel(g, x, y, CARD_W, CARD_H, {
        fill: "#16272b",
        stroke: can ? "#3b6a66" : "#26393b",
        r: 12,
      });
      E.text(g, p.icon, x + 30, y + 34, {
        size: 30,
        weight: 400,
        align: "center",
      });
      E.text(g, p.name, x + 56, y + 26, {
        size: 14,
        weight: 800,
        maxW: CARD_W - 68,
      });
      E.text(g, costText(p.cost), x + 56, y + 48, {
        size: 12,
        weight: 600,
        color: can ? "#9ff0c4" : "#e0a090",
        maxW: CARD_W - 68,
      });
      E.text(g, "In your bag: " + bag, x + 56, y + 68, {
        size: 12,
        weight: 600,
        color: DIM,
      });
      const bw = (CARD_W - 36) / 2;
      if (
        UI.button(g, "cr1" + k, x + 12, y + 84, bw, 32, "Craft ×1", {
          disabled: can < 1,
          size: 13,
          fill: "#25624f",
          stroke: "#7ee2b8",
        })
      ) {
        const n = F.craft(k, 1);
        if (n) {
          craftFx.burst(x + CARD_W / 2, y + 60, "#9ff0c4", 10);
          note("Crafted " + p.name + " and put it in your bag.");
        }
      }
      if (
        UI.button(g, "cr5" + k, x + 24 + bw, y + 84, bw, 32, "Craft ×5", {
          disabled: can < 2,
          size: 13,
          tip: "Crafts as many as you can afford, up to 5.",
        })
      ) {
        const n = F.craft(k, 5);
        if (n) {
          craftFx.burst(x + CARD_W / 2, y + 60, "#9ff0c4", 16);
          note("Crafted " + n + " × " + p.name + ".");
        }
      }
      if (can < 1 && UI.over(x, y, CARD_W, CARD_H) && Inv.room("part", k) < 1)
        UI.tip("Your bag has no room for more of these.");
    });
    const ny = AREA.y + 14 + rows * (CARD_H + GAP);
    if (list.length < partOrder.length)
      if (
        UI.button(
          g,
          "toResearch",
          AREA.x + 14,
          ny,
          400,
          40,
          "More parts to unlock: go to Research",
          { size: 14, icon: "🔬", align: "left" },
        )
      )
        Scenes.go("research");
    craftFx.draw(g);
    UI.scrollEnd(g);

    // bag + ore on the right
    const x = SIDE.x,
      w = SIDE.w;
    UI.panel(g, x, SIDE.y - 4, w, SIDE.h + 4);
    E.text(g, "INVENTORY", x + 18, 90, { size: 12, weight: 800, color: DIM });
    E.text(g, Inv.used() + " / " + Inv.SLOTS + " slots", x + w - 18, 90, {
      size: 12,
      weight: 800,
      color: Inv.used() >= Inv.SLOTS ? "#e0806e" : MINT,
      align: "right",
    });
    const gh = Scenes.inventoryGrid(g, x + 12, 106, { cell: 48, gap: 4 });
    let y = 106 + gh + 14;
    E.text(g, "ORE CARGO", x + 18, y, { size: 12, weight: 800, color: DIM });
    D.ores.forEach((o, i) => {
      const py = y + 24 + i * 24;
      g.fillStyle = o.color;
      g.beginPath();
      g.arc(x + 26, py, 6, 0, 6.29);
      g.fill();
      E.text(g, o.name, x + 42, py, { size: 13, weight: 600 });
      E.text(g, S.ore[o.id], x + w - 20, py, {
        size: 14,
        weight: 900,
        align: "right",
      });
    });
    E.wrap(
      g,
      "Crafted parts go into your bag. Select one there, then click an empty bay on the Factory page to place it. Right-click a placed part to take it back.",
      x + 18,
      y + 24 + 4 * 24 + 18,
      w - 36,
      {
        size: 12,
        weight: 500,
        color: "#7f9a93",
        lh: 17,
      },
    );
  }

  Scenes.pages = Scenes.pages || {};
  Scenes.pages.research = drawResearch;
  Scenes.pages.craft = drawCraft;
})();
