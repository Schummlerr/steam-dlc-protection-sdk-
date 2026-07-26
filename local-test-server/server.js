/**
 * Steam DLC Protection SDK — Local Test Server (v2 SaaS)
 *
 * Simulates the full SaaS backend:
 *   - API Key authentication
 *   - Multi-tenant game/DLC lookup
 *   - P-256 ECDH key wrapping
 *   - Offline token generation (HMAC-signed)
 *   - Rate limiting, CORS, metrics, structured logging
 *
 * In mock mode (MOCK_STEAM=true) all Steam API calls skip to local test data.
 * In mock mode (MOCK_API_KEY=true) API key validation is skipped.
 */

import express from "express";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

// ── Config ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 3000);
const MOCK_STEAM = String(process.env.MOCK_STEAM || "true").toLowerCase() === "true";
const MOCK_API_KEY = String(process.env.MOCK_API_KEY || "true").toLowerCase() === "true";
const DISABLE_RATE_LIMIT = String(process.env.DISABLE_RATE_LIMIT || "false").toLowerCase() === "true";
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-do-not-use-in-production";
const DEMO_API_KEY = process.env.DEMO_API_KEY || "sk_test_dlc_protection_demo_key_2026";

// In-memory DB (simulates PostgreSQL for local testing)
const db = {
  developers: new Map([
    ["dev-1", { id: "dev-1", name: "Demo Developer", plan: "pro", isActive: true }],
  ]),
  games: new Map([
    ["game-1", { id: "game-1", developerId: "dev-1", steamAppId: 480, name: "Spacewar Test Game", offlineTokenHours: 24 }],
  ]),
  dlcs: new Map([
    ["dlc-1", {
      id: "dlc-1",
      gameId: "game-1",
      steamDlcId: 123456,
      aesKeyBase64: process.env.DLC_AES_KEY_BASE64 || crypto.randomBytes(32).toString("base64"),
      bundleName: "test-dlc",
      enabled: true,
    }],
  ]),
  apiKeys: new Map([
    [sha256Hex(DEMO_API_KEY), { developerId: "dev-1", label: "demo-key" }],
  ]),
};

// ── Helpers ─────────────────────────────────────────────────────────────
function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ level, msg, timestamp: new Date().toISOString(), ...meta }));
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function deriveTransportKey(sharedSecret) {
  return crypto
    .createHmac("sha256", Buffer.from("dlc-protection-sdk-v1-transport", "utf8"))
    .update(sharedSecret)
    .digest();
}

function unwrapClientPublicKeySpki(clientPublicKeyBase64) {
  const spkiDer = Buffer.from(clientPublicKeyBase64, "base64");
  if (spkiDer.length !== 91) {
    throw new Error(`Invalid P-256 SPKI length: expected 91, got ${spkiDer.length}`);
  }
  if (spkiDer[26] !== 0x04) {
    throw new Error("Invalid P-256 SPKI: raw point must start with 0x04");
  }
  return spkiDer.subarray(26);
}

function rawPointToSpki(rawPoint) {
  const header = Buffer.from(
    "3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"
  );
  return Buffer.concat([header, rawPoint]);
}

function wrapAesKey(aesKey, clientPublicKeyRawBytes) {
  const serverEcdh = crypto.createECDH("prime256v1");
  serverEcdh.generateKeys();

  const sharedSecret = serverEcdh.computeSecret(clientPublicKeyRawBytes);
  const transportKey = deriveTransportKey(sharedSecret);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", transportKey, iv);
  const ciphertext = Buffer.concat([cipher.update(aesKey), cipher.final()]);

  const mac = crypto
    .createHmac("sha256", transportKey)
    .update(Buffer.concat([iv, ciphertext]))
    .digest();

  const serverPublicKeySpki = rawPointToSpki(serverEcdh.getPublicKey());
  return {
    serverPublicKey: serverPublicKeySpki.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    mac: mac.toString("base64"),
  };
}

function generateOfflineToken(steamId, dlcId, game) {
  const payload = {
    sub: steamId,
    dlc: dlcId,
    game: game.id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (game.offlineTokenHours || 24) * 3600,
  };
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256" });
}

function validateApiKey(apiKey) {
  if (MOCK_API_KEY) {
    return db.developers.get("dev-1");
  }
  const hash = sha256Hex(apiKey);
  const keyEntry = db.apiKeys.get(hash);
  if (!keyEntry) return null;
  return db.developers.get(keyEntry.developerId);
}

// ── Express Setup ───────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: "*", methods: ["POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Accept", "X-Api-Key"] }));
app.use(express.json({ limit: "256kb" }));

// ── Metrics Middleware ──────────────────────────────────────────────────
let requestCount = 0;
let successCount = 0;
let failureCount = 0;
const serverStartTime = Date.now();

app.use((req, res, next) => {
  requestCount++;
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (body && body.success === true) successCount++;
    else if (body && body.success === false) failureCount++;
    return originalJson(body);
  };
  next();
});

// ── Rate Limiting ──────────────────────────────────────────────────────
if (!DISABLE_RATE_LIMIT) {
  const dlcLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests. Please slow down." },
  });
  app.use("/verify-dlc", dlcLimiter);
}

// ── API Key Auth Middleware ─────────────────────────────────────────────
app.post("/verify-dlc", (req, res, next) => {
  // Extract API key from header
  const apiKey = req.headers["x-api-key"];
  if (!apiKey && !MOCK_API_KEY) {
    return res.status(401).json({ success: false, error: "Missing X-Api-Key header" });
  }

  // Validate
  if (!MOCK_API_KEY) {
    const developer = validateApiKey(apiKey);
    if (!developer) {
      return res.status(403).json({ success: false, error: "Invalid API key" });
    }
    req.developer = developer;
  } else {
    req.developer = db.developers.get("dev-1");
  }
  next();
});

// ── Health Endpoint ─────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mock: MOCK_STEAM,
    apiKeyAuth: !MOCK_API_KEY,
    offlineTokens: true,
    version: "2.0.0-saas",
    uptime: process.uptime(),
    nodeVersion: process.version,
  });
});

// ── Metrics Endpoint ────────────────────────────────────────────────────
app.get("/metrics", (_req, res) => {
  res.json({
    version: "2.0.0-saas",
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    requests: { total: requestCount, success: successCount, failure: failureCount },
    status: "healthy",
    mockMode: MOCK_STEAM,
    apiKeyAuth: !MOCK_API_KEY,
    rateLimit: DISABLE_RATE_LIMIT ? "disabled" : "30/min",
  });
});

// ── OPTIONS (CORS preflight) ────────────────────────────────────────────
app.options("/verify-dlc", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Api-Key");
  res.status(204).end();
});

// ── GET not allowed ─────────────────────────────────────────────────────
app.get("/verify-dlc", (_req, res) => {
  res.status(405).json({ success: false, error: "Method not allowed" });
});

// ── Main verify-dlc Handler ─────────────────────────────────────────────
app.post("/verify-dlc", async (req, res) => {
  try {
    // Parse body
    const { steamAppId, dlcId, ticketHex, identity, clientPublicKey, requestOfflineToken } = req.body || {};

    // Validate required fields
    if (!steamAppId || !dlcId || !ticketHex || !clientPublicKey) {
      return res.status(400).json({ success: false, error: "Required: steamAppId, dlcId, ticketHex, clientPublicKey" });
    }

    // Validate types
    if (typeof steamAppId !== "number" || steamAppId < 1 || steamAppId > 4294967295) {
      return res.status(400).json({ success: false, error: "Invalid Steam App ID" });
    }
    if (typeof dlcId !== "number" || dlcId < 1 || dlcId > 4294967295) {
      return res.status(400).json({ success: false, error: "Invalid DLC ID" });
    }
    if (!/^[0-9a-fA-F]+$/.test(ticketHex) || ticketHex.length % 2 !== 0) {
      return res.status(400).json({ success: false, error: "Invalid ticket hex format" });
    }
    if (clientPublicKey.length < 50 || clientPublicKey.length > 200) {
      return res.status(400).json({ success: false, error: "Invalid public key format" });
    }

    // Steam Authentication (mock or real)
    let steamId;
    if (MOCK_STEAM) {
      steamId = "76561198000000000";
    } else {
      // In real mode, call Valve API here
      steamId = "76561198000000000"; // Placeholder
    }

    // Look up game by steamAppId
    const game = [...db.games.values()].find(g => g.steamAppId === steamAppId);
    if (!game) {
      return res.status(404).json({ success: false, error: "Game not found. Register it in your dashboard." });
    }

    // Look up DLC
    const dlc = [...db.dlcs.values()].find(d => d.gameId === game.id && d.steamDlcId === dlcId);
    if (!dlc || !dlc.enabled) {
      return res.status(404).json({ success: false, error: "DLC not found or not enabled." });
    }

    // Decode AES key
    const aesKey = Buffer.from(dlc.aesKeyBase64, "base64");
    if (aesKey.length !== 32) {
      return res.status(500).json({ success: false, error: "Invalid DLC key in database" });
    }

    // Unwrap client's public key
    let clientPublicKeyRawBytes;
    try {
      clientPublicKeyRawBytes = unwrapClientPublicKeySpki(clientPublicKey);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid public key format" });
    }

    // Wrap the AES key with ECDH
    const wrappedKey = wrapAesKey(aesKey, clientPublicKeyRawBytes);

    // Build response
    const response = {
      success: true,
      steamId,
      wrappedKey,
    };

    // Generate offline token if requested
    if (requestOfflineToken) {
      response.offlineToken = generateOfflineToken(steamId, dlcId, game);
      response.offlineTokenExpiresInHours = game.offlineTokenHours || 24;
    }

    log("info", "DLC verification successful", { steamAppId, dlcId, steamId, offlineToken: !!requestOfflineToken });

    return res.json(response);
  } catch (error) {
    log("error", "DLC verification failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ── Offline Token Verification Endpoint ─────────────────────────────────
app.post("/verify-offline-token", (req, res) => {
  try {
    const { token, clientPublicKey, dlcId } = req.body || {};

    if (!token || !clientPublicKey) {
      return res.status(400).json({ success: false, error: "Required: token, clientPublicKey" });
    }

    // Verify token
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      return res.status(401).json({ success: false, error: "Invalid or expired offline token. Please go online to refresh." });
    }

    // Token is valid — wrap the DLC key for the new session
    const game = db.games.get(payload.game);
    const dlc = [...db.dlcs.values()].find(d => d.gameId === payload.game && d.steamDlcId === payload.dlc);

    if (!game || !dlc) {
      return res.status(404).json({ success: false, error: "DLC not found" });
    }

    const aesKey = Buffer.from(dlc.aesKeyBase64, "base64");
    let clientPublicKeyRawBytes;
    try {
      clientPublicKeyRawBytes = unwrapClientPublicKeySpki(clientPublicKey);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid public key format" });
    }

    const wrappedKey = wrapAesKey(aesKey, clientPublicKeyRawBytes);

    log("info", "Offline token verified", { dlcId: payload.dlc, steamId: payload.sub });

    return res.json({
      success: true,
      steamId: payload.sub,
      wrappedKey,
      offlineTokenRefreshed: payload,
    });
  } catch (error) {
    log("error", "Offline verification failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ── Admin Endpoints (for dashboard / CLI) ───────────────────────────────
app.get("/admin/games", (req, res) => {
  // In production, this requires admin auth
  const gamesList = [...db.games.values()].map(g => ({
    id: g.id,
    steamAppId: g.steamAppId,
    name: g.name,
    dlcCount: [...db.dlcs.values()].filter(d => d.gameId === g.id).length,
    offlineTokenHours: g.offlineTokenHours,
  }));
  res.json({ success: true, games: gamesList, mock: MOCK_STEAM });
});

// ── Server Start ────────────────────────────────────────────────────────
// Prevent server exit when stdin is not a TTY
if (!process.stdin.isTTY) {
  process.stdin.on("end", () => { /* swallow */ });
} else {
  process.stdin.resume();
}

app.listen(PORT, () => {
  log("info", "DLC Protection SDK v2 SaaS Server started", {
    port: PORT,
    mockMode: MOCK_STEAM,
    apiKeyAuth: !MOCK_API_KEY,
    offlineTokens: true,
    version: "2.0.0-saas",
  });
});