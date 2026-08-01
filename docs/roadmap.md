# Roadmap

## Milestone 0 — Repo skeleton ✅
Monorepo, README, protocol docs, mod + plugin skeletons.

## Milestone 1 — Text-only working pipeline ✅ (this build)
- Plugin hosts `127.0.0.1:38191`; mod connects with backoff.
- `hello` handshake; `hotbar_state` on change; `lifecycle_state` at menu.
- Keys show titles: item name + count/durability, `▶` for selected, "No MC"/"No World"/"—".
- Key press → `select_slot` → Minecraft selects the slot. No item icons yet.

## Milestone 1.5 — Full inventory mirror ✅ (this build)
- Protocol gained optional `extendedSlots` (slots 9-40) + a `set_options` negotiation message.
- Mod reads all 41 slots (27 storage, 4 armor, off-hand) — **only when a key needs them**.
- One key setting now addresses any slot 0-40 via a grouped dropdown; legacy `slotNumber` keys
  keep working.
- Storage/armor/off-hand keys are **read-only** — `select_slot` still rejects anything outside
  the hotbar, so no inventory automation was introduced.
- See [deck-layouts.md](deck-layouts.md) for what fits on each Stream Deck model.

## Milestone 2 — Better visuals (code already included, opt-in)
- Per-key **Display = Image** uses a dependency-free SVG tile: name, count, durability bar,
  selected border, enchant marker, empty/disconnected designs (`render/key-renderer.ts`).
- Next: tune layout, add a "screen open" overlay, debounce further.

## Milestone 3 — Real item icons ✅ (this build, via Option A)
- `npm run icons:extract` pulls textures straight out of the locally installed Minecraft client
  jar (dependency-free ZIP reader; nothing downloaded, no assets committed).
- Keys default to **"Item icon + count"**: the real 16×16 texture, scaled with
  `image-rendering: pixelated`, plus count, durability bar, enchant marker and selected border.
- **Automatic fallback to the item name** when no flat texture exists — shields and other
  entity-rendered items, modded items, or when the user never ran the extract step.
- Verified: 17/17 assertions against the real renderer's output (`npm run preview`).

### Still open (Option B — would need Minecraft-side rendering)
- Resource-pack-accurate art, modded item icons, true 3D block renders, enchantment glint.
- Requires rendering each `ItemStack` to an offscreen framebuffer in the mod and sending
  `iconBase64`. The protocol is already forward-compatible for this.

## Milestone 3.5 — Preset profile + icon polish ✅ (this build)
- `npm run profile` emits an importable `.streamDeckProfile` (hand-rolled ZIP writer, no deps)
  with all 9 hotbar keys + off-hand + 5 storage keys pre-configured for a 15-key MK.2/V2.
- **Fixed:** a modded item whose path collided with a vanilla one (e.g. `somemod:iron_ingot`)
  silently rendered the *vanilla* texture. Icon lookup is now restricted to the
  `minecraft:` namespace.
- Fallback names wrap onto up to 3 lines instead of truncating ("Silkworm Spawn Egg" was
  rendering as "Silkworm Sp…").
- Larger icons (84→96px); count gained a drop shadow so it stays legible on bright textures.
- Plugin/category/action icons are now a drawn hotbar mark instead of flat colour squares.

## Milestone 4 — Packaging
- `streamdeck pack` into a `.streamDeckPlugin`; signed mod jar release.
- Default 9-key Stream Deck profile; install guide; richer settings.

## Milestone 5 — Polish & expansion
- Configurable port via global plugin settings + property inspector.
- More lifecycle states (joining/left/error) and reconnection UX.
- A built-in "page" action so paging doesn't require Stream Deck profiles/folders.
- Stream Deck + dial support (e.g. scroll the hotbar with a dial).
- Read-only status keys: health, hunger, XP, armor points, potion effects.
