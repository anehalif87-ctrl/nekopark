import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  currentPlayers() {
    const players = [];
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (meta && meta.player) players.push(meta.player);
    }
    return players;
  }

  broadcastState() {
    const payload = JSON.stringify({ type: "state", players: this.currentPlayers() });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload);
      } catch (e) {}
    }
  }

  broadcastExcept(sender, payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.state.getWebSockets()) {
      if (ws !== sender) {
        try {
          ws.send(data);
        } catch (e) {}
      }
    }
  }

  webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(typeof message === "string" ? message : message.toString());
    } catch (e) {
      return;
    }

    let meta = ws.deserializeAttachment() || {};

    if (msg.type === "join") {
      const id = Math.random().toString(36).slice(2, 10);
      const player = {
        id,
        name: String(msg.name || "Guest").slice(0, 24),
        x: 200,
        y: 0,
        vx: 0,
        facing: 1,
        color: msg.color || "#ffb84d",
      };
      meta = { id, player };
      ws.serializeAttachment(meta);

      ws.send(JSON.stringify({ type: "joined", id, players: this.currentPlayers() }));
      this.broadcastExcept(ws, { type: "playerJoin", player });
      return;
    }

    if (!meta.player) return;

    if (msg.type === "move") {
      meta.player.x = Math.max(0, Math.min(4000, Number(msg.x) || 0));
      meta.player.vx = Number(msg.vx) || 0;
      meta.player.facing = msg.facing === -1 ? -1 : 1;
      if (typeof msg.y === "number") meta.player.y = msg.y;
      ws.serializeAttachment(meta);
      this.broadcastState();
    } else if (msg.type === "chat") {
      const text = String(msg.text || "").slice(0, 60);
      this.broadcastExcept(ws, { type: "chat", id: meta.id, name: meta.player.name, text });
    } else if (msg.type === "emote") {
      const emote = String(msg.emote || "").slice(0, 8);
      this.broadcastExcept(ws, { type: "emote", id: meta.id, emote });
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    const meta = ws.deserializeAttachment();
    if (meta && meta.id) {
      this.broadcastExcept(ws, { type: "playerLeave", id: meta.id });
    }
    try {
      ws.close(code, reason);
    } catch (e) {}
  }

  webSocketError(ws, error) {
    const meta = ws.deserializeAttachment();
    if (meta && meta.id) {
      this.broadcastExcept(ws, { type: "playerLeave", id: meta.id });
    }
  }
}
