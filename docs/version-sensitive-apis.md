# Fabric 1.21.11 — Version-Sensitive APIs to compile-check

Minecraft Yarn mappings drift between point releases. The mod is written for **1.21.11** but
every spot that might need a one-line change is marked `VERSION-SENSITIVE` in the source. This is
the checklist; fix these first if the mod doesn't compile.

> **Verified (May 2026, meta.fabricmc.net + Fabric's 1.21.11 announcement):**
> 1.21.11 shipped 2025-12-09 and is the **last obfuscated, last Yarn-mapped** Minecraft version.
> Confirmed-available artifacts this project pins:
> - Yarn `1.21.11+build.6` (latest stable build)
> - Fabric Loader `0.19.2` (latest stable)
> - Fabric API `0.139.5+1.21.11` (latest is `0.141.4+1.21.11`)
> - Fabric Loom `1.14-SNAPSHOT` (official recommendation for 1.21.11), Gradle `9.2.0`
> - Plugin id stays `fabric-loom` — the legacy id is correct for obfuscated 1.21.11; only
>   26.1+ (unobfuscated) forces `net.fabricmc.fabric-loom-remap` / `net.fabricmc.fabric-loom`.
>
> **Reference on this machine:** `H:\Game\minecaft mods\golum mode` (Minecraft 1.21.10,
> Fabric API `0.138.3+1.21.10`, Gradle 9.2.0, Loom 1.11-SNAPSHOT) — but it uses **Mojang
> mappings**, so its method names (`getItem`, `getContainerSize`, `net.minecraft.world.item.*`)
> differ from the Yarn names used here. Don't copy names across mapping schemes.

**All rows below were VERIFIED against the official Yarn `1.21.11+build.6` javadoc
(maven.fabricmc.net/docs/yarn-1.21.11+build.6), May 2026.** They should compile as written.

| # | Area | Verified code | Verified signature / note | File |
|---|------|---------------|---------------------------|------|
| 1 | **Selected slot (read)** | `inventory.getSelectedSlot()` | `public int getSelectedSlot()`. ⚠️ the `selectedSlot` field is **private** — there is NO public-field fallback. | `HotbarStateReader.java` |
| 2 | **Selected slot (write)** | `inventory.setSelectedSlot(slot)` | `public void setSelectedSlot(int)`. Same private-field caveat. | `StreamDeckCommandHandler.java` |
| 3 | **Server sync of slot** | none needed — `ClientPlayerEntity` auto-syncs each tick | manual `UpdateSelectedSlotC2SPacket(slot)` is commented in as a backup | `StreamDeckCommandHandler.java` |
| 4 | **Enchantment presence** | `!stack.getEnchantments().isEmpty()` | `getEnchantments()` → `ItemEnchantmentsComponent`, which has `public boolean isEmpty()` | `HotbarStateReader.java` |
| 5 | **Item id** | `Registries.ITEM.getId(item)` | `Registries.ITEM` is `DefaultedRegistry<Item>`; `Registry#getId(T)` is `@Nullable Identifier` | `HotbarStateReader.java` |
| 6 | **ItemStack basics** | `isEmpty / getItem / getCount / getMaxCount / isDamageable / getDamage / getMaxDamage / getName` | all present; `getName()` returns `Text` (→ `.getString()`) | `HotbarStateReader.java` |
| 7 | **Hotbar access** | `inventory.getStack(0..8)` | `public ItemStack getStack(int)` | `HotbarStateReader.java` |
| 8 | **Client lifecycle** | `MinecraftClient.getInstance() / .player / .world / .currentScreen / .execute / .getNetworkHandler` | stable | several |
| 9 | **Fabric events** | `ClientModInitializer`, `ClientTickEvents.END_CLIENT_TICK`, `ClientLifecycleEvents.CLIENT_STOPPING` | stable Fabric API | `DeckCraftHotbarClient.java` |

> **Net result:** there are now **no remaining guesses** in the Java. If a build still fails, it
> will be a Gradle/toolchain resolution issue (Loom/Yarn/Fabric-API artifact availability), not a
> mapped method name. The mapping-name risk this section originally warned about is resolved.

## Definitely-known (low risk)
- `ClientModInitializer` entrypoint and the two Fabric client events above.
- `MinecraftClient.getInstance()`, `.player`, `.world`, `.currentScreen`, `.execute(Runnable)`.
- `Inventory#getStack(int)` for hotbar indices 0..8.
- Gson (`com.google.gson.*`) is available transitively from Minecraft — no dependency needed.
- `java.net.http.WebSocket` (JDK) — not a Minecraft API at all, fully stable on Java 21.

## How to verify quickly
1. Open `minecraft-fabric/` in IntelliJ IDEA (Gradle import).
2. Let Loom download mappings, then look at `PlayerInventory` in the external library:
   does it have `getSelectedSlot()/setSelectedSlot(int)` or a `selectedSlot` field?
3. Build: `./gradlew build`. Compile errors will point exactly at the flagged lines.

## Fallback: build against 1.21.10 (proven on this machine)
If anything in the 1.21.11 toolchain misbehaves, 1.21.10 is known-good here. Edit
`minecraft-fabric/gradle.properties`:
```
minecraft_version=1.21.10
yarn_mappings=1.21.10+build.3
loom_version=1.11-SNAPSHOT
loader_version=0.19.2
fabric_version=0.138.3+1.21.10
```
The Java is identical (same Yarn names across 1.21.10/1.21.11).

## Mojang-mappings alternative (if you abandon Yarn)
Yarn ends at 1.21.11. If you prefer Mojmap (like the golem reference mod):
1. In `build.gradle` replace the `mappings "net.fabricmc:yarn:..."` line with
   `mappings loom.officialMojangMappings()`.
2. Rename the flagged calls to their Mojmap equivalents, e.g. `getStack`→`getItem`,
   `getCount`→`getCount` (same), `getMaxCount`→`getMaxStackSize`, `getName`→`getHoverName`,
   `Registries.ITEM`→`BuiltInRegistries.ITEM`, package `net.minecraft.item.*`→`net.minecraft.world.item.*`.
   This is a bigger change; only do it if you're committed to leaving Yarn.
