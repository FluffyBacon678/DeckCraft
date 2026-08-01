// Generates an importable Stream Deck profile so the user doesn't have to configure 15 keys
// by hand.  npm run profile
//
// Produces  dist/DeckCraft Hotbar.streamDeckProfile  — double-click it to import.
//
// Layout on a 15-key Stream Deck (MK.2 / V2), coordinates are "column,row":
//   row 0:  H1  H2  H3  H4  H5
//   row 1:  H6  H7  H8  H9  Off-hand
//   row 2:  S1  S2  S3  S4  S5      (first 5 backpack/storage slots, read-only)
//
// Writes a real ZIP with a tiny built-in writer (stored/no compression) — no dependency.

import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import zlib from "node:zlib";

// ---- minimal ZIP writer (method 0 = stored) -----------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);         // version needed
    lh.writeUInt16LE(0, 6);          // flags
    lh.writeUInt16LE(0, 8);          // method: stored
    lh.writeUInt16LE(0, 10);         // time
    lh.writeUInt16LE(0x21, 12);      // date (arbitrary, valid)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

// ---- profile contents ---------------------------------------------------
const ACTION_UUID = "com.fluffybacon.deckcraft-hotbar.slot";
const PROFILE_NAME = "DeckCraft Hotbar";

// Stream Deck MK.2 / V2 (15 keys). Other models must be laid out by hand — a profile is
// bound to a device model, so importing this onto a Mini/XL/+ will not map cleanly.
const DEVICE_MODEL = process.env.SD_MODEL || "20GBA9901";

function key(slotIndex, display = "icon") {
  return {
    ActionID: randomUUID(),
    LinkedTitle: true,
    Name: "Hotbar Slot",
    Resources: null,
    // Settings are strings because the property inspector's <select> stores strings.
    Settings: { slotIndex: String(slotIndex), display },
    State: 0,
    States: [{}],
    UUID: ACTION_UUID,
  };
}

// "column,row"
const actions = {};
for (let c = 0; c < 5; c++) actions[`${c},0`] = key(c);          // hotbar 1-5  -> 0..4
for (let c = 0; c < 4; c++) actions[`${c},1`] = key(5 + c);      // hotbar 6-9  -> 5..8
actions["4,1"] = key(40);                                        // off-hand
for (let c = 0; c < 5; c++) actions[`${c},2`] = key(9 + c);      // storage 1-5 -> 9..13

const pageId = randomUUID().toUpperCase();
const pageManifest = { Controllers: [{ Actions: actions }] };
const rootManifest = {
  Device: { Model: DEVICE_MODEL, UUID: "" },
  Name: PROFILE_NAME,
  Pages: { Current: pageId.toLowerCase(), Default: pageId.toLowerCase(), Pages: [pageId.toLowerCase()] },
  Version: "3.0",
};

const root = `${PROFILE_NAME}.sdProfile`;
const files = [
  { name: `${root}/manifest.json`, data: Buffer.from(JSON.stringify(rootManifest), "utf8") },
  { name: `${root}/Profiles/${pageId}/manifest.json`, data: Buffer.from(JSON.stringify(pageManifest), "utf8") },
];

mkdirSync("dist", { recursive: true });
const out = `dist/${PROFILE_NAME}.streamDeckProfile`;
writeFileSync(out, zip(files));

console.log(`Wrote ${out}`);
console.log(`  device model : ${DEVICE_MODEL} (15-key Stream Deck MK.2 / V2)`);
console.log(`  keys         : 9 hotbar + off-hand + 5 storage = ${Object.keys(actions).length}`);
console.log("Double-click the file to import, then pick it from the profile dropdown.");
