# DeckCraft Hotbar — Local Protocol (v1)

A tiny JSON-over-WebSocket protocol between the **Minecraft Fabric mod** (client) and the
**Stream Deck plugin** (server). Localhost only.

- **Transport:** WebSocket, text frames, one JSON object per frame.
- **Server:** Stream Deck plugin, binds `127.0.0.1:38191`.
- **Client:** Minecraft mod connects out, reconnects with backoff.
- **Every message** has `type` (string) and `protocolVersion` (number, currently `1`).
- Messages with the wrong `protocolVersion` or unknown `type` are ignored.

## Slot numbering

The full player inventory is **41 slots, zero-based `0..40`**:

| Range | Section | Interactive? |
|-------|---------|--------------|
| `0..8` | Hotbar | ✅ `select_slot` works |
| `9..35` | Storage (3 rows of 9) | ❌ read-only |
| `36..39` | Armor — boots, leggings, chestplate, helmet | ❌ read-only |
| `40` | Off-hand | ❌ read-only |

**Only the hotbar is selectable** — Minecraft has no concept of "selecting" a storage slot, and
moving items between slots would be inventory automation, which this project does not do.
`select_slot` therefore rejects anything outside `0..8`.

The Stream Deck UI labels hotbar keys **1..9** for humans; the wire is always zero-based.

---

## Minecraft → Stream Deck

### `hello_from_minecraft`
Sent immediately after the socket opens.
```json
{ "type": "hello_from_minecraft", "protocolVersion": 1, "modVersion": "0.1.0",
  "minecraftVersion": "1.21.11", "playerName": "Player",
  "supports": { "hotbarState": true, "selectSlot": true, "icons": false } }
```

### `hotbar_state`
Sent on connect and whenever visible content changes (throttled to ~20/s max).
`sequence` and `timestampMillis` are NOT part of change detection.
```json
{ "type": "hotbar_state", "protocolVersion": 1, "sequence": 42, "timestampMillis": 1730000000000,
  "minecraftVersion": "1.21.11", "modVersion": "0.1.0",
  "inWorld": true, "screenOpen": false, "screenType": null, "playerName": "Player",
  "selectedSlot": 2,
  "slots": [
    { "slot": 0, "empty": false, "itemId": "minecraft:diamond_sword", "displayName": "Diamond Sword",
      "count": 1, "maxCount": 1, "damageable": true, "damage": 120, "maxDamage": 1561,
      "durabilityRemaining": 1441, "durabilityPercent": 92, "hasEnchantments": true },
    { "slot": 1, "empty": false, "itemId": "minecraft:cooked_beef", "displayName": "Steak",
      "count": 32, "maxCount": 64, "damageable": false, "damage": 0, "maxDamage": 0,
      "durabilityRemaining": 0, "durabilityPercent": null, "hasEnchantments": false },
    { "slot": 2, "empty": true, "itemId": null, "displayName": "", "count": 0, "maxCount": 0,
      "damageable": false, "damage": 0, "maxDamage": 0, "durabilityRemaining": 0,
      "durabilityPercent": null, "hasEnchantments": false }
  ] }
```
`slots` **always contains exactly the 9 hotbar entries (0..8)**.

#### Optional `extendedSlots` (slots 9..40)

When the plugin has asked for the full inventory (see `set_options`), the message also carries
an `extendedSlots` array with **32 entries covering slots 9..40 in order** — same object shape as
`slots`. The field is **omitted entirely** when only the hotbar is needed, so the default case
stays small:

```json
{ "type": "hotbar_state", "protocolVersion": 1, "...": "...",
  "slots": [ "…9 hotbar entries…" ],
  "extendedSlots": [
    { "slot": 9, "empty": false, "itemId": "minecraft:oak_log", "displayName": "Oak Log",
      "count": 12, "maxCount": 64, "damageable": false, "damage": 0, "maxDamage": 0,
      "durabilityRemaining": 0, "durabilityPercent": null, "hasEnchantments": false },
    { "slot": 36, "empty": false, "itemId": "minecraft:diamond_boots", "displayName": "Diamond Boots",
      "count": 1, "maxCount": 1, "damageable": true, "damage": 10, "maxDamage": 429,
      "durabilityRemaining": 419, "durabilityPercent": 98, "hasEnchantments": false },
    "…through slot 40…"
  ] }
```

Consumers written against the original v1 shape ignore the unknown field and keep working, so
this is a backward-compatible addition — no protocol version bump.

### `lifecycle_state`
Sent when not in a world (e.g. main menu), once per transition.
```json
{ "type": "lifecycle_state", "protocolVersion": 1, "state": "main_menu",
  "inWorld": false, "message": "No world loaded" }
```
States: `minecraft_open`, `main_menu`, `joining_world`, `in_world`, `left_world`,
`disconnected`, `error`. (MVP emits `main_menu` / `in_world`; the rest are reserved.)

### `command_result`
Reply to a command.
```json
{ "type": "command_result", "protocolVersion": 1, "command": "select_slot",
  "success": true, "slot": 3, "message": "Selected slot 3" }
```
Failure `message` values: `invalid_slot`, `not_in_world`, `screen_open`, `client_unavailable`, `error: ...`.

---

## Stream Deck → Minecraft

### `hello_from_streamdeck`
Sent right after Minecraft connects.
```json
{ "type": "hello_from_streamdeck", "protocolVersion": 1, "pluginVersion": "0.1.0",
  "supports": { "selectSlot": true } }
```

### `select_slot`
Sent on key press. Slot is `0..8`.
```json
{ "type": "select_slot", "protocolVersion": 1, "slot": 3, "source": "streamdeck_key" }
```
Rules: invalid slots rejected; only honoured in a world with no screen open.

### `request_full_state`
Ask Minecraft to resend the current snapshot. The plugin sends this right after connect.
```json
{ "type": "request_full_state", "protocolVersion": 1 }
```

### `set_options`
Tells Minecraft what data the plugin actually needs, so it can skip work. Sent on connect and
whenever the answer changes (e.g. the user configures a storage key).
```json
{ "type": "set_options", "protocolVersion": 1, "sendFullInventory": true }
```
- `sendFullInventory` — when `true`, `hotbar_state` includes `extendedSlots` (slots 9..40).
  Defaults to **`false`** on the mod side, so a freshly (re)connected mod sends hotbar only until
  asked otherwise. The plugin re-sends this on every connect.
- Unknown options are ignored. A non-boolean value is rejected with `invalid_option`.
- Minecraft replies with `command_result` for `command: "set_options"` and immediately pushes a
  fresh snapshot, since the message shape changed.
- The mod also has a `forceFullInventory=true` config flag for debugging without a plugin.

---

## Connection lifecycle

1. Plugin starts → server listens on `127.0.0.1:38191`.
2. Minecraft connects → sends `hello_from_minecraft`.
3. Plugin replies `hello_from_streamdeck` + `set_options` + `request_full_state`.
4. Minecraft pushes `hotbar_state` (or `lifecycle_state` if not in world), then on every change.
5. Key press → `select_slot` → `command_result`.
6. Either side drops → Minecraft reconnects with backoff (1→2→4…→30s); plugin keeps listening.

## Security rules

- Server binds `127.0.0.1` only; non-loopback connections are rejected.
- All JSON is validated; unknown types and bad `protocolVersion` are ignored.
- No code is ever executed from messages. No auth tokens, server IPs, or chat are ever sent.
- Inventory data is limited to the player's **own** 41 inventory slots, and only sent when the
  plugin asks. No containers, no other players, no world data.
- The only state-changing command is `select_slot`, restricted to the hotbar (`0..8`). There is
  no message that moves, drops, swaps, or uses an item.

## Forward compatibility

`iconBase64` may be added to each slot later (Milestone 3). Consumers must ignore unknown fields,
so adding it will not break v1 clients.
