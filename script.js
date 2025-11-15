
const socket =  io()// auto connects to same origin
const roomsEl = document.getElementById("rooms");
const roomInput = document.getElementById("room-input");
const joinRoomBtn = document.getElementById("join-room");
const usernameEl = document.getElementById("username");
const saveUsernameBtn = document.getElementById("save-username");

const currentRoomEl = document.getElementById("current-room");
const participantsEl = document.getElementById("participants");
const messagesEl = document.getElementById("messages");
const typingEl = document.getElementById("typing");

const messageEl = document.getElementById("message");
const sendBtn = document.getElementById("send");

let username = "";
let currentRoom = null;

// Save username
saveUsernameBtn.addEventListener("click", () => {
  const name = usernameEl.value.trim();
  if (!name) return;
  username = name;
  saveUsernameBtn.textContent = "Saved";
  saveUsernameBtn.disabled = true;
});

// Join room via input
joinRoomBtn.addEventListener("click", () => {
  const room = roomInput.value.trim();
  if (!room) return;
  joinRoom(room);
});

// Join room via list click
roomsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-room]");
  if (!li) return;
  joinRoom(li.dataset.room);
});

function joinRoom(room) {
  if (!username) {
    alert("Please set your name first.");
    return;
  }
  if (currentRoom) socket.emit("leaveRoom", { room: currentRoom, username });

  socket.emit("joinRoom", { room, username });
  currentRoom = room;
  currentRoomEl.textContent = room;
  messagesEl.innerHTML = "";
  typingEl.textContent = "";
  highlightActiveRoom(room);
}

function highlightActiveRoom(room) {
  [...roomsEl.querySelectorAll("li")].forEach(li => {
    li.classList.toggle("active", li.dataset.room === room);
  });
}

// Send message
sendBtn.addEventListener("click", sendMessage);
messageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = messageEl.value.trim();
  if (!text || !currentRoom || !username) return;
  socket.emit("chat", { room: currentRoom, username, message: text });
  addMessage({ username, message: text }, true);
  messageEl.value = "";
}

// Typing indicator
messageEl.addEventListener("input", () => {
  if (!currentRoom || !username) return;
  socket.emit("typing", { room: currentRoom, username });
});

// Render message
function addMessage(data, isMe = false) {
  const wrap = document.createElement("div");
  wrap.className = "message" + (isMe ? " me" : "");
  const meta = document.createElement("div");
  meta.className = "meta";
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  meta.innerHTML = `<span>${data.username}</span><span>${time}</span>`;
  const content = document.createElement("div");
  content.className = "content";
  content.textContent = data.message;

  wrap.appendChild(meta);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// System message
function addSystem(text) {
  const wrap = document.createElement("div");
  wrap.className = "message system";
  wrap.textContent = text;
  messagesEl.appendChild(wrap);
}

// Socket events
socket.on("rooms", (list) => {
  roomsEl.innerHTML = "";
  list.forEach(({ name, count }) => {
    const li = document.createElement("li");
    li.dataset.room = name;
    li.innerHTML = `<span>${name}</span><span class="count">${count} online</span>`;
    roomsEl.appendChild(li);
  });
});

socket.on("chat", (data) => {
  addMessage(data, data.username === username);
});

socket.on("typing", (data) => {
  if (data.room !== currentRoom) return;
  typingEl.textContent = `${data.username} is typing...`;
  setTimeout(() => {
    typingEl.textContent = "";
  }, 1200);
});

socket.on("system", (data) => {
  if (data.room !== currentRoom) return;
  addSystem(data.message);
  participantsEl.textContent = `${data.count} online`;
});