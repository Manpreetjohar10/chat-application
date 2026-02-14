# Chat Boat Web Application

This version uses Firebase Realtime Database as the backend-as-a-service.

## Setup

1. Create a Firebase project.
2. Enable Realtime Database.
3. Copy your web app config from Firebase Console.
4. Replace `window.FIREBASE_CONFIG` in `index.html` with your real values.
5. Deploy frontend files to Netlify.

## Notes

- No custom Node/Socket.IO server is required for chat.
- Username uniqueness is handled in the database via transactions.
- Presence (online members) uses Realtime Database `onDisconnect()`.
