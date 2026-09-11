const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// rooms: Map<roomId, Map<clientId, playerState>>
const rooms = new Map();
const socketMeta = new Map(); // ws -> {id, room}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function broadcastState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.values());
  const payload = JSON.stringify({ type: 'state', players });
  for (const [ws, meta] of socketMeta.entries()) {
    if (meta.room === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastToRoom(roomId, payload, exceptWs) {
  const data = JSON.stringify(payload);
  for (const [ws, meta] of socketMeta.entries()) {
    if (meta.room === roomId && ws !== exceptWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Neko Park multiplayer server is running.\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 10);
  socketMeta.set(ws, { id, room: null });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    const meta = socketMeta.get(ws);
    if (!meta) return;

    if (msg.type === 'join') {
      const roomId = String(msg.room || 'default').slice(0, 64);
      const name = String(msg.name || 'Guest').slice(0, 24);
      meta.room = roomId;

      const room = getRoom(roomId);
      room.set(id, {
        id,
        name,
        x: 200,
        y: 0,
        vx: 0,
        facing: 1,
        emote: null,
        color: msg.color || '#ffb84d',
      });

      ws.send(JSON.stringify({ type: 'joined', id, players: Array.from(room.values()) }));
      broadcastToRoom(roomId, { type: 'playerJoin', player: room.get(id) }, ws);
      return;
    }

    if (!meta.room) return;
    const room = rooms.get(meta.room);
    if (!room || !room.has(id)) return;
    const player = room.get(id);

    if (msg.type === 'move') {
      player.x = Math.max(0, Math.min(4000, Number(msg.x) || 0));
      player.vx = Number(msg.vx) || 0;
      player.facing = msg.facing === -1 ? -1 : 1;
      if (typeof msg.y === 'number') player.y = msg.y;
    } else if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 60);
      broadcastToRoom(meta.room, { type: 'chat', id, name: player.name, text }, ws);
    } else if (msg.type === 'emote') {
      player.emote = String(msg.emote || '').slice(0, 8);
      setTimeout(() => {
        if (room.has(id)) room.get(id).emote = null;
      }, 2500);
    }
  });

  ws.on('close', () => {
    const meta = socketMeta.get(ws);
    if (meta && meta.room) {
      const room = rooms.get(meta.room);
      if (room) {
        room.delete(meta.id);
        broadcastToRoom(meta.room, { type: 'playerLeave', id: meta.id }, ws);
        if (room.size === 0) rooms.delete(meta.room);
      }
    }
    socketMeta.delete(ws);
  });

  ws.on('error', () => {});
});

// Broadcast full state tiap room secara berkala (biar posisi selalu sinkron walau ada paket yang lost)
setInterval(() => {
  for (const roomId of rooms.keys()) {
    broadcastState(roomId);
  }
}, 100);

server.listen(PORT, () => {
  console.log(`Neko Park server jalan di port ${PORT}`);
});
