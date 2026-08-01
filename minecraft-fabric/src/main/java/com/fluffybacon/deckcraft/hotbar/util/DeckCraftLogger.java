package com.fluffybacon.deckcraft.hotbar.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Tiny logging wrapper. Fabric ships SLF4J, so no extra dependency is needed.
 * Debug messages are gated behind {@link #setDebug(boolean)} so normal play stays quiet.
 */
public final class DeckCraftLogger {

    public static final Logger LOG = LoggerFactory.getLogger("DeckCraft Hotbar");

    private static volatile boolean debug = false;

    private DeckCraftLogger() {
    }

    public static void setDebug(boolean value) {
        debug = value;
    }

    public static boolean isDebug() {
        return debug;
    }

    public static void info(String message) {
        LOG.info(message);
    }

    public static void warn(String message) {
        LOG.warn(message);
    }

    public static void warn(String message, Throwable t) {
        LOG.warn(message, t);
    }

    public static void error(String message, Throwable t) {
        LOG.error(message, t);
    }

    /** Only emitted when debug mode is on (config: debug=true). */
    public static void debug(String message) {
        if (debug) {
            LOG.info("[debug] {}", message);
        }
    }
}
