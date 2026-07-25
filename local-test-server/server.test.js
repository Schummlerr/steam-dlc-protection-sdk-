import express from "express";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || "";
const MOCK_STEAM = String(process.env.MOCK_STEAM || "false").toLowerCase() === "true";

app.use(
  cors({
    origin: "*",
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
  }),
);
app.use(express.json({ limit: "256kb" }));

// Rate limiting: max 20 requests per minute per IP
const dlcLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please slow down." },
});
app.use("/verify-dlc", dlcLimiter);

function deriveTransportKey(sharedSecret) {
  return crypto
    .createHmac("sha256", Buffer.from("dlc-protection-sdk-v1-transport", "utf8"))
    .update(sharedSecret)
    .digest();
}

function unwrapClientPublicKeySpki(clientPublicKeyBase64) {
  // P-256 SPKI format is standardized:
  // Bytes 0-25: Header (AlgorithmIdentifier, BIT STRING tag/length, unused bits)
  // Bytes 26-90: Raw EC point (65 bytes: 0x04 || X(32) || Y(32))
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
  // P-256 SPKI DER: SEQUENCE { AlgorithmIdentifier, BIT STRING { 0x00, rawPoint } }
  // Total: 91 bytes (26 byte header + 65 byte raw point)
  const header = Buffer.from(
    "3059301306072a8648ce3d020106082a8648ce3d030107034200",
    "hex"
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

  // Return server's public key in SPKI format (matches .NET ImportSubjectPublicKeyInfo)
  const serverPublicKeySpki = rawPointToSpki(serverEcdh.getPublicKey());
  return {
    serverPublicKey: serverPublicKeySpki.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    mac: mac.toString("base64"),
  };
}

async function authenticateUserTicket({ steamAppId, ticketHex, identity }) {
  if (MOCK_STEAM) {
    return { ok: true, steamId: "76561198000000000" };
  }

  if (!STEAM_WEB_API_KEY) {
    throw new Error("STEAM_WEB_API_KEY fehlt in .env");
  }

  const url = "https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/";
  const params = {
    key: STEAM_WEB_API_KEY,
    appid: steamAppId,
    ticket: ticketHex,
  };
  if (identity) params.identity = identity;

  const { data } = await axios.get(url, { params, timeout: 10000 });
  const paramsBlock = data?.response?.params;
  const result = paramsBlock?.result;
  const steamId = paramsBlock?.ownersteamid;

  if (String(result) !== "1" && result !== "OK") {
    return { ok: false, steamId: null, reason: `Ticket ungültig: result=${result}` };
  }

  if (!steamId) {
    return { ok: false, steamId: null, reason: "Keine ownersteamid von Valve erhalten." };
  }

  return { ok: true, steamId };
}

async function checkDlcOwnership(steamId, dlcAppId) {
  if (MOCK_STEAM) {
    return { ok: true };
  }

  const url = "https://api.steampowered.com/ISteamUser/CheckAppOwnership/v2/";
  const { data } = await axios.get(url, {
    params: {
      key: STEAM_WEB_API_KEY,
      steamid: steamId,
      appid: dlcAppId,
    },
    timeout: 10000,
  });

  const owns = data?.appownership?.ownsapp;
  if (owns !== true && owns !== 1 && String(owns) !== "true") {
    return { ok: false, reason: "Spieler besitzt DLC nicht." };
  }

  return { ok: true };
}

app.options("/verify-dlc", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.status(204).end();
});

app.get("/verify-dlc", (_req, res) => {
  res.status(405).json({ success: false, error: "Method not allowed" });
});

app.post("/verify-dlc", async (req, res) => {
  try {
    const { steamAppId, dlcId, ticketHex, identity, clientPublicKey } = req.body || {};

    if (!steamAppId || !dlcId || !ticketHex || !clientPublicKey) {
      return res.status(400).json({
        success: false,
        error: "Pflichtfelder: steamAppId, dlcId, ticketHex, clientPublicKey",
      });
    }

    // Validate types and ranges
    if (typeof steamAppId !== "number" || steamAppId < 1 || steamAppId > 4294967295) {
      return res.status(400).json({
        success: false,
        error: "Invalid Steam App ID",
      });
    }

    if (typeof dlcId !== "number" || dlcId < 1 || dlcId > 4294967295) {
      return res.status(400).json({
        success: false,
        error: "Invalid DLC ID",
      });
    }

    // Validate ticket hex format
    if (!/^[0-9a-fA-F]+$/.test(ticketHex) || ticketHex.length % 2 !== 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid ticket format",
      });
    }

    // Validate client public key (P-256 SPKI is 91 bytes in base64 ≈ 124 chars)
    if (clientPublicKey.length < 100 || clientPublicKey.length > 200) {
      return res.status(400).json({
        success: false,
        error: "Invalid public key format",
      });
    }

    const auth = await authenticateUserTicket({ steamAppId, ticketHex, identity });
    if (!auth.ok) {
      return res.status(403).json({
        success: false,
        error: auth.reason || "Ticket-Validierung fehlgeschlagen.",
      });
    }

    const ownership = await checkDlcOwnership(auth.steamId, dlcId);
    if (!ownership.ok) {
      return res.status(403).json({
        success: false,
        error: ownership.reason || "Kein DLC-Besitz.",
      });
    }

    let clientPublicKeyRawBytes;
    try {
      clientPublicKeyRawBytes = unwrapClientPublicKeySpki(clientPublicKey);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid public key format",
      });
    }

    // Use fixed AES key from env if available (for real game testing),
    // otherwise generate a random one (for crypto testing only).
    const DLC_AES_KEY_BASE64 = process.env.DLC_AES_KEY_BASE64 || "";
    let aesKey;
    if (DLC_AES_KEY_BASE64) {
      aesKey = Buffer.from(DLC_AES_KEY_BASE64, "base64");
      if (aesKey.length !== 32) {
        return res.status(500).json({
          success: false,
          error: "DLC_AES_KEY_BASE64 must decode to exactly 32 bytes.",
        });
      }
    } else {
      aesKey = crypto.randomBytes(32);
    }

    const wrappedKey = wrapAesKey(aesKey, clientPublicKeyRawBytes);

    console.log(`[verify-dlc] SUCCESS: SteamID=${auth.steamId}, AppID=${steamAppId}, DLC=${dlcId}`);

    return res.json({
      success: true,
      steamId: auth.steamId,
      wrappedKey,
    });
  } catch (error) {
    console.error("[verify-dlc]", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Interner Serverfehler",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, mock: MOCK_STEAM });
});

// Ignore stdin close so the server stays alive in non-TTY environments
if (process.stdin.isTTY) {
  process.stdin.resume();
} else {
  process.stdin.destroy();
}

app.listen(PORT, () => {
  console.log(`DLC Protection Test Server läuft auf http://localhost:${PORT}`);
  console.log(`MOCK_STEAM=${MOCK_STEAM}`);
  console.log(`AES_KEY=${process.env.DLC_AES_KEY_BASE64 ? "from .env (fixed)" : "random per request"}`);
});
