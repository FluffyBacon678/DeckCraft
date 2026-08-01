package com.fluffybacon.deckcraft.hotbar.config;

import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Minimal config. Reads {@code config/deckcraft_hotbar.properties} if present, otherwise
 * writes a default file. Intentionally tiny — no external config library for the MVP.
 */
public final class DeckCraftConfig {

    public String host = "127.0.0.1";
    public int port = 38191;
    public boolean debug = false;
    /** Force-send all 41 inventory slots without waiting for the Stream Deck's set_options. */
    public boolean forceFullInventory = false;

    private DeckCraftConfig() {
    }

    public static DeckCraftConfig load() {
        DeckCraftConfig config = new DeckCraftConfig();
        try {
            Path path = FabricLoader.getInstance().getConfigDir().resolve("deckcraft_hotbar.properties");
            Properties props = new Properties();
            if (Files.exists(path)) {
                try (InputStream in = Files.newInputStream(path)) {
                    props.load(in);
                }
                config.host = props.getProperty("host", config.host).trim();
                config.port = parseInt(props.getProperty("port"), config.port);
                config.debug = Boolean.parseBoolean(props.getProperty("debug", String.valueOf(config.debug)));
                config.forceFullInventory = Boolean.parseBoolean(
                        props.getProperty("forceFullInventory", String.valueOf(config.forceFullInventory)));
            } else {
                // Write a default file so users can discover the settings.
                props.setProperty("host", config.host);
                props.setProperty("port", String.valueOf(config.port));
                props.setProperty("debug", String.valueOf(config.debug));
                props.setProperty("forceFullInventory", String.valueOf(config.forceFullInventory));
                Files.createDirectories(path.getParent());
                try (OutputStream out = Files.newOutputStream(path)) {
                    props.store(out, "DeckCraft Hotbar config. host must stay on localhost. Default port 38191.");
                }
            }
            // Hard safety rail: never allow binding/connecting anywhere but loopback for the MVP.
            if (!isLoopback(config.host)) {
                DeckCraftLogger.warn("Configured host '" + config.host + "' is not loopback; forcing 127.0.0.1 for safety.");
                config.host = "127.0.0.1";
            }
            if (config.port < 1 || config.port > 65535) {
                DeckCraftLogger.warn("Invalid port " + config.port + "; falling back to 38191.");
                config.port = 38191;
            }
        } catch (IOException e) {
            DeckCraftLogger.warn("Could not read config; using defaults.", e);
        }
        return config;
    }

    private static boolean isLoopback(String host) {
        return "127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host) || "::1".equals(host);
    }

    private static int parseInt(String value, int fallback) {
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
