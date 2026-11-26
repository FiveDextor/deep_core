(() => {
  "use strict";
  const KEY = "deep-core-modules-v6",
    RESET = "deep-core-reset-v5";
  try {
    if (localStorage.getItem(RESET) !== "done") {
      [
        "deep-core-factory-v3",
        "deep-core-v2",
        "deep-core-v1",
        "deep-core-modules-v5",
        "deep-core-modules-v4",
        KEY,
      ].forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(RESET, "done");
    }
  } catch (e) {}
  const D = (window.Deepworks = {});
  D.ores = [
    { id: "coal", name: "Coal", value: 1, color: "#858b98" },
    { id: "copper", name: "Copper", value: 3, color: "#db8751" },
    { id: "iron", name: "Iron ore", value: 7, color: "#9bd6e5" },
    { id: "gold", name: "Gold", value: 18, color: "#f2cf62" },
  ];
  D.weapons = {
    grenade: {
      name: "Hand grenade",
      icon: "💣",
      radius: 48,
      price: 6,
      recipe: { iron: 1, fuel: 2, seconds: 5 },
    },
    dynamite: {
      name: "Dynamite",
      icon: "🧨",
      radius: 66,
      price: 20,
      recipe: { iron: 2, fuel: 2, seconds: 8 },
    },
    charge: {
      name: "Blast charge",
      icon: "💥",
      radius: 84,
      price: 55,
      recipe: { iron: 4, fuel: 3, seconds: 12 },
    },
    sticky: {
      name: "Sticky grenade",
      icon: "🟢",
      radius: 56,
      price: 18,
      recipe: { grenade: 1, glue: 1, seconds: 6 },
    },
    // No explosion: it leaves acid that eats down through the ground for a few
    // seconds. "gas" is not carried by the conveyor: the constructor sucks it up itself.
    acid: {
      name: "Acid grenade",
      icon: "☣️",
      radius: 10, // size of each blob of acid
      price: 34,
      recipe: { glass: 1, acidjuice: 1, gas: 2, seconds: 7 },
    },
  };
  // Materials made by a combinator (they travel on the conveyor like iron or fuel).
  // Factory parts must be researched (for credits) before they can be crafted.
  // req = parts that must be researched first. cost 0 = known from the start.
  D.research = {
    ironGen: { cost: 0, req: [] },
    fuelGen: { cost: 0, req: [] },
    grenadeCtor: { cost: 0, req: [] },
    deposit: { cost: 0, req: [] },
    seller: { cost: 0, req: [] },
    sandGen: { cost: 120, req: [] },
    glueGen: { cost: 100, req: [] },
    acidGen: { cost: 200, req: [] },
    dynamiteCtor: { cost: 150, req: ["grenadeCtor"] },
    stickyCtor: { cost: 200, req: ["glueGen", "grenadeCtor"] },
    chargeCtor: { cost: 250, req: ["dynamiteCtor"] },
    combinator: { cost: 180, req: ["sandGen"] },
    acidCtor: { cost: 300, req: ["combinator", "acidGen"] },
  };
  D.materials = {
    glass: {
      name: "Glass",
      icon: "🔷",
      recipe: { sand: 1, fuel: 1, seconds: 3 },
    },
  };
  D.parts = {
    ironGen: {
      name: "Iron generator",
      icon: "⚙️",
      cost: { coal: 5, copper: 2 },
      detail: "Makes iron · 0.35/s",
    },
    fuelGen: {
      name: "Combust fuel generator",
      icon: "🔥",
      cost: { coal: 5, copper: 1 },
      detail: "Makes fuel · 0.65/s",
    },
    sandGen: {
      name: "Sand generator",
      icon: "⏳",
      cost: { coal: 4, copper: 2 },
      detail: "Makes sand · 0.33/s",
    },
    acidGen: {
      name: "Acid generator",
      icon: "🧫",
      cost: { coal: 5, copper: 3, iron: 1 },
      detail: "Makes acid for acid grenades · 0.28/s",
    },
    glueGen: {
      name: "Glue generator",
      icon: "🧪",
      cost: { coal: 8, copper: 4 },
      detail: "Generates glue for sticky grenades",
    },
    grenadeCtor: {
      name: "Hand grenade constructor",
      icon: "💣",
      cost: { copper: 5, iron: 2 },
      detail: "Iron + fuel → grenades",
    },
    dynamiteCtor: {
      name: "Dynamite constructor",
      icon: "🧨",
      cost: { iron: 6, copper: 4 },
      detail: "Iron + fuel → dynamite",
    },
    chargeCtor: {
      name: "Blast charge constructor",
      icon: "💥",
      cost: { iron: 8, gold: 2 },
      detail: "Iron + fuel → blast charges",
    },
    stickyCtor: {
      name: "Sticky grenade constructor",
      icon: "🟢",
      cost: { iron: 5, copper: 5, gold: 1 },
      detail: "Regular grenade + glue → sticky grenade",
    },
    combinator: {
      name: "Material combinator",
      icon: "⚗️",
      cost: { iron: 4, copper: 3 },
      detail: "Combines materials: sand + fuel → glass",
    },
    acidCtor: {
      name: "Acid grenade constructor",
      icon: "☣️",
      cost: { iron: 6, copper: 4, gold: 1 },
      detail:
        "Glass + acid → acid grenades. It sucks up the 2 gas each grenade needs by itself, 0.5 gas/s (Gas intake upgrade makes it faster).",
    },
    deposit: {
      name: "Weapon deposit",
      icon: "📦",
      cost: { coal: 3, copper: 2 },
      detail: "Stores up to 40 of each weapon type",
    },
    seller: {
      name: "Weapon seller",
      icon: "💰",
      cost: { iron: 3, copper: 2 },
      detail: "Stores incoming weapons, then sells its stock every 5 seconds",
    },
  };
  D.productFor = {
    grenadeCtor: "grenade",
    dynamiteCtor: "dynamite",
    chargeCtor: "charge",
    stickyCtor: "sticky",
    acidCtor: "acid",
    combinator: "glass",
  };
  D.state = {
    money: 0,
    depth: 0,
    digScore: 0,
    settings: { quality: "auto", autoRefresh: 30, gooOn: true }, // picture quality (auto/high/medium/low); minutes between self-refreshes (0 = off)
    mineType: "dirt", // the kind of ground this level is made of: dirt, gravel or rock
    banked: 0,
    ore: { coal: 0, copper: 0, iron: 0, gold: 0 },
    resources: { iron: 0, fuel: 0 },
    stock: { grenade: 0, dynamite: 0, charge: 0, sticky: 0, acid: 0 },
    selectedWeapon: "grenade",
    selectedPart: null,
    selectedFloor: 0,
    selectedModule: null,
    route: "stock",
    showTimerText: true,
    partInventory: {},
    researched: {
      ironGen: true,
      fuelGen: true,
      grenadeCtor: true,
      deposit: true,
      seller: true,
    },
    skills: {
      blast: 0,
      oreYield: 0,
      throwForce: 0,
      grenadeRadius: 0,
      dynamiteShards: 0,
      stickyRadius: 0,
      stickyGoo: 0,
      acidDuration: 0,
      gasIntake: 0,
      acidCount: 0,
      goldenGrenade: 0,
      criticalHit: 0,
      excavator: 0,
      volatileAcid: 0,
      stickGrenade: 0,
      generators: 0,
      assembly: 0,
      buffer: 0,
      storage: 0,
      sellerSpeed: 0,
      sellerValue: 0,
    },
    packets: [],
    nextPacketId: 1,
    floors: [
      {
        length: 4,
        slots: [
          { type: "ironGen" },
          { type: "fuelGen" },
          { type: "grenadeCtor", progress: 0 },
          { type: "deposit" },
        ],
      },
    ],
  };
  D.mineSave = null;
  // Throttled UI refresh flag: game logic calls D.markUI() instead of
  // rebuilding panels directly; the main loop applies it a few times a second.
  D.uiDirty = false;
  D.markUI = () => {
    D.uiDirty = true;
  };
  D.save = () => {
    if (D.noSave) return; // set while resetting so the reload doesn't re-save
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          state: D.state,
          mine: D.Mining ? D.Mining.saveData() : D.mineSave,
        }),
      );
    } catch (e) {}
  };
  D.load = () => {
    try {
      let d = JSON.parse(localStorage.getItem(KEY)) || null;
      if (d && d.state) {
        // saves from before research existed already had every part: keep them all
        if (!d.state.researched)
          d.state.researched = Object.fromEntries(
            Object.keys(D.parts).map((k) => [k, true]),
          );
        Object.assign(D.state, d.state);
        D.mineSave = d.mine || null;
      }
      D.state.stock = Object.assign(
        { grenade: 0, dynamite: 0, charge: 0, sticky: 0, acid: 0 },
        D.state.stock || {},
      );
      D.state.partInventory = D.state.partInventory || {};
      // saves from before research existed already had every part: keep them all
      if (!D.state.researched)
        D.state.researched = Object.fromEntries(
          Object.keys(D.parts).map((k) => [k, true]),
        );
      if (typeof D.state.showTimerText !== "boolean")
        D.state.showTimerText = true;
      D.state.skills = Object.assign(
        {
          blast: 0,
          oreYield: 0,
          throwForce: 0,
          grenadeRadius: 0,
          dynamiteShards: 0,
          stickyRadius: 0,
          stickyGoo: 0,
          acidDuration: 0,
          gasIntake: 0,
          acidCount: 0,
          goldenGrenade: 0,
          criticalHit: 0,
          excavator: 0,
          volatileAcid: 0,
          stickGrenade: 0,
          generators: 0,
          assembly: 0,
          buffer: 0,
          storage: 0,
          sellerSpeed: 0,
          sellerValue: 0,
        },
        D.state.skills || {},
      );
      // Removed "force" upgrades: refund what the player spent on them.
      const REMOVED = {
        explosivePower: 75,
        grenadePower: 85,
        dynamitePower: 100,
      };
      for (const [id, base] of Object.entries(REMOVED)) {
        const lv = D.state.skills[id] || 0;
        for (let k = 0; k < lv; k++) D.state.money += base + k * 65;
        delete D.state.skills[id];
      }
      D.state.packets = D.state.packets || [];
      D.state.nextPacketId = D.state.nextPacketId || 1;
    } catch (e) {}
  };
  D.load();
})();
