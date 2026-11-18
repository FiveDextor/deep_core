(() => {
  "use strict";
  const D = window.Deepworks,
    S = D.state,
    F = (D.Factory = {});
  const BAY = 78,
    GAP = 5,
    PITCH = BAY + GAP,
    SPEED = 175;
  const UPGRADES = [
    {
      id: "blast",
      branch: "Mining",
      name: "Blast radius",
      detail: "Widen every explosion.",
      base: 55,
      requires: null,
    },
    {
      id: "grenadeRadius",
      branch: "Mining",
      name: "Hand grenade radius",
      detail: "Expand hand grenade blast radius.",
      base: 75,
      requires: { id: "blast", level: 2 },
    },
    {
      id: "dynamiteShards",
      branch: "Mining",
      name: "Dynamite sticks",
      detail: "Split dynamite into more flying sticks.",
      base: 90,
      requires: { id: "blast", level: 2 },
    },
    {
      id: "stickyRadius",
      branch: "Mining",
      name: "Sticky blast radius",
      detail: "Expand sticky grenade blast radius.",
      base: 85,
      requires: { id: "grenadeRadius", level: 2 },
    },
    {
      id: "oreYield",
      branch: "Mining",
      name: "Ore recovery",
      detail: "Collect more material from exposed veins.",
      base: 80,
      requires: { id: "blast", level: 2 },
    },
    {
      id: "throwForce",
      branch: "Mining",
      name: "Throw force",
      detail: "Throw bombs farther with the same drag.",
      base: 65,
      requires: { id: "blast", level: 2 },
    },
    {
      id: "generators",
      branch: "Factory",
      name: "Generator speed",
      detail: "Generate iron and fuel faster.",
      base: 65,
      requires: null,
    },
    {
      id: "assembly",
      branch: "Factory",
      name: "Assembly speed",
      detail: "Build weapons faster.",
      base: 75,
      requires: { id: "generators", level: 2 },
    },
    {
      id: "buffer",
      branch: "Factory",
      name: "Generator buffer",
      detail: "Hold more generated materials in transit.",
      base: 70,
      requires: { id: "generators", level: 2 },
    },
    {
      id: "storage",
      branch: "Commerce",
      name: "Weapon storage",
      detail: "Raise the deposit limit for each weapon type.",
      base: 60,
      requires: null,
    },
    {
      id: "sellerSpeed",
      branch: "Commerce",
      name: "Sale cycle",
      detail: "Sell stored weapons more often.",
      base: 80,
      requires: { id: "storage", level: 2 },
    },
    {
      id: "sellerValue",
      branch: "Commerce",
      name: "Sale value",
      detail: "Earn more credits for every weapon sold.",
      base: 90,
      requires: { id: "storage", level: 2 },
    },
  ];
  function type(s) {
    return s && s.type;
  }
  function stockCount() {
    return Object.values(S.stock).reduce((a, b) => a + b, 0);
  }
  function cap() {
    return 40 + S.skills.storage * 20;
  }
  function genBuffer() {
    return 10 + S.skills.buffer * 2;
  }
  function sellerPeriod() {
    return Math.max(2, 5 - S.skills.sellerSpeed * 0.3);
  }
  function costText(c) {
    return (
      Object.entries(c || {})
        .filter((x) => x[1])
        .map(([k, v]) => v + " " + D.ores.find((o) => o.id === k).name)
        .join(" + ") || "Starter part"
    );
  }
  function canPay(c) {
    return Object.entries(c || {}).every(([k, v]) => S.ore[k] >= v);
  }
  function pay(c) {
    if (!canPay(c)) return false;
    for (const [k, v] of Object.entries(c || {})) S.ore[k] -= v;
    return true;
  }
  const INPUT_CAP = 5;
  function inputsFor(product) {
    return Object.entries(D.weapons[product].recipe).filter(
      ([k]) => k !== "seconds",
    );
  }
  function genKind(t) {
    return t === "ironGen"
      ? "iron"
      : t === "fuelGen"
        ? "fuel"
        : t === "glueGen"
          ? "glue"
          : null;
  }
  function beltPath(f, a, b) {
    return (
      a < b &&
      f.slots
        .slice(a + 1, b)
        .every((s) => !type(s) || genKind(type(s)) || D.productFor[type(s)])
    );
  }
  function produces(t, k) {
    return genKind(t) === k || D.productFor[t] === k;
  }
  function accepts(t, k) {
    let product = D.productFor[t];
    return !!product && inputsFor(product).some(([kind]) => kind === k);
  }
  function inputPath(f, i, k) {
    return f.slots.some(
      (s, j) => j < i && produces(type(s), k) && beltPath(f, j, i),
    );
  }
  function consumerTarget(f, from, k) {
    for (let j = from + 1; j < f.slots.length; j++) {
      let m = f.slots[j];
      if (
        accepts(type(m), k) &&
        ((m.inputs && m.inputs[k]) || 0) < INPUT_CAP &&
        beltPath(f, from, j)
      )
        return j;
    }
    return -1;
  }
  function outletIndex(f, i, kind) {
    if (kind !== "weapon") return -1;
    let product = D.productFor[type(f.slots[i])],
      find = (t) => f.slots.findIndex((slot, j) => j > i && type(slot) === t),
      want = S.route === "stock" ? "deposit" : "seller",
      found = find(want);
    if (S.route === "stock" && (S.stock[product] || 0) >= cap()) {
      let seller = find("seller");
      if (seller >= 0) return seller;
    }
    return found >= 0 ? found : find(want === "deposit" ? "seller" : "deposit");
  }
  function outputTarget(f, i, product) {
    let input = consumerTarget(f, i, product);
    return input >= 0 ? input : outletIndex(f, i, "weapon");
  }
  function genTarget(f, gi, kind) {
    for (let j = gi + 1; j < f.slots.length; j++) {
      if (!accepts(type(f.slots[j]), kind) || !beltPath(f, gi, j)) continue;
      let product = D.productFor[type(f.slots[j])];
      if (outputTarget(f, j, product) >= 0) return j;
    }
    return -1;
  }
  function countPart(t) {
    return S.floors.reduce(
      (n, f) => n + f.slots.filter((s) => type(s) === t).length,
      0,
    );
  }
  function activeLine(f) {
    return f.slots.some(
      (s, i) => genKind(type(s)) && genTarget(f, i, genKind(type(s))) >= 0,
    );
  }
  function packetLabel(p) {
    if (p.kind === "iron") return "Fe";
    if (p.kind === "fuel") return "F";
    if (p.kind === "glue") return "GL";
    return D.weapons[p.kind === "weapon" ? p.product : p.kind]?.icon || "?";
  }
  // Plain data for a machine's readout: {label, progress, text, sub, noInput}
  function hudInfo(m, t) {
    const show = S.showTimerText !== false;
    if (genKind(t)) {
      const kind = genKind(t),
        period = kind === "iron" ? 3.2 : kind === "fuel" ? 1.75 : 4.2,
        rate = 1 + S.skills.generators * 0.22,
        stored = m.genStock || 0,
        full = stored >= genBuffer();
      return {
        label:
          "STOCK " +
          stored +
          " · " +
          (kind === "iron" ? "Fe" : kind === "fuel" ? "Fuel" : "Glue"),
        progress: full ? 1 : Math.min(1, (m.genClock || 0) / period),
        text: show
          ? full
            ? "FULL"
            : Math.max(0, (period - (m.genClock || 0)) / rate).toFixed(1) + "s"
          : "",
        full,
      };
    }
    if (D.productFor[t]) {
      const product = D.productFor[t],
        req = inputsFor(product),
        inputs = m.inputs || {},
        ready = req.every(([k, n]) => (inputs[k] || 0) >= n),
        name = (k) =>
          k === "iron"
            ? "Fe"
            : k === "fuel"
              ? "Fuel"
              : k === "glue"
                ? "Glue"
                : D.weapons[k]?.icon || k,
        speed = 1 + S.skills.assembly * 0.3;
      return {
        label: req
          .map(([k, n]) => name(k) + " " + (inputs[k] || 0) + "/" + n)
          .join(" · "),
        progress: m.working ? Math.min(1, (m.work || 0) / 1.15) : 0,
        text:
          !ready && !m.working
            ? "NO INPUT"
            : show
              ? Math.max(
                  0,
                  m.working ? (1.15 - (m.work || 0)) / speed : 1.15 / speed,
                ).toFixed(1) + "s"
              : "",
        noInput: !ready && !m.working,
      };
    }
    if (t === "seller") {
      m.sellStock = m.sellStock || {
        grenade: 0,
        dynamite: 0,
        charge: 0,
        sticky: 0,
      };
      const total = Object.values(m.sellStock).reduce((x, y) => x + y, 0),
        period = sellerPeriod();
      return {
        label: "STOCK " + total + " · SELLER",
        progress: Math.min(1, (m.sellClock || 0) / period),
        text: show
          ? Math.max(0, period - (m.sellClock || 0)).toFixed(1) + "s"
          : "",
      };
    }
    if (t === "deposit") {
      return {
        label: "STOCK / TYPE",
        sub: Object.entries(S.stock)
          .map(
            ([k, n]) =>
              ({ grenade: "G", dynamite: "D", charge: "C", sticky: "ST" })[k] +
              " " +
              n,
          )
          .join(" · "),
        text: "CAP " + cap() + " EACH",
      };
    }
    return null;
  }
  function skillCost(k) {
    let u = UPGRADES.find((x) => x.id === k);
    return u ? u.base + (S.skills[k] || 0) * 65 : Infinity;
  }
  F.partCount = countPart;
  F.place = (fi, si) => {
    let t = S.selectedPart;
    if (!t || type(S.floors[fi].slots[si])) return "occupied";
    if ((S.partInventory[t] || 0) > 0) S.partInventory[t]--;
    else if (!pay(D.parts[t].cost)) return "material";
    S.floors[fi].slots[si] = {
      type: t,
      progress: 0,
      inputs: { iron: 0, fuel: 0 },
      working: false,
    };
    S.selectedPart = null;
    S.selectedModule = { fi, si };
    return "ok";
  };
  // Visual hooks: the scene layer sets F.onFx / F.onFloat. Skipped when the
  // factory is fast-forwarding off screen.
  function fx(fi, si, cls) {
    if (!F.fast && F.onFx) F.onFx(fi, si, cls);
  }
  function floatText(fi, si, text) {
    if (!F.fast && F.onFloat) F.onFloat(fi, si, text);
  }
  function newPacket(fi, kind, x, target, product, source) {
    S.packets.push({
      id: S.nextPacketId++,
      fi,
      kind,
      x,
      target,
      product,
      source,
      route:
        kind === "weapon"
          ? type(S.floors[fi].slots[target]) === "seller"
            ? "sell"
            : "stock"
          : null,
      phase: "belt",
      timer: 0,
    });
  }
  function emitInputs(dt) {
    for (let fi = 0; fi < S.floors.length; fi++) {
      let f = S.floors[fi];
      for (let i = 0; i < f.slots.length; i++) {
        let m = f.slots[i],
          kind = genKind(type(m));
        if (!kind) continue;
        let target = genTarget(f, i, kind);
        if (target < 0) continue;
        m.genStock = m.genStock || 0;
        if (m.genStock >= genBuffer()) {
          m.genClock = 0;
          continue;
        }
        let rate = 1 + S.skills.generators * 0.22,
          period = kind === "iron" ? 3.2 : kind === "fuel" ? 1.75 : 4.2;
        m.genClock = (m.genClock || 0) + dt * rate;
        while (m.genClock >= period && m.genStock < genBuffer()) {
          m.genClock -= period;
          m.genStock++;
          newPacket(fi, kind, i * PITCH + BAY / 2, target, null, i);
          fx(fi, i, "emit");
        }
      }
    }
  }
  function processPackets(dt) {
    for (let i = S.packets.length - 1; i >= 0; i--) {
      let p = S.packets[i],
        f = S.floors[p.fi];
      if (!f) {
        S.packets.splice(i, 1);
        continue;
      }
      if (p.phase === "belt") {
        let receiving =
            p.kind !== "weapon" &&
            p.target < f.slots.length &&
            accepts(type(f.slots[p.target]), p.kind),
          dest =
            p.kind === "weapon"
              ? p.target * PITCH + BAY / 2
              : p.target * PITCH + BAY / 3;
        p.x = Math.min(dest, p.x + SPEED * dt);
        if (p.x >= dest) {
          if (p.kind === "weapon") p.phase = "output";
          else if (receiving) {
            let m = f.slots[p.target];
            if (((m.inputs && m.inputs[p.kind]) || 0) >= INPUT_CAP) {
              let next = consumerTarget(f, p.target, p.kind);
              if (next >= 0) p.target = next;
              else {
                p.phase = "pass";
                p.target = f.slots.length;
              }
            } else p.phase = "pull";
          } else {
            let next = consumerTarget(f, p.target - 1, p.kind);
            if (next >= 0) p.target = next;
            else {
              p.phase = "pass";
              p.target = f.slots.length;
            }
          }
          p.timer = 0;
        }
      } else if (p.phase === "pass") {
        let dest = f.slots.length * PITCH;
        p.x = Math.min(dest, p.x + SPEED * dt);
        if (p.x >= dest) {
          p.phase = "burn";
          p.timer = 0;
        }
      } else if (p.phase === "burn") {
        p.timer += dt;
        if (p.timer >= 0.6) {
          if (p.source != null) {
            let src = f.slots[p.source];
            if (src) src.genStock = Math.max(0, (src.genStock || 0) - 1);
          }
          S.packets.splice(i, 1);
        }
      } else if (p.phase === "pull") {
        let m = f.slots[p.target],
          have = m && m.inputs ? m.inputs[p.kind] || 0 : 0;
        if (!m || !accepts(type(m), p.kind) || have >= INPUT_CAP) {
          let next = consumerTarget(f, p.target, p.kind);
          if (next >= 0) {
            p.target = next;
            p.phase = "belt";
          } else {
            p.phase = "pass";
            p.target = f.slots.length;
          }
          p.timer = 0;
          continue;
        }
        p.timer += dt;
        if (p.timer >= 0.28) {
          m.inputs = m.inputs || {};
          m.inputs[p.kind] = (m.inputs[p.kind] || 0) + 1;
          fx(p.fi, p.target, "receive");
          if (p.source != null) {
            let src = f.slots[p.source];
            if (src) src.genStock = Math.max(0, (src.genStock || 0) - 1);
          }
          S.packets.splice(i, 1);
        }
      } else if (p.phase === "output") {
        let where = p.target * PITCH + BAY / 2;
        p.x = Math.min(where, p.x + SPEED * dt);
        if (p.x >= where) {
          if (p.route === "stock") {
            if ((S.stock[p.product] || 0) >= cap()) {
              let seller = f.slots.findIndex(
                (slot, j) => j > p.target && type(slot) === "seller",
              );
              if (seller >= 0) {
                p.target = seller;
                p.route = "sell";
                p.phase = "belt";
                continue;
              }
              S.packets.splice(i, 1);
              continue;
            }
            S.stock[p.product]++;
            fx(p.fi, p.target, "receive");
          } else {
            let seller = f.slots[p.target];
            if (seller) {
              seller.sellStock = seller.sellStock || {
                grenade: 0,
                dynamite: 0,
                charge: 0,
                sticky: 0,
              };
              fx(p.fi, p.target, "receive");
              seller.sellStock[p.product] =
                (seller.sellStock[p.product] || 0) + 1;
            }
          }
          S.packets.splice(i, 1);
          D.markUI();
        }
      }
    }
  }
  function runConstructors(dt) {
    for (let fi = 0; fi < S.floors.length; fi++) {
      let f = S.floors[fi];
      for (let i = 0; i < f.slots.length; i++) {
        let m = f.slots[i],
          product = D.productFor[type(m)];
        if (!product) continue;
        let req = inputsFor(product);
        if (!req.every(([k]) => inputPath(f, i, k))) continue;
        if (
          consumerTarget(f, i, product) < 0 &&
          outletIndex(f, i, "weapon") < 0
        )
          continue;
        m.inputs = m.inputs || {};
        if (m.working) {
          m.work = (m.work || 0) + dt * (1 + S.skills.assembly * 0.3);
          if (m.work >= 1.15) {
            m.working = false;
            m.work = 0;
            let target = consumerTarget(f, i, product);
            if (target >= 0) {
              newPacket(fi, product, i * PITCH + BAY - 2, target, product);
              fx(fi, i, "emit");
            } else {
              let out = outletIndex(f, i, "weapon");
              if (out >= 0) {
                newPacket(fi, "weapon", i * PITCH + BAY - 2, out, product);
                fx(fi, i, "emit");
              }
            }
          }
          continue;
        }
        if (req.every(([k, n]) => (m.inputs[k] || 0) >= n)) {
          for (const [k, n] of req) m.inputs[k] -= n;
          m.working = true;
          m.work = 0;
        }
      }
    }
  }
  function updateSellers(dt) {
    for (let fi = 0; fi < S.floors.length; fi++)
      for (let si = 0; si < S.floors[fi].slots.length; si++) {
        const m = S.floors[fi].slots[si];
        if (type(m) !== "seller") continue;
        m.sellStock = m.sellStock || {
          grenade: 0,
          dynamite: 0,
          charge: 0,
          sticky: 0,
        };
        m.sellClock = (m.sellClock || 0) + dt;
        while (m.sellClock >= sellerPeriod()) {
          m.sellClock -= sellerPeriod();
          let earnings = 0;
          for (const [k, n] of Object.entries(m.sellStock)) {
            earnings +=
              n * D.weapons[k].price * (1 + S.skills.sellerValue * 0.08);
            m.sellStock[k] = 0;
          }
          if (earnings) {
            S.money += earnings;
            D.markUI();
            floatText(fi, si, "+¢" + Math.round(earnings));
            if (!F.fast && F.onSale) F.onSale(fi, si, earnings);
            fx(fi, si, "receive");
          }
        }
      }
  }
  F.update = (dt) => {
    emitInputs(dt);
    processPackets(dt);
    runConstructors(dt);
    updateSellers(dt);
  };
  // Run the same production rules in big steps with no drawing. Used when the
  // factory is off screen and to credit time the tab spent asleep.
  F.simulate = (seconds) => {
    if (!(seconds > 0)) return;
    const steps = Math.min(4000, Math.max(1, Math.ceil(seconds / 0.25))),
      dt = seconds / steps;
    F.fast = true;
    for (let i = 0; i < steps; i++) F.update(dt);
    F.fast = false;
    D.markUI();
  };
  // ---- player actions (called by the canvas UI) --------------------------
  const EXTEND_COST = { coal: 3, copper: 1 },
    FLOOR_COST = { coal: 8, iron: 3 },
    note = (t) => window.DeepworksUI.note(t);
  F.UPGRADES = UPGRADES;
  F.skillCost = skillCost;
  F.upgradeInfo = (u) => {
    const lv = S.skills[u.id] || 0,
      cost = skillCost(u.id),
      req = u.requires && UPGRADES.find((x) => x.id === u.requires.id),
      locked = !!(
        u.requires && (S.skills[u.requires.id] || 0) < u.requires.level
      );
    return { lv, cost, locked, max: lv >= 10, afford: S.money >= cost, req };
  };
  F.buyUpgrade = (k) => {
    const u = UPGRADES.find((x) => x.id === k);
    if (!u) return false;
    const i = F.upgradeInfo(u);
    if (i.locked || i.max || !i.afford) return false;
    S.money -= i.cost;
    S.skills[k] = i.lv + 1;
    return true;
  };
  F.hudInfo = hudInfo;
  F.EXTEND_COST = EXTEND_COST;
  F.FLOOR_COST = FLOOR_COST;
  F.h = {
    type,
    genKind,
    costText,
    canPay,
    cap,
    stockCount,
    activeLine,
    packetLabel,
    BAY,
    PITCH,
    SPEED,
    INPUT_CAP,
  };
  F.selectPart = (k) => {
    S.selectedPart = S.selectedPart === k ? null : k;
  };
  F.tapSlot = (fi, si) => {
    S.selectedFloor = fi;
    if (S.selectedPart) {
      const r = F.place(fi, si);
      if (r === "material")
        note("Mine the listed ore to craft this factory part.");
      else if (r === "occupied")
        note("That bay is occupied. Unequip it to store the part.");
      return r;
    }
    S.selectedModule = { fi, si };
    return "selected";
  };
  F.tapExtend = (fi) => {
    S.selectedFloor = fi;
    if (pay(EXTEND_COST)) {
      S.floors[fi].slots.push(null);
      S.floors[fi].length++;
      return true;
    }
    note("Mine 3 coal and 1 copper to extend this floor.");
    return false;
  };
  F.removeSelected = () => {
    const z = S.selectedModule;
    if (!z) return false;
    const t = type(S.floors[z.fi] && S.floors[z.fi].slots[z.si]);
    if (!t) return false;
    S.partInventory[t] = (S.partInventory[t] || 0) + 1;
    S.floors[z.fi].slots[z.si] = null;
    S.selectedModule = null;
    return true;
  };
  F.addFloor = () => {
    if (!pay(FLOOR_COST)) return false;
    S.floors.push({ length: 6, slots: Array(6).fill(null) });
    S.selectedFloor = S.floors.length - 1;
    return true;
  };
  F.setRoute = (r) => {
    if (r === "stock" && countPart("deposit")) S.route = "stock";
    if (r === "sell" && countPart("seller")) S.route = "sell";
  };
  F.toggleTimerText = () => {
    S.showTimerText = S.showTimerText === false;
  };
  F.init = () => {};
})();
