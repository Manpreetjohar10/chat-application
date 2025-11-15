// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const rooms = new Map(); // roomName -> Set of socketIds
const userData = new Map(); // socketId -> { username, room }

function getRoomsSnapshot() {
  return [...rooms.entries()].map(([name, set]) => ({ name, count: set.size }));
}

function broadcastRooms() {
  io.emit("rooms", getRoomsSnapshot());
}

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ room, username }) => {
    // Leave previous room
    const prev = userData.get(socket.id)?.room;
    if (prev) {
      socket.leave(prev);
      const set = rooms.get(prev);
      if (set) {
        set.delete(socket.id);
        const count = set.size;
        io.to(prev).emit("system", { room: prev, message: `${username} left`, count });
        if (count === 0) rooms.delete(prev);
      }
    }

    // Join new room
    socket.join(room);
    userData.set(socket.id, { username, room });

    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(socket.id);

    const count = rooms.get(room).size;
    io.to(room).emit("system", { room, message: `${username} joined`, count });
    broadcastRooms();
  });

  socket.on("leaveRoom", ({ room, username }) => {
    socket.leave(room);
    const set = rooms.get(room);
    if (set) {
      set.delete(socket.id);
      const count = set.size;
      io.to(room).emit("system", { room, message: `${username} left`, count });
      if (count === 0) rooms.delete(room);
    }
    broadcastRooms();
  });

  socket.on("chat", ({ room, username, message }) => {
    io.to(room).emit("chat", { username, message, room });
  });

  socket.on("typing", ({ room, username }) => {
    socket.to(room).emit("typing", { room, username });
  });

  socket.on("disconnect", () => {
    const info = userData.get(socket.id);
    if (!info) return;
    const { room, username } = info;
    const set = rooms.get(room);
    if (set) {
      set.delete(socket.id);
      const count = set.size;
      io.to(room).emit("system", { room, message: `${username} disconnected`, count });
      if (count === 0) rooms.delete(room);
    }
    userData.delete(socket.id);
    broadcastRooms();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});