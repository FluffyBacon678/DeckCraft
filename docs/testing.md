# Testing

## Automated (no Minecraft, no Stream Deck hardware)

| Command | Where | Covers |
|---|---|---|
| `npm run typecheck` | `streamdeck-plugin/` | TypeScript against the real Stream Deck SDK |
| `npm test` | `streamdeck-plugin/` | 17 protocol assertions incl. the full-inventory `set_options` negotiation |
| `npm run preview` | `streamdeck-plugin/` | Renders every key state with the real renderer → `preview-keys.html` |
| `bash nettest/run-net-test.sh` | `minecraft-fabric/` | 9 live checks of the mod's real networking classes against a fake bridge |
| `./gradlew build` | `minecraft-fabric/` | Compiles the mod against real MC 1.21.11 + Yarn |

`npm run fake-mc` drives the plugin with a simulated hotbar so you can verify the whole
Stream Deck half without launching Minecraft.

## Manual checklist (the part automation can't reach)

Mod loads and connects:
- [ ] Minecraft log shows `DeckCraft Hotbar initialized`
- [ ] Minecraft log shows `Connected to Stream Deck bridge`
- [ ] Keys leave "No MC" once Minecraft starts, and "No World" once you join a world

Live mirroring:
- [ ] Scroll the mouse wheel → the highlighted key follows
- [ ] Press `1`–`9` in game → the highlight follows
- [ ] Move an item in the hotbar → the key updates
- [ ] Eat / place blocks → the count updates
- [ ] Damage a tool → the durability bar shrinks and changes colour
- [ ] Storage / armor / off-hand keys show the right items

Control:
- [ ] Press a hotbar key → Minecraft selects that slot
- [ ] Press a **storage** key → nothing happens (read-only by design)
- [ ] Open chat, press a hotbar key → ignored (`screen_open`)
- [ ] Open the inventory, press a hotbar key → ignored

Lifecycle:
- [ ] Leave to the main menu → keys show "No World"
- [ ] Quit Minecraft → keys show "No MC"
- [ ] Relaunch Minecraft → reconnects automatically
- [ ] Restart the Stream Deck app while Minecraft runs → mod reconnects

Multiplayer:
- [ ] Join a server → hotbar mirrors correctly
- [ ] Selecting a slot works and the held item updates for other players
- [ ] No item movement or automation of any kind occurs

## Known-good environment

Verified on: Minecraft 1.21.11 Fabric (loader 0.19.3) with Fabric API 0.141.3 in a
120-mod pack, Stream Deck MK.2 (`20GBA9901`), Windows 10, JDK 21, Node 24.
