# DeckCraft Hotbar — Fabric client mod (Minecraft 1.21.11)

Reads the local hotbar and sends it to the Stream Deck bridge; applies `select_slot` commands.
Client-only; never required on the server. Uses the JDK's `java.net.http.WebSocket` (no extra deps).

## Prerequisites
- JDK **21**
- The version numbers in `gradle.properties` verified for **1.21.11** at
  <https://fabricmc.net/develop>. See [../docs/version-sensitive-apis.md](../docs/version-sensitive-apis.md).
  A known-good fallback on this machine is **1.21.10** + Fabric API `0.138.3+1.21.10`.

## First-time setup
If `gradlew` is missing, generate the wrapper once (needs a system Gradle, or use IntelliJ's):
```bash
gradle wrapper
```

## Build
```bash
cd minecraft-fabric
./gradlew build          # Windows: gradlew.bat build
```
Output jar: `build/libs/deckcraft-hotbar-0.1.0.jar`.
Copy it (plus Fabric API) into your `.minecraft/mods` folder.

## Run the dev client (with the mod loaded)
```bash
./gradlew runClient
```

## Import into IntelliJ IDEA / Cursor
1. Open the `minecraft-fabric` folder (it's the Gradle root).
2. Let Gradle import + Loom download mappings.
3. Run config **Minecraft Client** appears (or use `runClient`).

## Config
First launch writes `config/deckcraft_hotbar.properties` in your Minecraft folder:
```properties
host=127.0.0.1
port=38191
debug=false
```
Set `debug=true` for verbose logs (per-tick send decisions, command details).

## Test the networking layer without Minecraft

```bash
bash nettest/run-net-test.sh
```

Starts a fake Stream Deck bridge and drives the mod's **real** `DeckCraftConnectionClient` +
`ProtocolJson` against it — no Minecraft, no Stream Deck hardware. Those two classes deliberately
never touch Minecraft types, so they run standalone.

Covers the parts that are easiest to get wrong: connect/backoff against a dead port, the
single-flight send queue under a 50-message burst, message dispatch on the network thread,
surviving malformed JSON / bad `protocolVersion` / unknown message types, and clean shutdown.

Requires `./gradlew build` first (it uses the compiled classes). The script finds a JDK 21 and the
Gson/SLF4J jars in the Gradle cache automatically.

## Compile-check note
If the build fails, the first suspects are the selected-slot getter/setter and the enchantment
check — both flagged `VERSION-SENSITIVE` in the source with the exact fallback to use.
