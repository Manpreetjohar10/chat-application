// To run this code first open terminal in vs code run "node server.js"
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow non-browser clients and local tools with no origin header.
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.static(path.join(__dirname)));

const activeUsers = new Map(); // username -> socketId
const userBySocket = new Map(); // socketId -> { username, room }
const rooms = new Map(); // roomName -> Set(socketId)

function roomsSnapshot() {
  return [...rooms.entries()].map(([name, set]) => ({ name, count: set.size }));
}
function broadcastRooms() {
  io.emit("rooms:update", roomsSnapshot());
}
function validUsername(name) {
  const n = String(name || "").trim();
  return n.length >= 3 && n.length <= 20 && /^[a-zA-Z0-9_]+$/.test(n);
}
function validRoom(name) {
  const n = String(name || "").trim();
  return n.length >= 1 && n.length <= 30 && /^[\w-]+$/.test(n);
}
function validMessage(text) {
  const t = String(text || "").trim();
  return t.length >= 1 && t.length <= 500;
}

io.on("connection", (socket) => {
  // Claim username
  socket.on("auth:claim", ({ username }, cb) => {
    if (!validUsername(username)) return cb({ ok: false, error: "Invalid username." });
    if (activeUsers.has(username)) return cb({ ok: false, error: "Username already in use." });
    activeUsers.set(username, socket.id);
    userBySocket.set(socket.id, { username: username, room: null });
    cb({ ok: true });
    broadcastRooms();
  });

  // Release username
  socket.on("auth:release", ({ username }) => {
    const info = userBySocket.get(socket.id);
    if (info?.username === username) {
      // leave room if any
      if (info.room && rooms.has(info.room)) {
        const set = rooms.get(info.room);
        set.delete(socket.id);
        io.to(info.room).emit("room:system", {
          room: info.room,
          message: `${username} left`,
          count: set.size
        });
        if (set.size === 0) rooms.delete(info.room);
      }
      activeUsers.delete(username);
      userBySocket.delete(socket.id);
      broadcastRooms();
    }
  });

  // Request rooms list
  socket.on("rooms:list", () => {
    socket.emit("rooms:update", roomsSnapshot());
  });

  // Join room
  socket.on("room:join", ({ room, username }, cb) => {
    if (!validUsername(username)) return cb({ ok: false, error: "Invalid username." });
    const holder = activeUsers.get(username);
    if (holder !== socket.id) return cb({ ok: false, error: "Impersonation detected." });
    if (!validRoom(room)) return cb({ ok: false, error: "Invalid room name." });

    const prev = userBySocket.get(socket.id)?.room;
    if (prev) {
      socket.leave(prev);
      const set = rooms.get(prev);
      if (set) {
        set.delete(socket.id);
        io.to(prev).emit("room:system", { room: prev, message: `${username} left`, count: set.size });
        if (set.size === 0) rooms.delete(prev);
      }
    }

    socket.join(room);
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(socket.id);

    userBySocket.set(socket.id, { username, room });

    const count = rooms.get(room).size;
    io.to(room).emit("room:system", { room, message: `${username} joined`, count });
    broadcastRooms();
    cb({ ok: true });
  });

  // Leave room
  socket.on("room:leave", ({ room, username }) => {
    if (!rooms.has(room)) return;
    socket.leave(room);
    const set = rooms.get(room);
    set.delete(socket.id);
    io.to(room).emit("room:system", { room, message: `${username} left`, count: set.size });
    if (set.size === 0) rooms.delete(room);
    const info = userBySocket.get(socket.id);
    if (info) userBySocket.set(socket.id, { ...info, room: null });
    broadcastRooms();
  });

  // Send chat message
  socket.on("chat:send", ({ room, username, message }) => {
    if (!validMessage(message) || !validRoom(room) || !validUsername(username)) return;
    const holder = activeUsers.get(username);
    if (holder !== socket.id) return; // prevent impersonation
    const ts = Date.now();
    io.to(room).emit("chat:message", { room, username, message, ts });
  });

  // Typing indicator
  socket.on("chat:typing", ({ room, username }) => {
    const holder = activeUsers.get(username);
    if (holder !== socket.id || !rooms.has(room)) return;
    socket.to(room).emit("chat:typing", { room, username });
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    const info = userBySocket.get(socket.id);
    if (!info) return;
    const { username, room } = info;
    if (room && rooms.has(room)) {
      const set = rooms.get(room);
      set.delete(socket.id);
      io.to(room).emit("room:system", { room, message: `${username} disconnected`, count: set.size });
      if (set.size === 0) rooms.delete(room);
    }
    activeUsers.delete(username);
    userBySocket.delete(socket.id);
    broadcastRooms();
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
