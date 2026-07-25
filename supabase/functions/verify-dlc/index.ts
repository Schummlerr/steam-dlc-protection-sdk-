import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VerifyRequestBody {
  steamAppId: number;
  dlcId: number;
  ticketHex: string;
  identity?: string;
  clientPublicKey: string;
}

interface WrappedKeyPayload {
  serverPublicKey: string;
  iv: string;
  ciphertext: string;
  mac: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("ticketHex ist kein gültiger Hex-String.");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveTransportKey(sharedSecret: ArrayBuffer): Promise<CryptoKey> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("dlc-protection-sdk-v1-transport"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", hmacKey, sharedSecret);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-CBC" },
    true, // Make extractable so we can use it for HMAC
    ["encrypt", "decrypt"],
  );
}

async function importP256PublicKey(spkiBase64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(spkiBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "spki",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function wrapAesKey(
  aesKey: Uint8Array,
  clientPublicKeyBase64: string,
): Promise<WrappedKeyPayload> {
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const clientPublicKey = await importP256PublicKey(clientPublicKeyBase64);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    serverKeyPair.privateKey,
    256,
  );

  const transportKey = await deriveTransportKey(sharedBits);
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    transportKey,
    aesKey,
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.exportKey("raw", transportKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const macBuffer = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    concatUint8(iv, ciphertext),
  );
  const mac = new Uint8Array(macBuffer);

  const serverPublicKeySpki = new Uint8Array(
    await crypto.subtle.exportKey("spki", serverKeyPair.publicKey),
  );

  return {
    serverPublicKey: btoa(String.fromCharCode(...serverPublicKeySpki)),
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
    mac: btoa(String.fromCharCode(...mac)),
  };
}

function concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function authenticateUserTicket(
  steamWebApiKey: string,
  steamAppId: number,
  ticketHex: string,
  identity?: string,
  mockSteam = false,
): Promise<{ ok: true; steamId: string } | { ok: false; reason: string }> {
  if (mockSteam) {
    return { ok: true, steamId: "76561198000000000" };
  }

  const url = new URL(
    "https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/",
  );
  url.searchParams.set("key", steamWebApiKey);
  url.searchParams.set("appid", String(steamAppId));
  url.searchParams.set("ticket", ticketHex);
  if (identity) url.searchParams.set("identity", identity);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    return { ok: false, reason: `Valve HTTP ${response.status}` };
  }

  const data = await response.json();
  const params = data?.response?.params;
  const result = params?.result;
  const steamId = params?.ownersteamid as string | undefined;

  if (String(result) !== "1" && result !== "OK") {
    return { ok: false, reason: `Ticket ungültig: result=${result}` };
  }
  if (!steamId) {
    return { ok: false, reason: "Keine ownersteamid erhalten." };
  }

  return { ok: true, steamId };
}

async function checkDlcOwnership(
  steamWebApiKey: string,
  steamId: string,
  dlcAppId: number,
  mockSteam = false,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (mockSteam) {
    return { ok: true };
  }

  const url = new URL(
    "https://api.steampowered.com/ISteamUser/CheckAppOwnership/v2/",
  );
  url.searchParams.set("key", steamWebApiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("appid", String(dlcAppId));

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    return { ok: false, reason: `Valve Ownership HTTP ${response.status}` };
  }

  const data = await response.json();
  const owns = data?.appownership?.ownsapp;

  if (owns !== true && owns !== 1 && String(owns) !== "true") {
    return { ok: false, reason: "Spieler besitzt DLC nicht." };
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const steamWebApiKey = Deno.env.get("STEAM_WEB_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const mockSteam = Deno.env.get("MOCK_STEAM") === "true";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: "Server configuration error" },
        500,
      );
    }

    // Validate request size (prevent DoS)
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 262144) {
      return jsonResponse(
        { success: false, error: "Request too large" },
        413,
      );
    }

    const body = (await req.json()) as VerifyRequestBody;
    const { steamAppId, dlcId, ticketHex, identity, clientPublicKey } = body;

    // Input validation
    if (!steamAppId || !dlcId || !ticketHex || !clientPublicKey) {
      return jsonResponse(
        {
          success: false,
          error: "Missing required fields",
        },
        400,
      );
    }

    // Validate Steam App ID range
    if (steamAppId < 1 || steamAppId > 4294967295) {
      return jsonResponse(
        { success: false, error: "Invalid Steam App ID" },
        400,
      );
    }

    // Validate DLC ID range
    if (dlcId < 1 || dlcId > 4294967295) {
      return jsonResponse(
        { success: false, error: "Invalid DLC ID" },
        400,
      );
    }

    // Validate ticket hex format
    try {
      hexToBytes(ticketHex);
    } catch (error) {
      return jsonResponse(
        { success: false, error: "Invalid ticket format" },
        400,
      );
    }

    const auth = await authenticateUserTicket(
      steamWebApiKey || "",
      steamAppId,
      ticketHex,
      identity,
      mockSteam,
    );
    if (!auth.ok) {
      return jsonResponse({ success: false, error: auth.reason }, 403);
    }

    const ownership = await checkDlcOwnership(
      steamWebApiKey || "",
      auth.steamId,
      dlcId,
      mockSteam,
    );
    if (!ownership.ok) {
      return jsonResponse({ success: false, error: ownership.reason }, 403);
    }

    // Validate client public key length (P-256 SPKI is 91 bytes)
    if (clientPublicKey.length < 50 || clientPublicKey.length > 200) {
      return jsonResponse(
        { success: false, error: "Invalid public key format" },
        400,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id")
      .eq("steam_app_id", steamAppId)
      .maybeSingle();

    if (gameError || !game) {
      return jsonResponse(
        { success: false, error: "Spiel nicht registriert." },
        404,
      );
    }

    const { data: dlc, error: dlcError } = await supabase
      .from("dlcs")
      .select("aes_encryption_key")
      .eq("game_id", game.id)
      .eq("steam_dlc_id", dlcId)
      .maybeSingle();

    if (dlcError || !dlc?.aes_encryption_key) {
      return jsonResponse(
        { success: false, error: "DLC-Schlüssel nicht gefunden." },
        404,
      );
    }

    const aesKeyBase64 = dlc.aes_encryption_key as string;
    const aesKey = Uint8Array.from(atob(aesKeyBase64), (c) => c.charCodeAt(0));

    if (aesKey.length !== 32) {
      return jsonResponse(
        { success: false, error: "Ungültiger AES-Schlüssel in DB." },
        500,
      );
    }

    const wrappedKey = await wrapAesKey(aesKey, clientPublicKey);

    return jsonResponse({
      success: true,
      steamId: auth.steamId,
      wrappedKey,
    });
  } catch (error) {
    console.error("[verify-dlc]", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Interner Fehler",
      },
      500,
    );
  }
});
