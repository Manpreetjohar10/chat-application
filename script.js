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
let usernameClaimRef = null;
let userRef = null;
let memberRef = null;
let myTypingRef = null;
let typingTimeout = null;

let roomMessagesRef = null;
let roomMembersRef = null;
let roomTypingRef = null;

const uid = getOrCreateClientId();
const firebaseConfig = window.FIREBASE_CONFIG || {};
let app = null;
let db = null;

if (isFirebaseConfigured(firebaseConfig)) {
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.database(app);
  watchConnectionState();
  watchRooms();
} else {
  setConnectionStatus("Set FIREBASE_CONFIG in index.html.");
}

function getOrCreateClientId() {
  const key = "chat_client_id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function isFirebaseConfigured(config) {
  return Boolean(
    config.apiKey &&
      config.apiKey !== "REPLACE_ME" &&
      config.databaseURL &&
      config.databaseURL.includes("firebaseio.com")
  );
}

function setConnectionStatus(text) {
  connectionStatus.textContent = text || "";
}

function showAuth() {
  authModal.style.display = "grid";
  authUsername.focus();
}

function hideAuth() {
  authModal.style.display = "none";
}

function sanitize(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text) {
  let safe = sanitize(text);
  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/\*(.+?)\*/g, "<em>$1</em>");
  safe = safe.replace(/\bhttps?:\/\/[^\s]+/g, (url) => {
    const u = url.substring(0, 200);
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
  return safe;
}

function validateUsername(name) {
  const n = name.trim();
  if (n.length < 3 || n.length > 20) return "Username must be 3-20 characters.";
  if (!/^[a-zA-Z0-9_]+$/.test(n)) return "Use letters, numbers, or underscore only.";
  return null;
}

function validateRoom(name) {
  const n = String(name || "").trim();
  if (n.length < 1 || n.length > 30) return false;
  return /^[\w-]+$/.test(n);
}

function watchConnectionState() {
  db.ref(".info/connected").on("value", (snapshot) => {
    const connected = snapshot.val() === true;
    if (!connected) {
      setConnectionStatus("Disconnected from realtime service.");
      return;
    }
    if (!isFirebaseConfigured(firebaseConfig)) return;
    setConnectionStatus("");
  });
}

function claimUsername(requestedName) {
  return new Promise((resolve, reject) => {
    const usernameKey = requestedName.toLowerCase();
    const claimRef = db.ref(`usernames/${usernameKey}`);

    claimRef.transaction(
      (current) => {
        if (current === null || current.uid === uid) {
          return { uid, username: requestedName };
        }
        return;
      },
      (error, committed, snapshot) => {
        if (error) {
          reject(error);
          return;
        }
        if (!committed) {
          resolve({ ok: false, error: "Username already in use." });
          return;
        }

        usernameClaimRef = claimRef;
        usernameClaimRef.onDisconnect().remove();

        userRef = db.ref(`users/${uid}`);
        userRef.set({ username: requestedName, room: null, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        userRef.onDisconnect().remove();

        resolve({ ok: true, claimedUsername: snapshot.val().username });
      },
      false
    );
  });
}

function releaseUsername() {
  if (usernameClaimRef) {
    usernameClaimRef.remove();
    usernameClaimRef = null;
  }
}

function leaveCurrentRoom() {
  if (memberRef) {
    memberRef.remove();
    memberRef = null;
  }
  if (myTypingRef) {
    myTypingRef.remove();
    myTypingRef = null;
  }
  if (userRef) {
    userRef.child("room").set(null);
  }

  detachRoomSubscriptions();
  currentRoom = null;
  currentRoomEl.textContent = "No room joined";
  participantsEl.textContent = "0 online";
  typingEl.textContent = "";
}

function detachRoomSubscriptions() {
  if (roomMessagesRef) {
    roomMessagesRef.off();
    roomMessagesRef = null;
  }
  if (roomMembersRef) {
    roomMembersRef.off();
    roomMembersRef = null;
  }
  if (roomTypingRef) {
    roomTypingRef.off();
    roomTypingRef = null;
  }
}

function watchRooms() {
  db.ref("rooms").on("value", (snapshot) => {
    const rooms = [];
    snapshot.forEach((roomSnap) => {
      const name = roomSnap.key;
      const members = roomSnap.child("members").val() || {};
      const count = Object.keys(members).length;
      rooms.push({ name, count });
    });

    rooms.sort((a, b) => a.name.localeCompare(b.name));
    roomsEl.innerHTML = "";

    rooms.forEach(({ name, count }) => {
      const li = document.createElement("li");
      li.dataset.room = name;
      li.innerHTML = `<span>${sanitize(name)}</span><span class="count">${count} online</span>`;
      if (name === currentRoom) li.classList.add("active");
      roomsEl.appendChild(li);
    });
  });
}

function subscribeRoom(room) {
  roomMessagesRef = db.ref(`rooms/${room}/messages`).limitToLast(200);
  roomMessagesRef.on("child_added", (snapshot) => {
    const data = snapshot.val() || {};
    addMessage(data, data.uid === uid);
  });

  roomMembersRef = db.ref(`rooms/${room}/members`);
  roomMembersRef.on("value", (snapshot) => {
    const members = snapshot.val() || {};
    participantsEl.textContent = `${Object.keys(members).length} online`;
  });

  roomMembersRef.on("child_added", (snapshot) => {
    if (snapshot.key === uid) return;
    const name = String(snapshot.val() || "Someone");
    addSystem(`${name} joined`);
  });

  roomMembersRef.on("child_removed", (snapshot) => {
    if (snapshot.key === uid) return;
    const name = String(snapshot.val() || "Someone");
    addSystem(`${name} left`);
  });

  roomTypingRef = db.ref(`rooms/${room}/typing`);
  roomTypingRef.on("value", (snapshot) => {
    const all = snapshot.val() || {};
    const names = Object.entries(all)
      .filter(([key]) => key !== uid)
      .map(([, value]) => String(value || ""))
      .filter(Boolean);

    if (names.length === 0) {
      typingEl.textContent = "";
      return;
    }
    typingEl.textContent = `${sanitize(names[0])} is typing...`;
  });
}

function joinRoom(room) {
  if (!db || !username) return;
  if (!validateRoom(room)) {
    alert("Invalid room name.");
    return;
  }

  if (currentRoom === room) return;

  leaveCurrentRoom();
  currentRoom = room;

  messagesEl.innerHTML = "";
  currentRoomEl.textContent = room;

  memberRef = db.ref(`rooms/${room}/members/${uid}`);
  memberRef.set(username);
  memberRef.onDisconnect().remove();

  myTypingRef = db.ref(`rooms/${room}/typing/${uid}`);
  myTypingRef.onDisconnect().remove();

  if (userRef) {
    userRef.child("room").set(room);
    userRef.child("updatedAt").set(firebase.database.ServerValue.TIMESTAMP);
  }

  subscribeRoom(room);
  highlightActiveRoom(room);
}

function highlightActiveRoom(room) {
  [...roomsEl.querySelectorAll("li")].forEach((li) => {
    li.classList.toggle("active", li.dataset.room === room);
  });
}

function sendMessage() {
  if (!db || !currentRoom || !username) return;

  const raw = messageEl.value.trim();
  if (!raw || raw.length > 500) return;

  const messageRef = db.ref(`rooms/${currentRoom}/messages`).push();
  messageRef.set({
    uid,
    username,
    message: raw,
    ts: firebase.database.ServerValue.TIMESTAMP
  });

  messageEl.value = "";
  stopTyping();
}

function markTyping() {
  if (!myTypingRef) return;
  myTypingRef.set(username);
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 1000);
}

function stopTyping() {
  if (!myTypingRef) return;
  myTypingRef.remove();
}

function addMessage(data, isMe) {
  const wrap = document.createElement("div");
  wrap.className = "message" + (isMe ? " me" : "");

  const meta = document.createElement("div");
  meta.className = "meta";
  const time = new Date(data.ts || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  meta.innerHTML = `<span>${sanitize(data.username || "Unknown")}</span><span>${time}</span>`;

  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = formatMessage(String(data.message || ""));

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

async function handleLogin() {
  if (!db) return;

  const name = authUsername.value.trim();
  const err = validateUsername(name);
  if (err) {
    authError.textContent = err;
    return;
  }

  authError.textContent = "";

  try {
    const result = await claimUsername(name);
    if (!result.ok) {
      authError.textContent = result.error || "Username unavailable.";
      return;
    }

    username = result.claimedUsername;
    userDisplay.textContent = `Signed in as ${username}`;
    hideAuth();
  } catch (error) {
    authError.textContent = "Could not sign in. Try again.";
    setConnectionStatus(`Login failed: ${error.message}`);
  }
}

function handleLogout() {
  leaveCurrentRoom();
  releaseUsername();

  if (userRef) {
    userRef.remove();
    userRef = null;
  }

  username = null;
  userDisplay.textContent = "";
  messagesEl.innerHTML = "";
  roomsEl.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
  showAuth();
}

authSubmit.addEventListener("click", handleLogin);

logoutBtn.addEventListener("click", handleLogout);

joinRoomBtn.addEventListener("click", () => {
  const room = roomInput.value.trim();
  if (!room) return;
  if (!username) {
    showAuth();
    return;
  }
  joinRoom(room);
});

roomsEl.addEventListener("click", (event) => {
  const li = event.target.closest("li[data-room]");
  if (!li || !username) return;
  joinRoom(li.dataset.room);
});

sendBtn.addEventListener("click", sendMessage);
messageEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendMessage();
});
messageEl.addEventListener("input", markTyping);

window.addEventListener("beforeunload", () => {
  stopTyping();
  if (memberRef) memberRef.remove();
  if (userRef) userRef.remove();
  if (usernameClaimRef) usernameClaimRef.remove();
});

showAuth();
