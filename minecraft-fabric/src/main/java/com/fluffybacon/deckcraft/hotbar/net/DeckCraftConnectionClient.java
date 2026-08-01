package com.fluffybacon.deckcraft.hotbar.net;

import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import com.google.gson.JsonObject;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * WebSocket client to the Stream Deck bridge, built on the JDK's java.net.http.WebSocket
 * (Java 11+; Minecraft 1.21 runs on Java 21). No third-party dependency, nothing to shade.
 *
 * Threading model:
 *  - A single daemon "DeckCraft-Net" thread runs the HttpClient executor, so all WebSocket
 *    callbacks (onOpen/onText/onClose/onError) and reconnect scheduling happen there.
 *  - Incoming messages are parsed here (safe: no Minecraft access) and handed to the message
 *    handler, which is responsible for hopping to the Minecraft client thread for any game state.
 *  - Outgoing messages are queued and sent one-at-a-time (java.net.http requires the previous
 *    send to complete before the next), so send() is safe to call from the Minecraft tick thread.
 */
public final class DeckCraftConnectionClient {

    private static final int MAX_BACKOFF_SECONDS = 30;

    private final String host;
    private final int port;
    private final HttpClient httpClient;
    private final ScheduledExecutorService scheduler;

    private volatile WebSocket webSocket;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private final AtomicBoolean started = new AtomicBoolean(false);
    private volatile boolean shuttingDown = false;

    private int backoffSeconds = 1;
    private long retryCount = 0;

    private final ConcurrentLinkedQueue<String> outgoing = new ConcurrentLinkedQueue<>();
    private final AtomicBoolean sending = new AtomicBoolean(false);

    private volatile Consumer<JsonObject> messageHandler;
    private volatile Runnable onConnected;

    public DeckCraftConnectionClient(String host, int port) {
        this.host = host;
        this.port = port;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "DeckCraft-Net");
            t.setDaemon(true);
            return t;
        });
        this.httpClient = HttpClient.newBuilder()
                .executor(scheduler)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public boolean isConnected() {
        return connected.get();
    }

    public void setMessageHandler(Consumer<JsonObject> handler) {
        this.messageHandler = handler;
    }

    /** Run on the net thread immediately after the socket opens (e.g. send hello). */
    public void setOnConnected(Runnable runnable) {
        this.onConnected = runnable;
    }

    public void start() {
        if (started.getAndSet(true)) {
            return;
        }
        scheduleConnect(0);
    }

    private void scheduleConnect(int delaySeconds) {
        if (shuttingDown) {
            return;
        }
        scheduler.schedule(this::connect, delaySeconds, TimeUnit.SECONDS);
    }

    private void connect() {
        if (shuttingDown) {
            return;
        }
        URI uri = URI.create("ws://" + host + ":" + port);
        DeckCraftLogger.debug("Connecting to Stream Deck bridge at " + uri);
        try {
            httpClient.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .buildAsync(uri, new Listener())
                    .whenComplete((ws, err) -> {
                        if (err != null) {
                            onConnectFailed();
                        }
                        // success is handled in Listener.onOpen
                    });
        } catch (RuntimeException e) {
            onConnectFailed();
        }
    }

    private void onConnectFailed() {
        connected.set(false);
        webSocket = null;
        int delay = backoffSeconds;
        if (retryCount == 0) {
            DeckCraftLogger.info("Stream Deck bridge not reachable on " + host + ":" + port
                    + " (is the Stream Deck plugin running?). Retrying quietly in the background.");
        } else if (retryCount % 10 == 0) {
            DeckCraftLogger.debug("Still trying to reach Stream Deck bridge (attempt " + retryCount + ").");
        }
        retryCount++;
        backoffSeconds = Math.min(MAX_BACKOFF_SECONDS, backoffSeconds * 2);
        scheduleConnect(delay);
    }

    private void handleDisconnect(String why) {
        boolean wasConnected = connected.getAndSet(false);
        webSocket = null;
        sending.set(false);
        outgoing.clear();
        if (shuttingDown) {
            return;
        }
        if (wasConnected) {
            DeckCraftLogger.info("Disconnected from Stream Deck bridge (" + why + "). Reconnecting...");
        }
        scheduleConnect(backoffSeconds);
        backoffSeconds = Math.min(MAX_BACKOFF_SECONDS, backoffSeconds * 2);
    }

    private void handleIncoming(String text) {
        Consumer<JsonObject> handler = messageHandler;
        if (handler == null) {
            return;
        }
        try {
            JsonObject obj = ProtocolJson.parse(text);
            if (obj == null) {
                DeckCraftLogger.debug("Ignoring non-JSON message from bridge.");
                return;
            }
            int version = ProtocolJson.getProtocolVersion(obj);
            if (version != ProtocolJson.PROTOCOL_VERSION) {
                DeckCraftLogger.debug("Ignoring message with protocolVersion " + version);
                return;
            }
            handler.accept(obj);
        } catch (RuntimeException e) {
            DeckCraftLogger.warn("Failed to handle incoming message.", e);
        }
    }

    // ---- sending -----------------------------------------------------------

    /** Queue a JSON string for sending. Safe to call from any thread. No-op when disconnected. */
    public void send(String json) {
        if (json == null || !connected.get()) {
            return;
        }
        outgoing.offer(json);
        drain();
    }

    private void drain() {
        if (!connected.get()) {
            return;
        }
        if (!sending.compareAndSet(false, true)) {
            return; // another caller is already draining
        }
        trySendNext();
    }

    private void trySendNext() {
        WebSocket ws = webSocket;
        if (ws == null || !connected.get()) {
            sending.set(false);
            return;
        }
        String next = outgoing.poll();
        if (next == null) {
            sending.set(false);
            // Re-check to avoid a lost wake-up if something was queued just now.
            if (!outgoing.isEmpty() && sending.compareAndSet(false, true)) {
                trySendNext();
            }
            return;
        }
        try {
            ws.sendText(next, true).whenComplete((result, err) -> {
                if (err != null) {
                    sending.set(false);
                    DeckCraftLogger.debug("send failed: " + err.getMessage());
                    return;
                }
                trySendNext(); // keep draining while we still hold the sending flag
            });
        } catch (RuntimeException e) {
            sending.set(false);
            DeckCraftLogger.debug("send threw: " + e.getMessage());
        }
    }

    public void stop() {
        shuttingDown = true;
        started.set(false);
        connected.set(false);
        WebSocket ws = webSocket;
        if (ws != null) {
            try {
                ws.sendClose(WebSocket.NORMAL_CLOSURE, "client shutdown");
            } catch (RuntimeException ignored) {
                // best effort
            }
        }
        scheduler.shutdownNow();
    }

    /** WebSocket.Listener — all callbacks run on the single DeckCraft-Net thread. */
    private final class Listener implements WebSocket.Listener {

        private final StringBuilder buffer = new StringBuilder();

        @Override
        public void onOpen(WebSocket ws) {
            webSocket = ws;
            connected.set(true);
            backoffSeconds = 1;
            retryCount = 0;
            DeckCraftLogger.info("Connected to Stream Deck bridge at " + host + ":" + port + ".");
            Runnable cb = onConnected;
            if (cb != null) {
                try {
                    cb.run();
                } catch (RuntimeException e) {
                    DeckCraftLogger.warn("onConnected handler failed.", e);
                }
            }
            ws.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String message = buffer.toString();
                buffer.setLength(0);
                handleIncoming(message);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket ws, int statusCode, String reason) {
            handleDisconnect("closed " + statusCode + (reason != null && !reason.isEmpty() ? ": " + reason : ""));
            return null;
        }

        @Override
        public void onError(WebSocket ws, Throwable error) {
            handleDisconnect("error: " + (error != null ? error.getMessage() : "unknown"));
        }
    }
}
