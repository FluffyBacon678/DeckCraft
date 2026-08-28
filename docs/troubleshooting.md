# Troubleshooting

## Stream Deck keys show "No MC"
The plugin is running and listening, but Minecraft isn't connected.
- Launch Minecraft 1.21.11 with the mod + Fabric API installed.
- Check the Minecraft log for `Connected to Stream Deck bridge`. If you see
  `Stream Deck bridge not reachable`, the plugin/bridge isn't listening (see port issues below).

## Minecraft log says "connection refused" / "not reachable"
The bridge (Stream Deck plugin) isn't up yet. This is harmless — the mod retries with backoff.
- Open the Stream Deck app; make sure the DeckCraft Hotbar plugin is installed and enabled.
- Confirm the plugin logged `Local bridge listening on ws://127.0.0.1:38191`.

## "Port already in use" (EADDRINUSE) in the plugin log
Something else holds `38191` (often a second copy of the plugin, or a leftover process).
- Quit the Stream Deck app fully and reopen, or reboot.
- Find the holder: `netstat -ano | findstr 38191` (Windows), then close that PID.
- To change the port, edit it in **both** places: `streamdeck-plugin/src/types/protocol.ts`
  (`DEFAULT_PORT`) and `config/deckcraft_hotbar.properties` in your Minecraft folder, then
  rebuild the plugin.

## Keys not updating
- Confirm you're **in a world** (not the main menu) — otherwise keys show "No World".
- Check the plugin log for `hotbar_state` activity (enable DEBUG in `src/plugin.ts`).
- Make sure each key's **Hotbar slot** is set in its property inspector.
- Reload the plugin: `streamdeck restart com.fluffybacon.deckcraft-hotbar`.

## Slot selection not working when I press a key
- It is intentionally ignored while a **screen is open** (chat, inventory, pause). Close it.
- It is ignored at the **main menu** (not in a world).
- Look for `Received select_slot` in the Minecraft log and `command_result` in the plugin log.
  A `screen_open` / `not_in_world` message means the safety rule fired.

## Keys show item names instead of icons
- Run `npm run icons:extract` once — without it every key falls back to the item's name.
- Then rebuild/reinstall the plugin and **restart the Stream Deck app**; it caches the old files.
- A key showing a name for a *modded* item means that mod wasn't scanned: check the jar is in
  `.minecraft/mods`, then re-run the extractor. Some items legitimately have no flat texture
  (about 47 in vanilla) and always show their name.

## Icons don't match what I see in game
- Re-run `npm run icons:extract` after changing resource packs — enabled packs are read from
  `options.txt` at extraction time, not live.
- Only *enabled* packs are applied. Packs supplied by mods (entries without a `file/` prefix,
  e.g. `continuity:default`) are skipped.

## I added a mod and its items show names
Re-run `npm run icons:extract`, reinstall the plugin, restart Stream Deck. Extraction is a
snapshot of your mods folder, not a live lookup.

## Nothing connects, and Minecraft's own networking is broken too

If the mod never connects **and** things like joining servers or building with Gradle also fail,
the problem is below this mod: Java cannot create an NIO `Selector`. Symptom in logs:

```
java.io.IOException: Unable to establish loopback connection
    at sun.nio.ch.PipeImpl$Initializer$LoopbackConnector.run
```

Java builds its internal pipes from a loopback socket pair and verifies the peer address. Some
security software, VPNs and local proxies intercept loopback connections, which breaks that check.
Everything built on Java NIO then fails — this mod's WebSocket, Netty (so Minecraft's own
networking), and Gradle.

Confirm it in one command (any JDK 21):

```bash
cat > NioProbe.java <<'EOF'
import java.nio.channels.Selector;
public class NioProbe { public static void main(String[] a) throws Exception {
    Selector.open().close(); System.out.println("Selector.open() OK"); } }
EOF
javac NioProbe.java && java -cp . NioProbe
```

- Prints `Selector.open() OK` → Java is fine, look elsewhere.
- Throws `Unable to establish loopback connection` → it is the machine, not this mod.

Fixes, in order: reboot; then temporarily disable antivirus / VPN / proxy software and re-run the
probe to identify the culprit; then add an exclusion for your Java executable. Note that a plain
loopback socket can still work while `Selector.open()` fails, so "localhost works" does not rule
this out.

## Fabric version mismatch / mod won't load
- The mod requires Minecraft **1.21.11**, **Fabric Loader**, **Fabric API**, **Java 21**.
- If it won't compile, see [version-sensitive-apis.md](version-sensitive-apis.md) — the
  selected-slot getter/setter is the most likely culprit. Building against 1.21.10 is a known-good
  fallback on this machine.

## Plugin reload issues / plugin won't appear
- Ensure `npm run icons` was run — Stream Deck refuses to load a plugin with missing manifest icons.
- Ensure `npm run build` produced `com.fluffybacon.deckcraft-hotbar.sdPlugin/bin/plugin.js`.
- Logs live in `com.fluffybacon.deckcraft-hotbar.sdPlugin/logs/`.
- Validate: `streamdeck validate com.fluffybacon.deckcraft-hotbar.sdPlugin`.

## Nothing in the plugin logs at all
- Confirm Node is bundled/available for the plugin (manifest `Nodejs.Version` = `20`).
- Re-link during development: `streamdeck link com.fluffybacon.deckcraft-hotbar.sdPlugin`
  then `streamdeck restart com.fluffybacon.deckcraft-hotbar`.
