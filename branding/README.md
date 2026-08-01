# Branding assets

All generated from two source artworks by `make-branding.ps1` (uses .NET System.Drawing —
built into Windows, no image library needed):

```bash
powershell -ExecutionPolicy Bypass -File branding\make-branding.ps1
```

## Sources

| File | Size | Used for |
|---|---|---|
| `source/icon-source.png` | 1254×1254 | everything square |
| `source/banner-source.png` | 1672×941 | the wide banner |

Edit the sources and re-run the script; every derived asset regenerates.

## Generated

| File | Size | Where it goes |
|---|---|---|
| `modrinth-icon-512.png` | 512×512, 522 KB | **Modrinth** project icon (their limit is 1 MB) |
| `modrinth-banner-1920.jpg` | 1920×1081, 236 KB | **Modrinth** gallery image — prefer this one |
| `modrinth-banner-1920.png` | 1920×1081, 3.5 MB | same image lossless, if you ever need it |
| `../minecraft-fabric/.../assets/deckcraft_hotbar/icon.png` | 256×256 | **Fabric Mod Menu** (referenced by `fabric.mod.json`) |
| `../streamdeck-plugin/.../imgs/plugin/marketplace.png` (+`@2x`) | 256 / 512 | **Stream Deck** plugin icon |

## Deliberately NOT using the artwork

The Stream Deck **category icon** (28×28) and **action icon** (20×20) stay as the simple drawn
hotbar mark from `streamdeck-plugin/scripts/make-placeholder-icons.mjs`. At those sizes the
detailed artwork turns to mush; a flat, high-contrast mark reads far better in the action list.

## Uploading to Modrinth

1. Project icon → `modrinth-icon-512.png`
2. Gallery → `modrinth-banner-1920.jpg` (set it as the featured image)
3. Remember the mod is **client-side only** — set *Client side: required*, *Server side: unsupported*,
   and tag it Utility / Management.
