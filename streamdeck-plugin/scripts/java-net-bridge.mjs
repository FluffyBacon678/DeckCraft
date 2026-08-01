// Fake Stream Deck bridge for the Java networking test. Verifies what the MOD sends, then
// sends a select_slot back plus deliberately hostile input the mod must survive.
//
// Prints "BRIDGE_RESULT <json>" at the end so the runner can assert on it.

import { WebSocketServer } from "ws";

const PORT = Number(process.argv[2] || 38251);
const seen = { hello: false, hotbar: false, burst: 0, slots: 0, selected: null, sword: null };

const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });
console.log(`[bridge] listening on 127.0.0.1:${PORT}`);

wss.on("connection", (ws) => {
  console.log("[bridge] mod connected");

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { console.log("[bridge] non-JSON!"); return; }

    if (m.type === "hello_from_minecraft") {
      seen.hello = m.protocolVersion === 1 && m.minecraftVersion === "1.21.11" && !!m.supports?.selectSlot;
      console.log("[bridge] <<< hello_from_minecraft");
      // Reply with a mix of valid + hostile messages; the mod must ignore the bad ones.
      ws.send("this is not json at all");
      ws.send(JSON.stringify({ type: "hello_from_streamdeck", protocolVersion: 99, pluginVersion: "x" })); // bad version
      ws.send(JSON.stringify({ type: "totally_unknown_type", protocolVersion: 1 }));
      ws.send(JSON.stringify({ type: "select_slot", protocolVersion: 1, slot: 7, source: "test" }));
    }

    if (m.type === "hotbar_state") {
      seen.hotbar = true;
      seen.slots = Array.isArray(m.slots) ? m.slots.length : 0;
      const s0 = m.slots?.[0];
      seen.sword = s0 ? `${s0.itemId}|${s0.count}|${s0.durabilityPercent}|${s0.hasEnchantments}` : null;
      seen.selected = m.selectedSlot;
      console.log(`[bridge] <<< hotbar_state (${seen.slots} slots, selected=${seen.selected})`);
    }

    if (m.type === "command_result" && m.command === "burst") seen.burst++;
  });

  ws.on("close", () => {
    console.log("[bridge] mod disconnected");
    console.log("BRIDGE_RESULT " + JSON.stringify(seen));
    setTimeout(() => { wss.close(); process.exit(0); }, 100);
  });
});

// Safety valve so the test can never hang CI.
setTimeout(() => {
  console.log("BRIDGE_RESULT " + JSON.stringify(seen));
  process.exit(0);
}, 30000);
