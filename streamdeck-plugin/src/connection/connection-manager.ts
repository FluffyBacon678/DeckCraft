import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { logger } from "../util/logger";
import {
  PROTOCOL_VERSION,
  type OutgoingMessage,
} from "../types/protocol";

export type ConnectionStatus = "listening" | "minecraft_connected" | "error";

/**
 * Hosts a localhost-only WebSocket server. Minecraft connects as a client.
 * Owns exactly one Minecraft connection; a second one replaces the first.
 *
 * Emits: "status"(ConnectionStatus), "minecraft_connected", "minecraft_disconnected",
 *        "hello"(msg), "hotbar_state"(msg), "lifecycle_state"(msg), "command_result"(msg).
 */
export class ConnectionManager extends EventEmitter {
  private wss?: WebSocketServer;
  private mc?: WebSocket;
  private status: ConnectionStatus = "listening";
  private restartTimer?: NodeJS.Timeout;
  private needsFullInventory = false;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly pluginVersion: string,
  ) {
    super();
  }

  start(): void {
    this.startServer();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return !!this.mc && this.mc.readyState === WebSocket.OPEN;
  }

  private startServer(): void {
    try {
      // host:127.0.0.1 ensures we never bind to a routable interface.
      this.wss = new WebSocketServer({ host: this.host, port: this.port });
      this.wss.on("listening", () => {
        this.setStatus("listening");
        logger.info(`Local bridge listening on ws://${this.host}:${this.port} — waiting for Minecraft.`);
      });
      this.wss.on("connection", (ws, req) => this.onConnection(ws, req?.socket?.remoteAddress));
      this.wss.on("error", (err) => this.onServerError(err));
    } catch (err) {
      this.onServerError(err);
    }
  }

  private onServerError(err: unknown): void {
    this.setStatus("error");
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "EADDRINUSE") {
      logger.error(
        `Port ${this.port} is already in use. Close whatever is using it (or a second copy of this plugin). Retrying in 5s.`,
      );
    } else {
      logger.error(`Bridge server error: ${(err as Error)?.message ?? String(err)}`);
    }
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.restartTimer) {
      return;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      try {
        this.wss?.close();
      } catch {
        /* ignore */
      }
      this.startServer();
    }, 5000);
  }

  private onConnection(ws: WebSocket, remoteAddress?: string): void {
    // Defense in depth: only accept loopback even though we bind to 127.0.0.1.
    if (remoteAddress && !this.isLoopback(remoteAddress)) {
      logger.warn(`Rejecting non-local connection from ${remoteAddress}.`);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }

    if (this.mc && this.mc.readyState === WebSocket.OPEN) {
      logger.warn("A second Minecraft connection arrived — replacing the previous one.");
      try {
        this.mc.close();
      } catch {
        /* ignore */
      }
    }

    this.mc = ws;
    this.setStatus("minecraft_connected");
    logger.info("Minecraft connected to bridge.");
    this.emit("minecraft_connected");

    // Handshake + ask for the current snapshot.
    this.send({
      type: "hello_from_streamdeck",
      protocolVersion: PROTOCOL_VERSION,
      pluginVersion: this.pluginVersion,
      supports: { selectSlot: true },
    });
    // Re-assert what data we need — a reconnected mod starts at its default (hotbar only).
    this.sendOptions();
    this.requestFullState();

    ws.on("message", (data) => this.onMessage(data));
    ws.on("close", () => {
      if (this.mc === ws) {
        this.mc = undefined;
        this.setStatus("listening");
        logger.info("Minecraft disconnected.");
        this.emit("minecraft_disconnected");
      }
    });
    ws.on("error", (e) => logger.debug(`Minecraft socket error: ${e?.message}`));
  }

  private onMessage(data: RawData): void {
    let text: string;
    try {
      text = typeof data === "string" ? data : data.toString("utf8");
    } catch {
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      logger.debug("Ignoring non-JSON message from Minecraft.");
      return;
    }
    if (!msg || typeof msg !== "object") {
      return;
    }
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      logger.warn(`Ignoring message with protocolVersion ${String(msg.protocolVersion)}.`);
      return;
    }

    switch (msg.type) {
      case "hello_from_minecraft":
        logger.info(`Minecraft hello: mod ${String(msg.modVersion)}, MC ${String(msg.minecraftVersion)}.`);
        this.emit("hello", msg);
        break;
      case "hotbar_state":
        this.emit("hotbar_state", msg);
        break;
      case "lifecycle_state":
        this.emit("lifecycle_state", msg);
        break;
      case "command_result":
        logger.debug(`command_result: ${String(msg.command)} success=${String(msg.success)} ${String(msg.message ?? "")}`);
        this.emit("command_result", msg);
        break;
      default:
        logger.debug(`Unknown message type from Minecraft: ${String(msg.type)}`);
    }
  }

  /** Send a typed protocol message. No-op if Minecraft isn't connected. */
  send(obj: OutgoingMessage): void {
    if (!this.isConnected()) {
      return;
    }
    try {
      this.mc!.send(JSON.stringify(obj));
    } catch (e) {
      logger.debug(`send failed: ${(e as Error)?.message}`);
    }
  }

  /** Returns true if the command was sent (slot valid + connected). */
  selectSlot(slotIndex: number): boolean {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 8) {
      return false;
    }
    if (!this.isConnected()) {
      return false;
    }
    this.send({
      type: "select_slot",
      protocolVersion: PROTOCOL_VERSION,
      slot: slotIndex,
      source: "streamdeck_key",
    });
    return true;
  }

  /** Sends a vanilla-equivalent player action. Returns true if it was sent. */
  playerAction(action: 'swap_offhand' | 'open_inventory'): boolean {
    if (!this.isConnected()) {
      return false;
    }
    this.send({ type: 'player_action', protocolVersion: PROTOCOL_VERSION, action, source: 'streamdeck_key' });
    return true;
  }

  requestFullState(): void {
    this.send({ type: "request_full_state", protocolVersion: PROTOCOL_VERSION });
  }

  /**
   * Declare whether any key currently needs slots 9-40. Sends immediately if that changed,
   * so Minecraft only does the extra work while a storage/armor key is actually on the deck.
   */
  setNeedsFullInventory(needed: boolean): void {
    if (this.needsFullInventory === needed) {
      return;
    }
    this.needsFullInventory = needed;
    logger.info(`Full inventory ${needed ? "requested" : "no longer needed"}.`);
    this.sendOptions();
  }

  private sendOptions(): void {
    this.send({
      type: "set_options",
      protocolVersion: PROTOCOL_VERSION,
      sendFullInventory: this.needsFullInventory,
    });
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit("status", status);
  }

  private isLoopback(addr: string): boolean {
    return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  }
}
