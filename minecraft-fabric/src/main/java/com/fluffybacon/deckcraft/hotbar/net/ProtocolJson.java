package com.fluffybacon.deckcraft.hotbar.net;

import com.fluffybacon.deckcraft.hotbar.hotbar.HotbarSlotState;
import com.fluffybacon.deckcraft.hotbar.hotbar.HotbarState;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Builds and parses the DeckCraft JSON protocol. Uses Gson, which Minecraft already bundles
 * (com.google.gson.*), so there is no extra dependency to shade.
 *
 * All outgoing objects are built field-by-field so we control exact key names and null handling.
 */
public final class ProtocolJson {

    public static final int PROTOCOL_VERSION = 1;

    private ProtocolJson() {
    }

    // ---- parsing -----------------------------------------------------------

    /** Parse a JSON object, or null if the text is not a JSON object. Never throws. */
    public static JsonObject parse(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        try {
            JsonElement el = JsonParser.parseString(text);
            return el.isJsonObject() ? el.getAsJsonObject() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    public static String getString(JsonObject obj, String key, String fallback) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return obj.get(key).getAsString();
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    /** Returns the int value, or null if missing/not an int. */
    public static Integer getInt(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return null;
        }
        try {
            return obj.get(key).getAsInt();
        } catch (RuntimeException e) {
            return null;
        }
    }

    public static int getProtocolVersion(JsonObject obj) {
        Integer v = getInt(obj, "protocolVersion");
        return v == null ? -1 : v;
    }

    // ---- building (Minecraft -> Stream Deck) -------------------------------

    public static String buildHello(String modVersion, String mcVersion, String playerName) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "hello_from_minecraft");
        o.addProperty("protocolVersion", PROTOCOL_VERSION);
        o.addProperty("modVersion", modVersion);
        o.addProperty("minecraftVersion", mcVersion);
        o.addProperty("playerName", playerName);
        JsonObject supports = new JsonObject();
        supports.addProperty("hotbarState", true);
        supports.addProperty("selectSlot", true);
        supports.addProperty("icons", false);
        o.add("supports", supports);
        return o.toString();
    }

    public static String buildHotbarState(HotbarState state, long sequence, String modVersion,
                                          String mcVersion, long timestampMillis) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "hotbar_state");
        o.addProperty("protocolVersion", PROTOCOL_VERSION);
        o.addProperty("sequence", sequence);
        o.addProperty("timestampMillis", timestampMillis);
        o.addProperty("minecraftVersion", mcVersion);
        o.addProperty("modVersion", modVersion);
        o.addProperty("inWorld", state.inWorld);
        o.addProperty("screenOpen", state.screenOpen);
        if (state.screenType == null) {
            o.add("screenType", com.google.gson.JsonNull.INSTANCE);
        } else {
            o.addProperty("screenType", state.screenType);
        }
        o.addProperty("playerName", state.playerName);
        o.addProperty("selectedSlot", state.selectedSlot);

        JsonArray slots = new JsonArray();
        if (state.slots != null) {
            for (HotbarSlotState s : state.slots) {
                slots.add(slotToJson(s));
            }
        }
        o.add("slots", slots);

        // Optional: slots 9..40 (storage + armor + offhand). Omitted entirely unless the
        // Stream Deck asked for the full inventory, so default traffic stays small.
        if (state.extendedSlots != null) {
            JsonArray extended = new JsonArray();
            for (HotbarSlotState s : state.extendedSlots) {
                extended.add(slotToJson(s));
            }
            o.add("extendedSlots", extended);
        }
        return o.toString();
    }

    private static JsonObject slotToJson(HotbarSlotState s) {
        JsonObject o = new JsonObject();
        o.addProperty("slot", s.slot);
        o.addProperty("empty", s.empty);
        if (s.itemId == null) {
            o.add("itemId", com.google.gson.JsonNull.INSTANCE);
        } else {
            o.addProperty("itemId", s.itemId);
        }
        o.addProperty("displayName", s.displayName == null ? "" : s.displayName);
        o.addProperty("count", s.count);
        o.addProperty("maxCount", s.maxCount);
        o.addProperty("damageable", s.damageable);
        o.addProperty("damage", s.damage);
        o.addProperty("maxDamage", s.maxDamage);
        o.addProperty("durabilityRemaining", s.durabilityRemaining);
        if (s.durabilityPercent == null) {
            o.add("durabilityPercent", com.google.gson.JsonNull.INSTANCE);
        } else {
            o.addProperty("durabilityPercent", s.durabilityPercent);
        }
        o.addProperty("hasEnchantments", s.hasEnchantments);
        return o;
    }

    public static String buildLifecycle(String stateName, boolean inWorld, String message) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "lifecycle_state");
        o.addProperty("protocolVersion", PROTOCOL_VERSION);
        o.addProperty("state", stateName);
        o.addProperty("inWorld", inWorld);
        o.addProperty("message", message);
        return o.toString();
    }

    public static String buildCommandResult(String command, boolean success, Integer slot, String message) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "command_result");
        o.addProperty("protocolVersion", PROTOCOL_VERSION);
        o.addProperty("command", command);
        o.addProperty("success", success);
        if (slot == null) {
            o.add("slot", com.google.gson.JsonNull.INSTANCE);
        } else {
            o.addProperty("slot", slot);
        }
        o.addProperty("message", message);
        return o.toString();
    }
}
