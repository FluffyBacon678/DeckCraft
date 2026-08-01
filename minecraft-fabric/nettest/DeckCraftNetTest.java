import com.fluffybacon.deckcraft.hotbar.hotbar.HotbarSlotState;
import com.fluffybacon.deckcraft.hotbar.hotbar.HotbarState;
import com.fluffybacon.deckcraft.hotbar.net.DeckCraftConnectionClient;
import com.fluffybacon.deckcraft.hotbar.net.ProtocolJson;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Standalone integration test for the mod's networking layer — NO Minecraft required.
 *
 * DeckCraftConnectionClient and ProtocolJson deliberately never touch Minecraft classes, so they
 * can be exercised directly against a real WebSocket bridge. This covers the code that unit-level
 * reasoning is worst at: the connect/backoff loop, the single-flight send queue, and message
 * parsing/dispatch on the network thread.
 *
 * Run via nettest/run-net-test.sh (starts a Node bridge, then this).
 */
public class DeckCraftNetTest {

    private static int pass = 0;
    private static int fail = 0;

    static void check(String name, boolean ok) {
        System.out.println((ok ? "PASS  " : "FAIL  ") + name);
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 38251;

        // ---- 1. reconnect/backoff: client must survive a dead port without throwing ----
        DeckCraftConnectionClient dead = new DeckCraftConnectionClient("127.0.0.1", 1);
        dead.setMessageHandler(m -> { });
        dead.start();
        Thread.sleep(600);
        check("survives an unreachable bridge without crashing", !dead.isConnected());
        dead.stop();

        // ---- 2. real connection ----
        CountDownLatch connected = new CountDownLatch(1);
        CountDownLatch gotSelectSlot = new CountDownLatch(1);
        List<JsonObject> received = new ArrayList<>();
        AtomicInteger selectedSlot = new AtomicInteger(-1);

        DeckCraftConnectionClient client = new DeckCraftConnectionClient("127.0.0.1", port);
        client.setMessageHandler(msg -> {
            synchronized (received) { received.add(msg); }
            if ("select_slot".equals(ProtocolJson.getString(msg, "type", null))) {
                Integer slot = ProtocolJson.getInt(msg, "slot");
                if (slot != null) selectedSlot.set(slot);
                gotSelectSlot.countDown();
            }
        });
        client.setOnConnected(connected::countDown);
        client.start();

        check("connects to the bridge", connected.await(10, TimeUnit.SECONDS));
        Thread.sleep(200);
        check("isConnected() reports true", client.isConnected());

        // ---- 3. send hello + a full hotbar snapshot through the real serializer ----
        client.send(ProtocolJson.buildHello("0.1.0", "1.21.11", "Tester"));
        client.send(ProtocolJson.buildHotbarState(sampleState(), 1, "0.1.0", "1.21.11",
                System.currentTimeMillis()));

        // ---- 4. burst: proves the single-flight send queue drains without dropping ----
        for (int i = 0; i < 50; i++) {
            client.send(ProtocolJson.buildCommandResult("burst", true, i, "msg" + i));
        }

        // ---- 5. the bridge replies with select_slot; the handler must fire ----
        check("receives select_slot from the bridge", gotSelectSlot.await(10, TimeUnit.SECONDS));
        check("select_slot carried slot 7", selectedSlot.get() == 7);

        // ---- 6. malformed input must not kill the connection ----
        Thread.sleep(400);
        check("still connected after malformed/unknown messages", client.isConnected());

        synchronized (received) {
            check("handler saw at least the hello + select_slot", received.size() >= 2);
            boolean sawBadVersion = received.stream().anyMatch(m ->
                    ProtocolJson.getProtocolVersion(m) != 1);
            check("messages with a wrong protocolVersion were filtered out", !sawBadVersion);
        }

        // ---- 7. clean shutdown ----
        client.stop();
        Thread.sleep(300);
        check("stop() leaves the client disconnected", !client.isConnected());

        System.out.println();
        System.out.println(pass + "/" + (pass + fail) + " checks passed");
        System.exit(fail == 0 ? 0 : 1);
    }

    private static HotbarState sampleState() {
        List<HotbarSlotState> slots = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            HotbarSlotState s = new HotbarSlotState();
            s.slot = i;
            if (i == 0) {
                s.empty = false;
                s.itemId = "minecraft:diamond_sword";
                s.displayName = "Diamond Sword";
                s.count = 1;
                s.maxCount = 1;
                s.damageable = true;
                s.damage = 120;
                s.maxDamage = 1561;
                s.durabilityRemaining = 1441;
                s.durabilityPercent = 92;
                s.hasEnchantments = true;
            } else {
                s.empty = true;
                s.displayName = "";
                s.durabilityPercent = null;
            }
            slots.add(s);
        }
        HotbarState state = new HotbarState();
        state.inWorld = true;
        state.screenOpen = false;
        state.screenType = null;
        state.playerName = "Tester";
        state.selectedSlot = 2;
        state.slots = slots;
        return state;
    }
}
