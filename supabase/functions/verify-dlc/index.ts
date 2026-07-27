import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── Configuration ──────────────────────────────────────────────────────
const TRANSPORT_SALT = "dlc-protection-sdk-v1-transport";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) {
  log("error", "JWT_SECRET environment variable is required");
}
const STEAM_APP_ID_MIN = 1;
const STEAM_APP_ID_MAX = 4_294_967_295;
const DLC_ID_MIN = 1;
const DLC_ID_MAX = 4_294_967_295;
const MAX_CONTENT_LENGTH = 262_144;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ────────────────────────────────────────────────────────────

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ level, msg, timestamp: new Date().toISOString(), ...meta }));
}

function sha256Hex(input) {
  const hash = new Uint8Array(32);
  // Use WebCrypto subtle for SHA-256
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
    .then(buf => {
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      return hex;
    });
}

function hexToBytes(hex) {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concatUint8(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

function encodeBase64(buf) {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return globalThis.btoa(bin);
}

function base64ToUint8(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── Crypto ─────────────────────────────────────────────────────────────

async function deriveTransportKey(sharedSecret) {
  const hmacKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TRANSPORT_SALT),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", hmacKey, sharedSecret);
  return crypto.subtle.importKey("raw", digest, { name: "AES-CBC" }, true, ["encrypt", "decrypt"]);
}

async function importP256PublicKey(spkiBase64) {
  const raw = base64ToUint8(spkiBase64);
  return crypto.subtle.importKey("spki", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function wrapAesKey(aesKey, clientPublicKeyBase64) {
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const clientPublicKey = await importP256PublicKey(clientPublicKeyBase64);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey }, serverKeyPair.privateKey, 256
  );
  const transportKey = await deriveTransportKey(sharedBits);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-CBC", iv }, transportKey, aesKey
  ));
  const transportKeyRaw = await crypto.subtle.exportKey("raw", transportKey);
  const hmacKeySign = await crypto.subtle.importKey(
    "raw", transportKeyRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKeySign, concatUint8(iv, ciphertext)));
  const serverPublicKey = new Uint8Array(await crypto.subtle.exportKey("spki", serverKeyPair.publicKey));
  return {
    serverPublicKey: encodeBase64(serverPublicKey),
    iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext), mac: encodeBase64(mac),
  };
}

// ── JWT Token (no external lib) ───────────────────────────────────────

async function base64url(buf) {
  const b64 = encodeBase64(buf);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createOfflineToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = await base64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = await base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput)));
  const sigB64 = await base64url(sig);
  return `${signingInput}.${sigB64}`;
}

async function verifyOfflineToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const signingInput = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = base64ToUint8(parts[2].replace(/-/g, "+").replace(/_/g, "/") + "==".substring(0, (4 - parts[2].length % 4) % 4));
  const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(signingInput));
  if (!valid) return null;
  try {
    return JSON.parse(atob(parts[1]));
  } catch { return null; }
}

// ── Steam API ──────────────────────────────────────────────────────────

async function authenticateUserTicket(steamWebApiKey, steamAppId, ticketHex, identity, mockSteam) {
  if (mockSteam) return { ok: true, steamId: "76561198000000000" };
  try {
    const url = new URL("https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/");
    url.searchParams.set("key", steamWebApiKey);
    url.searchParams.set("appid", String(steamAppId));
    url.searchParams.set("ticket", ticketHex);
    if (identity) url.searchParams.set("identity", identity);
    const res = await fetch(url.toString());
    if (!res.ok) return { ok: false, reason: `Valve HTTP ${res.status}` };
    const data = await res.json();
    const p = data?.response?.params;
    const result = p?.result;
    const steamId = p?.ownersteamid;
    if (String(result) !== "1" && result !== "OK") return { ok: false, reason: `Invalid ticket: result=${result}` };
    if (!steamId) return { ok: false, reason: "No ownersteamid" };
    return { ok: true, steamId };
  } catch (e) { return { ok: false, reason: "Valve API error" }; }
}

async function checkDlcOwnership(steamWebApiKey, steamId, dlcAppId, mockSteam) {
  if (mockSteam) return { ok: true };
  try {
    const url = new URL("https://api.steampowered.com/ISteamUser/CheckAppOwnership/v2/");
    url.searchParams.set("key", steamWebApiKey);
    url.searchParams.set("steamid", steamId);
    url.searchParams.set("appid", String(dlcAppId));
    const res = await fetch(url.toString());
    if (!res.ok) return { ok: false, reason: `Ownership HTTP ${res.status}` };
    const data = await res.json();
    const owns = data?.appownership?.ownsapp;
    if (owns !== true && owns !== 1 && String(owns) !== "true") return { ok: false, reason: "DLC not owned" };
    return { ok: true };
  } catch (e) { return { ok: false, reason: "Ownership check error" }; }
}

// ── Request Validation ─────────────────────────────────────────────────

function validateVerifyBody(body) {
  if (!body || typeof body !== "object") return { valid: false, error: "Invalid body", status: 400 };
  const b = body;
  if (!b.steamAppId || typeof b.steamAppId !== "number" || !Number.isInteger(b.steamAppId) || b.steamAppId < STEAM_APP_ID_MIN || b.steamAppId > STEAM_APP_ID_MAX)
    return { valid: false, error: "Invalid steamAppId", status: 400 };
  if (!b.dlcId || typeof b.dlcId !== "number" || !Number.isInteger(b.dlcId) || b.dlcId < DLC_ID_MIN || b.dlcId > DLC_ID_MAX)
    return { valid: false, error: "Invalid dlcId", status: 400 };
  if (!b.ticketHex || typeof b.ticketHex !== "string" || !/^[0-9a-fA-F]+$/.test(b.ticketHex) || b.ticketHex.length % 2 !== 0)
    return { valid: false, error: "Invalid ticketHex", status: 400 };
  if (!b.clientPublicKey || typeof b.clientPublicKey !== "string" || b.clientPublicKey.length < 50 || b.clientPublicKey.length > 200)
    return { valid: false, error: "Invalid clientPublicKey", status: 400 };
  return { valid: true, data: { steamAppId: b.steamAppId, dlcId: b.dlcId, ticketHex: b.ticketHex, identity: typeof b.identity === "string" ? b.identity : undefined, clientPublicKey: b.clientPublicKey, requestOfflineToken: b.requestOfflineToken === true } };
}

// ── Rate Limiting ──────────────────────────────────────────────────────

async function checkRateLimit(clientIp) {
  try {
    const kv = await Deno.openKv();
    const windowKey = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const k = ["ratelimit", "verify-dlc", clientIp, windowKey];
    const r = await kv.get(k);
    const count = (r.value ?? 0) + 1;
    if (count > RATE_LIMIT_MAX) return false;
    await kv.set(k, count, { expireIn: RATE_LIMIT_WINDOW_MS });
    return true;
  } catch { return true; }
}

// ── Main Handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Supabase prefixes the function name in the path
  const path = url.pathname.replace(/^\/verify-dlc/, "") || "/";
  const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const startTime = Date.now();
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Admin Dashboard (serve HTML) ──
  if (cleanPath === "" || cleanPath === "/dashboard") {
    // Serve the dashboard HTML
    const html = await Deno.readTextFile(new URL("./dashboard.html", import.meta.url)).catch(() => "");
    if (html) return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return json({ error: "Dashboard not found" }, 404);
  }

  // ── Admin API ──
    if (cleanPath === "/admin/games" && req.method === "GET") {
      try {
        const apiKey = req.headers.get("x-api-key") || "";
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) return json({ error: "Config error" }, 500);
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const { data: games, error } = await supabase.from("games").select("*");
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, games });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (cleanPath === "/admin/register-game" && req.method === "POST") {
      try {
        const apiKey = req.headers.get("x-api-key") || "";
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) return json({ error: "Config error" }, 500);
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const body = await req.json();
        if (!body.name || !body.steamAppId) return json({ error: "name and steamAppId required" }, 400);

        const { data, error } = await supabase.from("games").insert({
          steam_app_id: body.steamAppId,
          name: body.name,
          offline_token_duration_hours: body.offlineTokenHours || 24,
        }).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, game: data });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (cleanPath === "/admin/add-dlc" && req.method === "POST") {
      try {
        const apiKey = req.headers.get("x-api-key") || "";
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) return json({ error: "Config error" }, 500);
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const body = await req.json();
        if (!body.gameId || !body.steamDlcId || !body.aesKeyBase64) return json({ error: "gameId, steamDlcId, and aesKeyBase64 required" }, 400);

        const { data, error } = await supabase.from("dlcs").insert({
          game_id: body.gameId,
          steam_dlc_id: body.steamDlcId,
          aes_encryption_key: body.aesKeyBase64,
          bundle_name: body.bundleName || null,
        }).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, dlc: data });
      } catch (e) { return json({ error: e.message }, 500); }
    }

  if (cleanPath === "/health") {
    return json({ ok: true, version: "2.0.0-saas", offlineTokens: true, uptime: (Date.now() - startTime) / 1000 });
  }

  // Only POST beyond this point
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── verify-offline-token ──
  if (cleanPath === "/verify-offline-token") {
    try {
      let body;
      try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      if (!body.token || !body.clientPublicKey) return json({ error: "Missing token or clientPublicKey" }, 400);

      const payload = await verifyOfflineToken(body.token, JWT_SECRET);
      if (!payload) return json({ error: "Invalid or expired offline token" }, 401);

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) return json({ error: "Config error" }, 500);
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

      const { data: game } = await supabase.from("games").select("id").eq("steam_app_id", payload.game_app).maybeSingle();
      if (!game) return json({ error: "Game not found" }, 404);

      const { data: dlc } = await supabase.from("dlcs").select("aes_encryption_key").eq("game_id", game.id).eq("steam_dlc_id", payload.dlc).maybeSingle();
      if (!dlc?.aes_encryption_key) return json({ error: "DLC not found" }, 404);

      const aesKey = base64ToUint8(dlc.aes_encryption_key);
      if (aesKey.length !== 32) return json({ error: "Invalid key" }, 500);

      const wrappedKey = await wrapAesKey(aesKey, body.clientPublicKey);
      return json({ success: true, steamId: payload.sub, wrappedKey });
    } catch (e) { return json({ error: e.message }, 500); }
  }

  // ── verify-dlc ──
  if (cleanPath === "/verify-dlc") {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const steamWebApiKey = Deno.env.get("STEAM_WEB_API_KEY") || "";
      const mockSteam = Deno.env.get("MOCK_STEAM") === "true";

      if (!supabaseUrl || !serviceRoleKey) return json({ error: "Config error" }, 500);

      // --- Debug: test basic connectivity ---
      log("debug", "verify-dlc called", { mockSteam, hasSupabaseUrl: !!supabaseUrl, hasServiceKey: !!serviceRoleKey });

      // Rate limiting (skip for mock)
      if (!mockSteam) {
        const allowed = await checkRateLimit(clientIp);
        if (!allowed) return json({ error: "Too many requests" }, 429);
      }

      // Size check
      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl) > MAX_CONTENT_LENGTH) return json({ error: "Request too large" }, 413);

      // Parse body
      let body;
      try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

      // API Key auth
      const apiKey = req.headers.get("x-api-key") || "";
      const apiKeyHash = await sha256Hex(apiKey);
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { data: keyRecord } = await supabase.from("api_keys").select("developer_id").eq("key_hash", apiKeyHash).maybeSingle();
      if (!keyRecord && !mockSteam) return json({ error: "Invalid API key" }, 403);

      // Validate body
      const validation = validateVerifyBody(body);
      if (!validation.valid) return json({ error: validation.error }, validation.status);
      const { steamAppId, dlcId, ticketHex, identity, clientPublicKey, requestOfflineToken } = validation.data;

      // Steam Auth
      const mockMode = mockSteam || steamWebApiKey === "";
      const auth = await authenticateUserTicket(steamWebApiKey, steamAppId, ticketHex, identity, mockMode);
      if (!auth.ok) return json({ error: auth.reason }, 403);

      // Ownership check
      const ownership = await checkDlcOwnership(steamWebApiKey, auth.steamId, dlcId, mockMode);
      if (!ownership.ok) return json({ error: ownership.reason }, 403);

      // Look up game
      const { data: game } = await supabase.from("games").select("*").eq("steam_app_id", steamAppId).maybeSingle();
      if (!game) return json({ error: "Game not found" }, 404);

      // Look up DLC
      const { data: dlc } = await supabase.from("dlcs").select("*").eq("game_id", game.id).eq("steam_dlc_id", dlcId).maybeSingle();
      if (!dlc?.aes_encryption_key) return json({ error: "DLC key not found" }, 404);

      const aesKey = base64ToUint8(dlc.aes_encryption_key);
      if (aesKey.length !== 32) return json({ error: "Invalid key length" }, 500);

      // Wrap key
      const wrappedKey = await wrapAesKey(aesKey, clientPublicKey);

      // Build response
      const response = { success: true, steamId: auth.steamId, wrappedKey };

      // Offline token
      if (requestOfflineToken) {
        const offlinePayload = {
          sub: auth.steamId,
          dlc: dlcId,
          game_app: steamAppId,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (game.offline_token_duration_hours || 24) * 3600,
        };
        response.offlineToken = await createOfflineToken(offlinePayload, JWT_SECRET);
        response.offlineTokenExpiresInHours = game.offline_token_duration_hours || 24;
      }

      // Log
      log("info", "verify-dlc success", { steamAppId, dlcId, steamId: auth.steamId, offline: !!requestOfflineToken });
      return json(response);
    } catch (e) {
      log("error", "verify-dlc error", { error: e.message, stack: e.stack?.substring(0,300) });
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
});