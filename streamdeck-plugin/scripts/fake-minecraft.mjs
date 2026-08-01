// Pretends to be the Minecraft mod so you can verify the Stream Deck plugin WITHOUT
// launching Minecraft. Connects to the plugin's bridge, sends a hotbar snapshot, then
// moves the selected slot across the keys once a second. Logs any select_slot it receives.
//
//   cd streamdeck-plugin && npm run fake-mc
//
// Resolves the `ws` package from streamdeck-plugin/node_modules (run from that folder).

import { WebSocket } from "ws";

const PORT = 38191;
const url = `ws://127.0.0.1:${PORT}`;
console.log(`[fake-mc] connecting to ${url} ...`);

const ws = new WebSocket(url);

const items = [
  { itemId: "minecraft:diamond_sword", displayName: "Diamond Sword", count: 1, maxCount: 1, damageable: true, damage: 120, maxDamage: 1561 },
  { itemId: "minecraft:cooked_beef", displayName: "Steak", count: 32, maxCount: 64, damageable: false },
  { itemId: "minecraft:iron_pickaxe", displayName: "Iron Pickaxe", count: 1, maxCount: 1, damageable: true, damage: 145, maxDamage: 250 },
  { itemId: "minecraft:cobblestone", displayName: "Cobblestone", count: 64, maxCount: 64, damageable: false },
  null,
  { itemId: "minecraft:torch", displayName: "Torch", count: 16, maxCount: 64, damageable: false },
  { itemId: "minecraft:bow", displayName: "Bow", count: 1, maxCount: 1, damageable: true, damage: 200, maxDamage: 384 },
  null,
  { itemId: "minecraft:golden_apple", displayName: "Golden Apple", count: 3, maxCount: 64, damageable: false },
];

function slot(i) {
  const it = items[i];
  if (!it) {
    return { slot: i, empty: true, itemId: null, displayName: "", count: 0, maxCount: 0, damageable: false, damage: 0, maxDamage: 0, durabilityRemaining: 0, durabilityPercent: null, hasEnchantments: false };
  }
  const remaining = it.damageable ? it.maxDamage - it.damage : 0;
  return {
    slot: i, empty: false, itemId: it.itemId, displayName: it.displayName,
    count: it.count, maxCount: it.maxCount, damageable: !!it.damageable,
    damage: it.damage ?? 0, maxDamage: it.maxDamage ?? 0,
    durabilityRemaining: remaining,
    durabilityPercent: it.damageable ? Math.round((remaining / it.maxDamage) * 100) : null,
    hasEnchantments: it.itemId === "minecraft:diamond_sword",
  };
}

let selected = 0;
let seq = 0;
let sendFullInventory = false;

// Slots 9-40: 27 storage, 4 armor (36-39), offhand (40). Enough variety to eyeball the UI.
const extendedItems = {
  9: { itemId: "minecraft:oak_log", displayName: "Oak Log", count: 12, maxCount: 64 },
  10: { itemId: "minecraft:iron_ingot", displayName: "Iron Ingot", count: 34, maxCount: 64 },
  11: { itemId: "minecraft:redstone", displayName: "Redstone", count: 7, maxCount: 64 },
  18: { itemId: "minecraft:bread", displayName: "Bread", count: 5, maxCount: 64 },
  27: { itemId: "minecraft:ender_pearl", displayName: "Ender Pearl", count: 2, maxCount: 16 },
  35: { itemId: "minecraft:diamond", displayName: "Diamond", count: 9, maxCount: 64 },
  36: { itemId: "minecraft:diamond_boots", displayName: "Diamond Boots", count: 1, maxCount: 1, damageable: true, damage: 10, maxDamage: 429 },
  37: { itemId: "minecraft:diamond_leggings", displayName: "Diamond Leggings", count: 1, maxCount: 1, damageable: true, damage: 60, maxDamage: 495 },
  38: { itemId: "minecraft:diamond_chestplate", displayName: "Diamond Chestplate", count: 1, maxCount: 1, damageable: true, damage: 200, maxDamage: 528 },
  39: { itemId: "minecraft:diamond_helmet", displayName: "Diamond Helmet", count: 1, maxCount: 1, damageable: true, damage: 5, maxDamage: 363 },
  40: { itemId: "minecraft:shield", displayName: "Shield", count: 1, maxCount: 1, damageable: true, damage: 3, maxDamage: 336 },
};

function extendedSlot(i) {
  const it = extendedItems[i];
  if (!it) {
    return { slot: i, empty: true, itemId: null, displayName: "", count: 0, maxCount: 0, damageable: false, damage: 0, maxDamage: 0, durabilityRemaining: 0, durabilityPercent: null, hasEnchantments: false };
  }
  const remaining = it.damageable ? it.maxDamage - it.damage : 0;
  return {
    slot: i, empty: false, itemId: it.itemId, displayName: it.displayName,
    count: it.count, maxCount: it.maxCount, damageable: !!it.damageable,
    damage: it.damage ?? 0, maxDamage: it.maxDamage ?? 0,
    durabilityRemaining: remaining,
    durabilityPercent: it.damageable ? Math.round((remaining / it.maxDamage) * 100) : null,
    hasEnchantments: false,
  };
}

function sendState() {
  seq++;
  const msg = {
    type: "hotbar_state", protocolVersion: 1, sequence: seq, timestampMillis: Date.now(),
    minecraftVersion: "1.21.11", modVersion: "fake", inWorld: true, screenOpen: false,
    screenType: null, playerName: "FakeSteve", selectedSlot: selected,
    slots: Array.from({ length: 9 }, (_, i) => slot(i)),
  };
  if (sendFullInventory) {
    msg.extendedSlots = Array.from({ length: 32 }, (_, i) => extendedSlot(i + 9));
  }
  ws.send(JSON.stringify(msg));
}

ws.on("open", () => {
  console.log("[fake-mc] connected. Sending hello + initial hotbar.");
  ws.send(JSON.stringify({
    type: "hello_from_minecraft", protocolVersion: 1, modVersion: "fake",
    minecraftVersion: "1.21.11", playerName: "FakeSteve",
    supports: { hotbarState: true, selectSlot: true, icons: false },
  }));
  sendState();
  setInterval(() => {
    selected = (selected + 1) % 9;
    sendState();
    console.log(`[fake-mc] selectedSlot -> ${selected}`);
  }, 1500);
});

ws.on("message", (data) => {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  if (msg.type === "select_slot") {
    selected = msg.slot;
    console.log(`[fake-mc] <<< select_slot ${msg.slot} (from Stream Deck key). Applying + echoing.`);
    sendState();
    ws.send(JSON.stringify({ type: "command_result", protocolVersion: 1, command: "select_slot", success: true, slot: msg.slot, message: `Selected slot ${msg.slot}` }));
  } else if (msg.type === "set_options") {
    sendFullInventory = !!msg.sendFullInventory;
    console.log(`[fake-mc] <<< set_options sendFullInventory=${sendFullInventory}`);
    ws.send(JSON.stringify({ type: "command_result", protocolVersion: 1, command: "set_options", success: true, slot: null, message: `sendFullInventory=${sendFullInventory}` }));
    sendState();
  } else {
    console.log(`[fake-mc] <<< ${msg.type}`);
  }
});

ws.on("close", () => console.log("[fake-mc] disconnected."));
ws.on("error", (e) => console.log(`[fake-mc] error: ${e.message} (is the plugin running?)`));
