function resolveSocketServerUrl() {
  const configured = String(window.CHAT_SERVER_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return window.location.origin;
}

const socketServerUrl = resolveSocketServerUrl();
const socket = io(socketServerUrl, {
  transports: ["websocket", "polling"],
  withCredentials: true
});

const authModal = document.getElementById("auth-modal");
const authUsername = document.getElementById("auth-username");
const authSubmit = document.getElementById("auth-submit");
const authError = document.getElementById("auth-error");
const connectionStatus = document.getElementById("connection-status");

const userDisplay = document.getElementById("user-display");
const logoutBtn = document.getElementById("logout");

const roomsEl = document.getElementById("rooms");
const roomInput = document.getElementById("room-input");
const joinRoomBtn = document.getElementById("join-room");

const currentRoomEl = document.getElementById("current-room");
const participantsEl = document.getElementById("participants");
const messagesEl = document.getElementById("messages");
const typingEl = document.getElementById("typing");

const messageEl = document.getElementById("message");
const sendBtn = document.getElementById("send");

let username = null;
let currentRoom = null;

// Basic sanitizer + markdown-lite formatter: **bold**, *italics*, links
function sanitize(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function formatMessage(text) {
  let safe = sanitize(text);
  // Bold: **text**
  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italics: *text*
  safe = safe.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links: http(s)://...
  safe = safe.replace(/\bhttps?:\/\/[^\s]+/g, (url) => {
    const u = url.substring(0, 200); // guard length
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
  return safe;
}

function showAuth() {
  authModal.style.display = "grid";
  authUsername.focus();
}
function hideAuth() {
  authModal.style.display = "none";
}

function setConnectionStatus(text) {
  if (!connectionStatus) return;
  connectionStatus.textContent = text || "";
}

function validateUsername(name) {
  const n = name.trim();
  if (n.length < 3 || n.length > 20) return "Username must be 3-20 characters.";
  if (!/^[a-zA-Z0-9_]+$/.test(n)) return "Use letters, numbers, or underscore only.";
  return null;
}

authSubmit.addEventListener("click", () => {
  const name = authUsername.value.trim();
  const err = validateUsername(name);
  if (err) { authError.textContent = err; return; }

  socket.emit("auth:claim", { username: name }, (res) => {
    if (!res.ok) {
      authError.textContent = res.error || "Username unavailable.";
      return;
    }
    username = name;
    userDisplay.textContent = `Signed in as ${username}`;
    hideAuth();
    socket.emit("rooms:list");
  });
});

logoutBtn.addEventListener("click", () => {
  socket.emit("auth:release", { username });
  username = null;
  currentRoom = null;
  currentRoomEl.textContent = "No room joined";
  participantsEl.textContent = "0 online";
  messagesEl.innerHTML = "";
  typingEl.textContent = "";
  showAuth();
});

// Rooms: create/join
joinRoomBtn.addEventListener("click", () => {
  const room = roomInput.value.trim();
  if (!room) return;
  joinRoom(room);
});
roomsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-room]");
  if (!li) return;
  joinRoom(li.dataset.room);
});

function joinRoom(room) {
  if (!username) { showAuth(); return; }
  if (currentRoom) socket.emit("room:leave", { room: currentRoom, username });

  socket.emit("room:join", { room, username }, (res) => {
    if (!res.ok) return alert(res.error || "Could not join room.");
    currentRoom = room;
    currentRoomEl.textContent = room;
    messagesEl.innerHTML = "";
    typingEl.textContent = "";
    highlightActiveRoom(room);
  });
}

function highlightActiveRoom(room) {
  [...roomsEl.querySelectorAll("li")].forEach(li =>
    li.classList.toggle("active", li.dataset.room === room)
  );
}

// Send message
sendBtn.addEventListener("click", sendMessage);
messageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
function sendMessage() {
  const raw = messageEl.value.trim();
  if (!raw || !currentRoom || !username) return;
  socket.emit("chat:send", { room: currentRoom, username, message: raw });
  addMessage({ username, message: raw, ts: Date.now() }, true);
  messageEl.value = "";
}

// Typing
messageEl.addEventListener("input", () => {
  if (!currentRoom || !username) return;
  socket.emit("chat:typing", { room: currentRoom, username });
});

// Render message
function addMessage(data, isMe = false) {
  const wrap = document.createElement("div");
  wrap.className = "message" + (isMe ? " me" : "");

  const meta = document.createElement("div");
  meta.className = "meta";
  const time = new Date(data.ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.innerHTML = `<span>${sanitize(data.username)}</span><span>${time}</span>`;

  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = formatMessage(data.message);

  wrap.appendChild(meta);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const wrap = document.createElement("div");
  wrap.className = "message system";
  wrap.textContent = text;
  messagesEl.appendChild(wrap);
}

// Socket events
socket.on("rooms:update", (list) => {
  roomsEl.innerHTML = "";
  list.forEach(({ name, count }) => {
    const li = document.createElement("li");
    li.dataset.room = name;
    li.innerHTML = `<span>${sanitize(name)}</span><span class="count">${count} online</span>`;
    roomsEl.appendChild(li);
  });
});

socket.on("chat:message", (data) => {
  addMessage(data, data.username === username);
});

socket.on("chat:typing", (data) => {
  if (data.room !== currentRoom) return;
  typingEl.textContent = `${sanitize(data.username)} is typing...`;
  setTimeout(() => { typingEl.textContent = ""; }, 1000);
});

socket.on("room:system", (data) => {
  if (data.room !== currentRoom) return;
  addSystem(data.message);
  participantsEl.textContent = `${data.count} online`;
});

socket.on("connect", () => {
  setConnectionStatus("");
});

socket.on("connect_error", (err) => {
  const isNetlify = window.location.hostname.endsWith(".netlify.app");
  const hasConfiguredServer = String(window.CHAT_SERVER_URL || "").trim().length > 0;

  if (isNetlify && !hasConfiguredServer) {
    setConnectionStatus("Set CHAT_SERVER_URL in index.html to your backend URL.");
    return;
  }

  setConnectionStatus(`Connection failed: ${err.message}`);
});

socket.on("disconnect", (reason) => {
  setConnectionStatus(`Disconnected: ${reason}`);
});

// Initial
showAuth();
