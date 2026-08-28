package com.fluffybacon.deckcraft.hotbar.setup;

import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Ships the Stream Deck plugin inside the mod jar so Modrinth is a single download, and drops it
 * somewhere obvious on first launch for the player to install with one double-click.
 *
 * <p>Deliberately does NOT write into the Stream Deck application's own plugin directory. A
 * Minecraft mod silently installing software into another application is surprising behaviour,
 * it would trip security-conscious users and antivirus, and Stream Deck has to be restarted to
 * notice a new plugin anyway — so the "seamless" version would not actually be seamless. Handing
 * the user the installer keeps them in control while still needing only one download.</p>
 */
public final class StreamDeckPluginInstaller {

    /** Path inside the jar; populated at build time from streamdeck-plugin/dist. */
    private static final String BUNDLED = "/deckcraft/com.fluffybacon.deckcraft-hotbar.streamDeckPlugin";
    private static final String FILE_NAME = "com.fluffybacon.deckcraft-hotbar.streamDeckPlugin";
    private static final String DIR_NAME = "deckcraft-hotbar";

    private static volatile Path extractedPath = null;
    private static volatile boolean notified = false;

    private StreamDeckPluginInstaller() {
    }

    /** Where the installer was written, or null if it is not bundled / extraction failed. */
    public static Path getExtractedPath() {
        return extractedPath;
    }

    /**
     * Extracts the bundled plugin installer into the game directory if it is not already there.
     * Safe to call on every launch; never throws.
     */
    public static void extractIfNeeded() {
        Path dir = FabricLoader.getInstance().getGameDir().resolve(DIR_NAME);
        extractedPath = extractTo(dir);
    }

    /**
     * Writes the bundled installer into {@code dir}, returning where it landed or null if the
     * plugin is not bundled or extraction failed. Split out from {@link #extractIfNeeded()} so it
     * can be exercised without a Minecraft runtime. Never throws.
     */
    static Path extractTo(Path dir) {
        try (InputStream in = StreamDeckPluginInstaller.class.getResourceAsStream(BUNDLED)) {
            if (in == null) {
                // Built without the plugin present (e.g. a source build that skipped npm).
                DeckCraftLogger.debug("No Stream Deck plugin bundled in this jar.");
                return null;
            }

            Files.createDirectories(dir);
            Path target = dir.resolve(FILE_NAME);

            if (Files.exists(target)) {
                DeckCraftLogger.debug("Stream Deck plugin installer already extracted: " + target);
                return target;
            }

            try (OutputStream out = Files.newOutputStream(target)) {
                in.transferTo(out);
            }

            DeckCraftLogger.info("Stream Deck plugin installer written to: " + target);
            DeckCraftLogger.info("Double-click that file to install the plugin, then restart the Stream Deck app.");
            return target;
        } catch (Throwable t) {
            // Never let a packaging convenience break startup.
            DeckCraftLogger.warn("Could not extract the bundled Stream Deck plugin installer.", t);
            return null;
        }
    }

    /**
     * Tells the player once per launch where the installer is — but only when the Stream Deck
     * bridge is not already connected, so a working setup is never nagged.
     *
     * <p>Must be called on the Minecraft client thread.</p>
     *
     * @param bridgeConnected whether the mod has reached the Stream Deck plugin
     */
    public static void maybeNotifyInGame(MinecraftClient client, boolean bridgeConnected) {
        if (notified || client == null || client.player == null) {
            return;
        }
        if (bridgeConnected) {
            notified = true; // already working — stay quiet
            return;
        }
        Path path = extractedPath;
        if (path == null) {
            return;
        }
        notified = true;
        client.player.sendMessage(Text.literal(
                "[DeckCraft] Stream Deck plugin not connected. To install it, double-click: " + path), false);
    }
}
