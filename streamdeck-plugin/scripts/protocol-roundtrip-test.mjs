// Standalone protocol round-trip test — no Stream Deck app, no Minecraft required.
// Spins up a localhost WebSocket server that mimics the plugin's ConnectionManager
// handshake, runs the real message shapes against it, and asserts the full contract:
//   hello -> hello_from_streamdeck + set_options + request_full_state -> hotbar_state
//   -> select_slot -> command_result
//   -> set_options{sendFullInventory:true} -> hotbar_state WITH extendedSlots (32 entries)
// Exits non-zero on any failure.
//
//   node scripts/protocol-roundtrip-test.mjs

import { WebSocketServer, WebSocket } from "ws";

const PORT = 38231; // off the default 38191 so it never clashes with a running plugin
const PROTOCOL_VERSION = 1;
const HOTBAR_SIZE = 9;
const TOTAL_SLOTS = 41;

let failures = 0;
const checks = [];
function check(name, cond) {
  checks.push({ name, ok: !!cond });
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

// --- server side (mimics ConnectionManager) ------------------------------
const server = new WebSocketServer({ host: "127.0.0.1", port: PORT });
let serverGotHello = false;
let phase = "hotbar-only";

server.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello_from_streamdeck", protocolVersion: PROTOCOL_VERSION, pluginVersion: "test", supports: { selectSlot: true } }));
  ws.send(JSON.stringify({ type: "set_options", protocolVersion: PROTOCOL_VERSION, sendFullInventory: false }));
  ws.send(JSON.stringify({ type: "request_full_state", protocolVersion: PROTOCOL_VERSION }));

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.protocolVersion !== PROTOCOL_VERSION) return;

    if (msg.type === "hello_from_minecraft") serverGotHello = true;

    if (msg.type === "hotbar_state" && phase === "hotbar-only") {
      check("hotbar_state has exactly 9 slots", Array.isArray(msg.slots) && msg.slots.length === HOTBAR_SIZE);
      check("hotbar-only state omits extendedSlots", msg.extendedSlots === undefined);
      check("selectedSlot in range", msg.selectedSlot >= 0 && msg.selectedSlot <= 8);
      check("slot0 itemId is diamond_sword", msg.slots[0].itemId === "minecraft:diamond_sword");
      check("slot0 durabilityPercent computed", msg.slots[0].durabilityPercent === Math.round(((1561 - 120) / 1561) * 100));
      check("empty slot4 has null itemId", msg.slots[4].empty === true && msg.slots[4].itemId === null);
      ws.send(JSON.stringify({ type: "select_slot", protocolVersion: PROTOCOL_VERSION, slot: 5, source: "streamdeck_key" }));
      return;
    }

    if (msg.type === "hotbar_state" && phase === "full") {
      check("full state still has 9 hotbar slots", msg.slots.length === HOTBAR_SIZE);
      check("extendedSlots present with 32 entries", Array.isArray(msg.extendedSlots) && msg.extendedSlots.length === TOTAL_SLOTS - HOTBAR_SIZE);
      const idx = msg.extendedSlots.map((s) => s.slot);
      check("extendedSlots span 9..40 in order", idx[0] === 9 && idx[idx.length - 1] === 40 && idx.every((v, i) => v === i + 9));
      const offhand = msg.extendedSlots.find((s) => s.slot === 40);
      check("offhand slot 40 present", !!offhand && offhand.itemId === "minecraft:shield");
      const boots = msg.extendedSlots.find((s) => s.slot === 36);
      check("armor slot 36 present", !!boots && boots.itemId === "minecraft:diamond_boots");
      const storage = msg.extendedSlots.find((s) => s.slot === 9);
      check("storage slot 9 present", !!storage && storage.itemId === "minecraft:oak_log");
      finish(ws);
      return;
    }

    if (msg.type === "command_result" && msg.command === "select_slot") {
      check("command_result success for slot 5", msg.success === true && msg.slot === 5);
      // Now flip to full inventory and expect a richer snapshot.
      phase = "full";
      ws.send(JSON.stringify({ type: "set_options", protocolVersion: PROTOCOL_VERSION, sendFullInventory: true }));
      return;
    }

    if (msg.type === "command_result" && msg.command === "set_options") {
      check("mod acked set_options", msg.success === true);
      return;
    }
  });
});

// --- client side (a minimal stand-in for the Minecraft mod) --------------
server.on("listening", () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  let sendFullInventory = false;

  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "hello_from_minecraft", protocolVersion: PROTOCOL_VERSION, modVersion: "test", minecraftVersion: "1.21.11", playerName: "Tester", supports: { hotbarState: true, selectSlot: true, icons: false } }));
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "set_options") {
      sendFullInventory = !!msg.sendFullInventory;
      ws.send(JSON.stringify({ type: "command_result", protocolVersion: PROTOCOL_VERSION, command: "set_options", success: true, slot: null, message: `sendFullInventory=${sendFullInventory}` }));
      // Shape changed -> push a fresh snapshot, mirroring the mod's forceFullResend().
      if (sendFullInventory) ws.send(JSON.stringify(buildState(true)));
      return;
    }
    if (msg.type === "request_full_state") {
      ws.send(JSON.stringify(buildState(sendFullInventory)));
      return;
    }
    if (msg.type === "select_slot") {
      check("mod received select_slot 5", msg.slot === 5);
      ws.send(JSON.stringify({ type: "command_result", protocolVersion: PROTOCOL_VERSION, command: "select_slot", success: true, slot: msg.slot, message: `Selected slot ${msg.slot}` }));
      return;
    }
  });
});

function mk(slot, itemId, displayName, count, maxCount, dmg = 0, maxDmg = 0) {
  return {
    slot, empty: itemId === null, itemId, displayName: displayName ?? "", count, maxCount,
    damageable: maxDmg > 0, damage: dmg, maxDamage: maxDmg,
    durabilityRemaining: maxDmg > 0 ? maxDmg - dmg : 0,
    durabilityPercent: maxDmg > 0 ? Math.round(((maxDmg - dmg) / maxDmg) * 100) : null,
    hasEnchantments: false,
  };
}

function buildState(full) {
  const state = {
    type: "hotbar_state", protocolVersion: PROTOCOL_VERSION, sequence: 1, timestampMillis: Date.now(),
    minecraftVersion: "1.21.11", modVersion: "test", inWorld: true, screenOpen: false, screenType: null,
    playerName: "Tester", selectedSlot: 2,
    slots: [
      mk(0, "minecraft:diamond_sword", "Diamond Sword", 1, 1, 120, 1561),
      mk(1, "minecraft:cooked_beef", "Steak", 32, 64),
      mk(2, "minecraft:iron_pickaxe", "Iron Pickaxe", 1, 1, 145, 250),
      mk(3, "minecraft:cobblestone", "Cobblestone", 64, 64),
      mk(4, null, "", 0, 0),
      mk(5, null, "", 0, 0),
      mk(6, null, "", 0, 0),
      mk(7, null, "", 0, 0),
      mk(8, "minecraft:torch", "Torch", 16, 64),
    ],
  };
  if (full) {
    const ext = [];
    for (let i = HOTBAR_SIZE; i < TOTAL_SLOTS; i++) {
      if (i === 9) ext.push(mk(9, "minecraft:oak_log", "Oak Log", 12, 64));
      else if (i === 36) ext.push(mk(36, "minecraft:diamond_boots", "Diamond Boots", 1, 1, 10, 429));
      else if (i === 40) ext.push(mk(40, "minecraft:shield", "Shield", 1, 1, 3, 336));
      else ext.push(mk(i, null, "", 0, 0));
    }
    state.extendedSlots = ext;
  }
  return state;
}

function finish(ws) {
  check("server received hello_from_minecraft", serverGotHello);
  try { ws.close(); } catch {}
  server.close(() => {
    console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
    process.exit(failures === 0 ? 0 : 1);
  });
}

setTimeout(() => { console.error("TIMEOUT — protocol did not complete"); process.exit(2); }, 5000);
