const fs = require("fs");
const path = require("path");

const REQUIRED_ENV_VARS = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_DATABASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID"
];

function readEnvConfig() {
  const missing = [];
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || ""
  };

  for (const envName of REQUIRED_ENV_VARS) {
    if (!process.env[envName]) {
      missing.push(envName);
    }
  }

  return { config, missing };
}

function readExistingConfig(outputPath) {
  if (!fs.existsSync(outputPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(outputPath, "utf8");
    const match = content.match(/window\.FIREBASE_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?/);
    if (!match) {
      return null;
    }

    const configObjectLiteral = match[1];
    const parsed = new Function(`return (${configObjectLiteral});`)();
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

const outputPath = path.join(process.cwd(), "firebase-config.js");
const { config: envConfig, missing } = readEnvConfig();
let configToWrite = envConfig;

if (missing.length > 0) {
  const existing = readExistingConfig(outputPath);
  if (existing) {
    console.warn(
      `Missing Firebase env vars (${missing.join(
        ", "
      )}). Reusing existing firebase-config.js for this build.`
    );
    configToWrite = existing;
  } else {
    throw new Error(
      `Missing required Firebase environment variables: ${missing.join(
        ", "
      )}. Set them in Netlify site settings.`
    );
  }
}

const out = `window.FIREBASE_CONFIG = ${JSON.stringify(configToWrite, null, 2)};\n`;
fs.writeFileSync(outputPath, out, "utf8");
console.log(`Generated ${outputPath}`);
