# Modrinth listing — copy/paste + compliance checklist

Checked against <https://modrinth.com/legal/rules>. Section numbers below refer to that page.

---

## ⚠️ The setting that got Silkworms flagged

Silkworms was corrected by moderators over **Environment Metadata** (§5.1). DeckCraft Hotbar is a
**different case** — it is client-only, so do NOT copy Silkworms' "Client and server" setting.

Set on the **version**, in Version Settings:

| Field | Value | Why |
|---|---|---|
| **Client side** | **Required** | The mod only does anything on the client. |
| **Server side** | **Unsupported** | It is never installed on, or needed by, a server. |

`fabric.mod.json` already declares `"environment": "client"`, which matches.

---

## Project metadata

| Field | Value |
|---|---|
| **Name** | `DeckCraft Hotbar` (§5.1 — name only, no taglines) |
| **Summary** | see below (plain text, no formatting, don't repeat the title) |
| **License** | `MIT` — matches `LICENSE` and `fabric.mod.json` |
| **Categories** | Utility, Management |
| **Loaders** | Fabric |
| **Game version** | 1.21.11 |
| **Source** | https://github.com/FluffyBacon678/InputShowOff |
| **Issues** | https://github.com/FluffyBacon678/InputShowOff/issues |

### Summary (paste as-is)

```
Mirrors your Minecraft hotbar onto an Elgato Stream Deck and lets you select hotbar slots from it. Requires the companion Stream Deck plugin and Stream Deck hardware.
```

That second sentence is deliberate: §2.1 requires "critical pre-download information", and the
single most important fact is that **the jar alone does nothing**.

---

## Description body (paste into the editor)

```markdown
DeckCraft Hotbar puts your Minecraft hotbar on your Elgato Stream Deck. Each key shows a real
hotbar slot — item icon, stack count, and a durability bar — and updates live as you play.
Press a key and Minecraft selects that slot, exactly like pressing 1–9 on the keyboard.

## You need all three

This mod does **nothing on its own**. To use it you need:

1. This mod (plus Fabric API) in your `mods` folder
2. The **DeckCraft Hotbar Stream Deck plugin** — https://github.com/FluffyBacon678/InputShowOff
3. Elgato Stream Deck hardware and the Stream Deck app (6.5+)

A 15-key Stream Deck fits the whole hotbar plus your off-hand and all four armor slots. An
importable profile is included so you don't have to configure keys one by one.

## What it shows

- All 9 hotbar slots, with the selected slot highlighted
- Item icon, stack count, durability bar, and an enchantment marker
- Optionally your 27 storage slots, 4 armor slots, and off-hand — read-only
- Clear "no Minecraft" and "no world" states

## What it does not do

- It does **not** automate attacks, clicks, item use, or inventory movement
- It does **not** move items between slots — storage, armor and off-hand keys are display-only
- It does **not** read anything beyond your own inventory: no chat, no other players, no
  containers, no world data
- It is **not** OCR, screen scraping, or memory reading — it is a normal Fabric client mod

## Networking

The mod connects to `127.0.0.1:38191` on your own computer to talk to the Stream Deck plugin.
It never connects to the internet and never sends your data anywhere. Non-loopback addresses are
rejected in code, and the Stream Deck plugin binds to localhost only.

## Server rules

Selecting a hotbar slot is the same action as pressing 1–9, and no automation is added. Even so,
some servers disallow client mods in general — you are responsible for the rules of servers you
join.

## Item icons

Item art is generated on your machine at setup time from your own Minecraft installation. No game
assets are redistributed by this project. Items without a flat texture (shields, modded items)
fall back to showing the item name.
```

---

## Rule-by-rule check

| Rule | Status |
|---|---|
| **§1.11** — no uploading data to a remote server without disclosure | ✅ Loopback only; `DeckCraftConfig` force-rejects non-loopback hosts; disclosed in a dedicated section. |
| **§2 / §2.1** — clear and honest function, critical pre-download info | ✅ "You need all three" is the second section; also in the summary. |
| **§2.2** — plain text, English | ✅ |
| **§4** — copyright / reuploads | ✅ The jar contains no Minecraft assets. Icons are extracted from the user's own install at setup and are gitignored. Mod icon is original artwork. |
| **§5.1** — accurate metadata (license, environment, tags) | ✅ MIT everywhere; **Client required / Server unsupported**; Utility + Management. |
| **§5.1** — title is name only | ✅ "DeckCraft Hotbar" |
| **§5.1** — summary has no formatting or title repetition | ✅ |
| **§5.1** — gallery images relevant, with titles | ⬜ Upload `branding/modrinth-banner-1920.jpg`, title it e.g. "Hotbar mirrored to a Stream Deck MK.2" |

## Gallery / icon

- **Icon** → `branding/modrinth-icon-512.png` (512×512, 522 KB — under Modrinth's 1 MB cap)
- **Gallery** → `branding/modrinth-banner-1920.jpg` (236 KB), set as featured, give it a real title

An in-game screenshot of the deck running beside Minecraft would be a strong second gallery
image — it is the clearest proof of what the mod does.

---

## ⚠️ Do not ship Minecraft textures with the Stream Deck plugin

On Modrinth you upload **only the jar**, which is clean. But if you ever distribute the Stream Deck
plugin as a packaged `.streamDeckPlugin` (Elgato Marketplace, a GitHub release, etc.), do **not**
include `imgs/items/` — those are ~1832 textures extracted from Minecraft, and redistributing them
would be a copyright problem (§4 in spirit, and Mojang's asset terms).

Ship the plugin without that folder and let `npm run icons:extract` populate it on the user's own
machine. The plugin already degrades to item names when the folder is missing, so this works.
