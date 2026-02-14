const fs = require("fs");
const path = require("path");

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const config = {
  apiKey: required("FIREBASE_API_KEY"),
  authDomain: required("FIREBASE_AUTH_DOMAIN"),
  databaseURL: required("FIREBASE_DATABASE_URL"),
  projectId: required("FIREBASE_PROJECT_ID"),
  storageBucket: required("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: required("FIREBASE_MESSAGING_SENDER_ID"),
  appId: required("FIREBASE_APP_ID")
};

const out = `window.FIREBASE_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
const outputPath = path.join(process.cwd(), "firebase-config.js");
fs.writeFileSync(outputPath, out, "utf8");
console.log(`Generated ${outputPath}`);
