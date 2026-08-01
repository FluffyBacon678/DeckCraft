# DeckCraft Hotbar — Stream Deck plugin

Hosts the localhost bridge (`127.0.0.1:38191`), shows each Minecraft hotbar slot on a key, and
sends `select_slot` back to Minecraft on key press.

## Prerequisites
- Node.js **20+**
- Elgato Stream Deck app **6.5+**
- (Dev) Elgato CLI: `npm install -g @elgato/cli`

## Build
```bash
cd streamdeck-plugin
npm install
npm run icons     # generate placeholder PNGs (required for the plugin to load)
npm run build     # bundles to com.fluffybacon.deckcraft-hotbar.sdPlugin/bin/plugin.js
```

## Install / link into Stream Deck (development)
```bash
# from streamdeck-plugin/
streamdeck link com.fluffybacon.deckcraft-hotbar.sdPlugin
streamdeck restart com.fluffybacon.deckcraft-hotbar
```
Live-reload while editing:
```bash
npm run watch
# in another terminal, after first build:
streamdeck restart com.fluffybacon.deckcraft-hotbar
```

## Test WITHOUT Minecraft (recommended first step)
With the plugin running and a key placed on the deck:
```bash
npm run fake-mc
```
This pretends to be Minecraft: it connects to the bridge, pushes a hotbar, and walks the
selected slot across your keys every 1.5s. Press a key and watch the console log the
`select_slot` it received. This proves the entire Stream Deck half end-to-end.

## Package for distribution
```bash
streamdeck pack com.fluffybacon.deckcraft-hotbar.sdPlugin
```

## Logs
`com.fluffybacon.deckcraft-hotbar.sdPlugin/logs/`. Set `LogLevel` in `src/plugin.ts`
(`DEBUG` while developing, `INFO` for release).

## Notes
- Uses the modern `@elgato/streamdeck` SDK with **native TC39 decorators** (`@action`) — do NOT
  enable `experimentalDecorators` in tsconfig.
- The localhost WebSocket server uses the `ws` package, bundled into `bin/plugin.js` by Rollup.
- Property inspector uses `sdpi-components` (loaded from CDN; needs internet on first open).
