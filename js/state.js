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
    stock: { grenade: 0, dynamite: 0, charge: 0, sticky: 0 },
    selectedWeapon: "grenade",
    selectedPart: null,
    selectedFloor: 0,
    selectedModule: null,
    route: "stock",
    showTimerText: true,
    partInventory: {},
    skills: {
      blast: 0,
      oreYield: 0,
      throwForce: 0,
      grenadeRadius: 0,
      dynamiteShards: 0,
      stickyRadius: 0,
      stickyGoo: 0,
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
        Object.assign(D.state, d.state);
        D.mineSave = d.mine || null;
      }
      D.state.stock = Object.assign(
        { grenade: 0, dynamite: 0, charge: 0, sticky: 0 },
        D.state.stock || {},
      );
      D.state.partInventory = D.state.partInventory || {};
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
