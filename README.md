# DeckCraft Hotbar

**v0.1.0** · Minecraft **1.21.11** (Fabric) · Stream Deck **6.5+** · client-side only

Mirror your **Minecraft Java 1.21.11 (Fabric)** hotbar onto an **Elgato Stream Deck**, and
select hotbar slots by pressing Stream Deck keys.

Status: working end-to-end on a 15-key Stream Deck MK.2 — live item icons, slot selection,
full-inventory mirroring, and a ready-made profile.

> **This is a client-side accessibility/control-display mod.** It mirrors your own hotbar to
> your local Stream Deck and lets you select hotbar slots. It does **not** automate attacks,
> clicks, item use, or inventory movement.

---

## What it is

- A **Fabric client mod** that reads your own inventory — the hotbar always, and optionally the
  27 storage slots, 4 armor slots and off-hand — and sends it to a local bridge over a
  localhost-only WebSocket.
- A **Stream Deck plugin** that hosts that bridge, shows each slot on a key, and sends
  "select slot N" back to Minecraft when you press a **hotbar** key.

> **Both halves are required.** The jar alone has nothing to talk to, and the plugin alone has no
> data. Installing the plugin is a one-time step.

## What it is NOT

- Not a cheat client, auto-combat, auto-clicker, or inventory automation mod.
- Not OCR, not screen scraping, not process-memory reading, not log parsing.
- It only **reads your own hotbar** and **changes the selected slot when you physically press a
  Stream Deck key** — exactly what pressing `1`–`9` in-game already does.

## Safety / anti-cheat warning

- This mirrors your own client state and performs the same action as pressing a number key.
- It does **not** bypass gameplay, reveal hidden server info, or send chat/inventory data.
- **Some servers disallow client-side mods in general.** You are responsible for following the
  rules of any server you join. Do not extend this with macros or combat automation.

---

## Requirements

- Minecraft Java Edition **1.21.11** with **Fabric Loader** and **Fabric API** (Java 21).
- **Elgato Stream Deck** app 6.5+ (Windows first; macOS should also work).
- **Node.js 20+** to build the Stream Deck plugin.

## Install — Minecraft mod

1. Build the mod (see `minecraft-fabric/`): `./gradlew build`
2. Copy `minecraft-fabric/build/libs/deckcraft-hotbar-0.1.0.jar` into your `.minecraft/mods` folder
   (the one for your 1.21.11 Fabric profile).
3. Make sure **Fabric API** is also in `mods`.

> Needs **JDK 21**. If Gradle can't find one, point it at yours, e.g.
> `JAVA_HOME=/c/Users/<you>/.jdks/jdk-21.x.x ./gradlew build`.

## Install — Stream Deck plugin

**Users:** download `com.fluffybacon.deckcraft-hotbar.streamDeckPlugin` from the
[releases page](https://github.com/FluffyBacon678/InputShowOff/releases) and **double-click it**.
That's the whole install — no terminal, no Node.

On first launch the plugin generates item icons from your own Minecraft installation in the
background (usually under a minute). Keys show item names until it finishes, then repaint with
real art. If Minecraft isn't installed for your user, keys simply keep showing names.

**From source:**

```bash
cd streamdeck-plugin
npm install
npm run build                       # icons + bundle
npx streamdeck link com.fluffybacon.deckcraft-hotbar.sdPlugin
npx streamdeck restart com.fluffybacon.deckcraft-hotbar
```

`npm run dist` validates the manifest and produces the `.streamDeckPlugin` in `dist/`.

## Item icons

Keys default to showing the **real item texture**, with the item's name as an automatic fallback.

Run once, after installing the plugin:

```bash
npm run icons:extract
```

This reads the textures out of the Minecraft client jar **already installed on your machine** and
copies them into the plugin. Nothing is downloaded, and no game assets are committed to this repo.
It auto-detects the newest installed version, or pass a path:
`npm run icons:extract -- "C:\path\to\1.21.11.jar"`.

This walks the game's **own model graph** (`assets/<ns>/items/*.json` → model → parent chain →
texture) rather than guessing that item `X` uses texture `X.png`, so the mapping is exact:

- **1487 of 1488 vanilla items resolve (99.9%)** — the one that doesn't is `air`.
- Covers awkward cases that filename-guessing misses: shields, beds, chests, spawn eggs, potions,
  and every block item.
- **Modded items work too** — see below.
- Skip this step entirely and every key just shows names. Nothing breaks.

### Mod compatibility

Fabric mods ship items, models and textures in exactly the same layout as vanilla, so the same
extractor handles them. It scans your `mods` folder automatically and resolves modded models even
when they inherit from vanilla ones (`minecraft:item/generated`):

```
Vanilla: 1487 items
Scanning 119 mod jars...  13 mods provided items
  1493 minecraft · 179 farmersdelight · 85 rusticdelight · 36 friendsandfoes
    35 travelersbackpack · 23 illagerinvasion · 10 untitledduckmod · 4 silkworms · …
```

Textures are stored per namespace (`items/<namespace>/<id>.png`), which makes the safety property
structural rather than a rule to remember: `somemod:iron_ingot` resolves under `items/somemod/`
and **can never be served vanilla's iron ingot**. If the mod is installed it gets its own art; if
not, the key shows the item name.

### Resource packs

Your **enabled** resource packs are applied too, in the same precedence order Minecraft uses
(read from `options.txt`, later packs win), so a key shows the item as *you* see it rather than
as vanilla draws it:

```
Applying 8 enabled resource pack(s)...
  27 textures replaced so icons match your game:
    VanillaTweaks (2) · Fancy Crops (11) · Better-Leaves (11) · 3D Ladders (1) · ...
```

Higher-resolution packs (Faithful 32×, etc.) work fine — keys scale whatever they find.

Re-run `npm run icons:extract` whenever you add or update mods **or change resource packs**.
Flags: `--no-mods` for vanilla only, `--no-resourcepacks` to ignore packs.

The mod itself adds no mixins and touches nothing but the local player's own inventory, so it has
no reason to conflict with other mods.

To preview exactly what your keys will look like: `npm run preview` → opens `preview-keys.html`.

## Minecraft icons for your *other* Stream Deck keys

```bash
npm run icons:library
```

Produces `dist/minecraft-deck-icons/<namespace>/` — **1863 item icons at 144×144** (vanilla *and*
your installed mods), upscaled with nearest-neighbour so the pixel art stays crisp, with
transparency preserved. Drag any of them onto **any** Stream Deck key: OBS scenes, folders,
website shortcuts, macros, other plugins' actions. Nothing about them is tied to this plugin.

Options: `-Size 288` for larger, `-DarkBackground` to flatten onto the deck's dark grey instead of
transparency. Animated textures (fire, water, portal) are cropped to their first frame.

> These are Minecraft's own textures read from your local install — for your personal use. Don't
> redistribute them. `npm run package` deliberately excludes them from the shippable plugin.

## Quick setup: import the ready-made profile

Instead of configuring keys one by one:

```bash
npm run profile
```

Produces `dist/DeckCraft Hotbar.streamDeckProfile` — **double-click it to import**, then pick
"DeckCraft Hotbar" from the profile dropdown. Layout on a 15-key deck:

```
row 1:  H1  H2  H3  H4  H5
row 2:  H6  H7  H8  H9  Off-hand
row 3:  S1  S2  S3  S4  S5      ← first 5 backpack slots (read-only)
```

A Stream Deck profile is bound to a **device model**. This one targets the 15-key
**MK.2 / V2 (`20GBA9901`)**. On a Mini, XL, + or Neo the key count differs, so lay those out by
hand (or regenerate with `SD_MODEL=<model> npm run profile` and edit the grid in
`scripts/make-profile.mjs`). See [docs/deck-layouts.md](docs/deck-layouts.md).

## Configure your keys

1. Open the Stream Deck app.
2. Find the **DeckCraft Hotbar** category, drag the **Hotbar Slot** action onto 9 keys.
3. In each key's property inspector, pick an **Inventory slot** — Hotbar 1-9, Storage 1-27,
   armor pieces, or off-hand.
4. Launch Minecraft 1.21.11 (Fabric) and join a world. Keys populate automatically.

**What's pressable:** only **hotbar** keys. Pressing one selects that slot, exactly like
pressing `1`-`9` in game. Storage, armor and off-hand keys are a **read-only mirror** — this mod
never moves items between slots.

**How many keys fit?** A 15-key MK.2/V2 holds the whole hotbar plus off-hand and armor; no
physical deck fits all 41 slots at once. See [docs/deck-layouts.md](docs/deck-layouts.md) for
per-model layouts and paging.

---

## How it works (architecture)

```
 Minecraft (Fabric client mod)                 Stream Deck plugin (Node.js)
 ┌───────────────────────────┐   ws://127.0.0.1:38191   ┌──────────────────────────┐
 │ HotbarStateReader (tick)  │ ───── hotbar_state ─────► │ ConnectionManager (server)│
 │ HotbarStateTracker        │ ◄──── select_slot ─────── │ HotbarStateStore          │
 │ DeckCraftConnectionClient │                           │ HotbarSlotAction (9 keys) │
 │   (JDK java.net.http WS)  │                           │ KeyRenderer               │
 └───────────────────────────┘                           └──────────────────────────┘
```

- The **Stream Deck plugin hosts** the WebSocket server (it is the long-lived UI endpoint).
- The **Minecraft mod is the client** and reconnects with backoff. If the plugin isn't running,
  Minecraft keeps running silently and retries.
- The mod uses the **JDK's built-in `java.net.http.WebSocket`** — no third-party WebSocket
  dependency, no shading headaches inside Fabric.

See [docs/protocol.md](docs/protocol.md) for the wire format.

---

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md). Quick hits:

- **Key shows "No MC"** → Stream Deck plugin is running but Minecraft isn't connected. Launch MC.
- **Key shows "No World"** → MC is connected but you're at the main menu. Join a world.
- **Minecraft log: connection refused** → the Stream Deck plugin/bridge isn't running yet.
- **Port already in use** → another app holds 38191; close it or change the port on both sides.

---

## Known limitations

- **MVP shows readable text, not real item icons.** Icons are Milestone 2/3 (see roadmap).
- Modded item icons need Minecraft-side rendering (future).
- Both Minecraft and the Stream Deck app must be running.
- **Fabric 1.21.11 API names may need a one-line compile-time adjustment** — every such spot is
  marked `VERSION-SENSITIVE` in the Java source. See
  [docs/version-sensitive-apis.md](docs/version-sensitive-apis.md).

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

---

## Repository layout

```
deckcraft-hotbar/
  minecraft-fabric/     Fabric 1.21.11 client mod (Gradle + Loom)
  streamdeck-plugin/    Elgato Stream Deck plugin (TypeScript + Node)
  docs/                 protocol, troubleshooting, roadmap, version notes
  test/sample-messages/ example protocol JSON for manual testing
```

## License

MIT (see each subproject). You are responsible for complying with server rules.
