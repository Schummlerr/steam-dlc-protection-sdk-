/**
 * Steam DLC Protection SDK — Admin CLI (v2 SaaS)
 *
 * Commands:
 *   health          Check server health
 *   test-verify     Run a full verify-dlc roundtrip
 *   test-offline    Test offline token flow
 *   generate-key    Generate a new AES-256 key
 *   encrypt         Encrypt a DLC AssetBundle
 *   admin games     List registered games
 *   admin register  Register a new game (dev only)
 *
 * Usage:
 *   node tools/dlc-admin.mjs <command> [options]
 *   node tools/dlc-admin.mjs admin games --url http://localhost:3000 --api-key <key>
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSPORT_SALT = "dlc-protection-sdk-v1-transport";

// ── Helpers ──────────────────────────────────────────────────────────────

function rawPointToSpki(rawPoint) {
  const header = Buffer.from(
    "3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"
  );
  return Buffer.concat([header, rawPoint]);
}

function deriveTransportKey(sharedSecret) {
  return crypto.createHmac("sha256", Buffer.from(TRANSPORT_SALT))
    .update(sharedSecret).digest();
}

function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function red(s)    { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s)   { return `\x1b[36m${s}\x1b[0m`; }
function bold(s)   { return `\x1b[1m${s}\x1b[0m`; }

function apiUrl(base, path) { return `${base.replace(/\/+$/, "")}${path}`; }

async function apiPost(base, endpoint, body, apiKey) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const res = await fetch(apiUrl(base, endpoint), { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

async function apiGet(base, endpoint, apiKey) {
  const headers = {};
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const res = await fetch(apiUrl(base, endpoint), { headers });
  return { status: res.status, data: await res.json() };
}

// ── Commands ─────────────────────────────────────────────────────────────

function cmdGenerateKey() {
  const key = crypto.randomBytes(32);
  const b64 = key.toString("base64");
  console.log(`\n${green("✓")} AES-256 key generated:\n`);
  console.log(`  ${bold(b64)}\n`);
  console.log(`  Update your DLC in the database:\n`);
  console.log(`  ${yellow(`UPDATE dlcs SET aes_encryption_key = '${b64}' WHERE steam_dlc_id = YOUR_DLC_ID;`)}\n`);
}

function cmdEncrypt(inputPath, outputPath, { keyBase64, generateKey }) {
  if (!fs.existsSync(inputPath)) {
    console.error(`${red("✗")} Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let aesKey;
  if (generateKey) {
    aesKey = crypto.randomBytes(32);
    console.log(`${cyan("ℹ")} Generated key: ${bold(aesKey.toString("base64"))}`);
  } else if (keyBase64) {
    aesKey = Buffer.from(keyBase64, "base64");
    if (aesKey.length !== 32) {
      console.error(`${red("✗")} Key must be 32 bytes (got ${aesKey.length})`);
      process.exit(1);
    }
  } else {
    aesKey = crypto.randomBytes(32);
    console.log(`${yellow("⚠")} No key provided — random key generated:\n  ${bold(aesKey.toString("base64"))}`);
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  const plaintext = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const mac = crypto.createHmac("sha256", aesKey)
    .update(Buffer.concat([iv, ciphertext])).digest();
  const encrypted = Buffer.concat([iv, mac, ciphertext]);

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, encrypted);

  console.log(`${green("✓")} Encrypted ${plaintext.length} B → ${encrypted.length} B`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Key (for Supabase): ${aesKey.toString("base64")}`);
}

async function cmdHealth(url, apiKey) {
  const { status, data } = await apiGet(url, "/health", apiKey);
  if (status === 200 && data.ok) {
    console.log(`${green("✓")} Server ${bold(url)} is healthy`);
    console.log(`  Mock Steam: ${data.mock ? green("enabled") : red("disabled")}`);
    console.log(`  API Key Auth: ${data.apiKeyAuth ? green("enabled") : yellow("disabled (mock)")}`);
    console.log(`  Offline Tokens: ${data.offlineTokens ? green("available") : red("unavailable")}`);
    console.log(`  Version: ${data.version || "unknown"}`);
    console.log(`  Uptime: ${Math.floor(data.uptime || 0)}s`);
  } else {
    console.error(`${red("✗")} Server unhealthy: ${JSON.stringify(data)}`);
  }
}

async function cmdTestVerify(url, apiKey) {
  console.log(`\n${cyan("⟳")} Full verify-dlc roundtrip against ${url}...\n`);

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const spkiBase64 = rawPointToSpki(ecdh.getPublicKey()).toString("base64");
  const ticketHex = crypto.randomBytes(64).toString("hex");

  console.log(`  Step 1: Generated client ECDH key pair ${green("✓")}`);

  const { status, data } = await apiPost(url, "/verify-dlc", {
    steamAppId: 480, dlcId: 123456, ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: spkiBase64,
    requestOfflineToken: true,
  }, apiKey);

  if (status !== 200) {
    console.log(`  Step 2: Request failed (${status}) ${red("✗")}`);
    console.log(`  Error: ${data?.error || JSON.stringify(data)}`);
    process.exit(1);
  }

  console.log(`  Step 2: Server accepted request ${green("✓")}`);
  console.log(`  Steam ID: ${data.steamId}`);

  if (data.offlineToken) {
    console.log(`  Step 3: Offline token received ${green("✓")}`);
    console.log(`    TTL: ${data.offlineTokenExpiresInHours}h`);
    console.log(`    Token: ${data.offlineToken.substring(0, 32)}...`);
  }

  // Unwrap AES key
  const wrapped = data.wrappedKey;
  const serverSpki = Buffer.from(wrapped.serverPublicKey, "base64");
  const serverRaw = serverSpki.subarray(26);
  const sharedSecret = ecdh.computeSecret(serverRaw);
  const transportKey = deriveTransportKey(sharedSecret);

  const expectedMac = crypto.createHmac("sha256", transportKey)
    .update(Buffer.concat([
      Buffer.from(wrapped.iv, "base64"),
      Buffer.from(wrapped.ciphertext, "base64"),
    ])).digest();

  if (!crypto.timingSafeEqual(expectedMac, Buffer.from(wrapped.mac, "base64"))) {
    console.log(`  Step 4: HMAC verification FAILED ${red("✗")}`);
    process.exit(1);
  }
  console.log(`  Step 4: HMAC verified (timing-safe) ${green("✓")}`);

  const decipher = crypto.createDecipheriv("aes-256-cbc", transportKey, Buffer.from(wrapped.iv, "base64"));
  const aesKey = Buffer.concat([
    decipher.update(Buffer.from(wrapped.ciphertext, "base64")),
    decipher.final(),
  ]);
  console.log(`  Step 5: AES key unwrapped (${aesKey.length} bytes) ${green("✓")}`);

  console.log(`\n${green("✓")} Full roundtrip successful!`);
}

async function cmdTestOffline(url, apiKey) {
  console.log(`\n${cyan("⟳")} Offline token flow test against ${url}...\n`);

  // Step 1: Get an offline token
  const ecdh1 = crypto.createECDH("prime256v1");
  ecdh1.generateKeys();
  const spki1 = rawPointToSpki(ecdh1.getPublicKey()).toString("base64");

  const { data: verifyData } = await apiPost(url, "/verify-dlc", {
    steamAppId: 480, dlcId: 123456,
    ticketHex: crypto.randomBytes(64).toString("hex"),
    clientPublicKey: spki1,
    requestOfflineToken: true,
  }, apiKey);

  if (!verifyData.offlineToken) {
    console.log(`  Step 1: No offline token returned ${red("✗")}`);
    process.exit(1);
  }
  console.log(`  Step 1: Got offline token (TTL: ${verifyData.offlineTokenExpiresInHours}h) ${green("✓")}`);

  // Step 2: Simulate offline — use cached token with NEW key pair
  const ecdh2 = crypto.createECDH("prime256v1");
  ecdh2.generateKeys();
  const spki2 = rawPointToSpki(ecdh2.getPublicKey()).toString("base64");

  const { status: offStatus, data: offData } = await apiPost(url, "/verify-offline-token", {
    token: verifyData.offlineToken,
    clientPublicKey: spki2,
    dlcId: 123456,
  }, apiKey);

  if (offStatus !== 200) {
    console.log(`  Step 2: Offline verification failed (${offStatus}) ${red("✗")}`);
    console.log(`  Error: ${offData?.error || JSON.stringify(offData)}`);
    process.exit(1);
  }
  console.log(`  Step 2: Offline token verified with new key pair ${green("✓")}`);

  // Unwrap key from offline response
  const wrapped = offData.wrappedKey;
  const serverSpki = Buffer.from(wrapped.serverPublicKey, "base64");
  const serverRaw = serverSpki.subarray(26);
  const sharedSecret = ecdh2.computeSecret(serverRaw);
  const transportKey = deriveTransportKey(sharedSecret);
  const expectedMac = crypto.createHmac("sha256", transportKey)
    .update(Buffer.concat([Buffer.from(wrapped.iv, "base64"), Buffer.from(wrapped.ciphertext, "base64")]))
    .digest();
  if (!crypto.timingSafeEqual(expectedMac, Buffer.from(wrapped.mac, "base64"))) {
    console.log(`  Step 3: HMAC verification FAILED ${red("✗")}`);
    process.exit(1);
  }
  const decipher = crypto.createDecipheriv("aes-256-cbc", transportKey, Buffer.from(wrapped.iv, "base64"));
  const aesKey = Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, "base64")), decipher.final()]);
  console.log(`  Step 3: AES key unwrapped from offline flow (${aesKey.length} bytes) ${green("✓")}`);

  console.log(`\n${green("✓")} Offline token flow works correctly!`);
}

async function cmdAdminGames(url, apiKey) {
  const { data } = await apiGet(url, "/admin/games", apiKey);
  if (!data?.games || data.games.length === 0) {
    console.log(`${yellow("ℹ")} No games registered.`);
    return;
  }
  console.log(`\n${bold("Registered Games:")}\n`);
  for (const g of data.games) {
    console.log(`  ${green("▶")} ${g.name} (Steam App ${g.steamAppId})`);
    console.log(`     ID: ${g.id}`);
    console.log(`     DLCs: ${g.dlcCount}`);
    console.log(`     Offline TTL: ${g.offlineTokenHours}h`);
    console.log();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);
const urlIdx = args.findIndex(a => a === "--url");
const serverUrl = urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:3000";
const keyIdx = args.findIndex(a => a === "--api-key" || a === "--key");
const apiKey = keyIdx >= 0 ? args[keyIdx + 1] : process.env.DLC_ADMIN_API_KEY || "sk_test_dlc_protection_demo_key_2026";
const keyBase64Idx = args.findIndex(a => a === "--key-base64");
const keyBase64 = keyBase64Idx >= 0 ? args[keyBase64Idx + 1] : null;
const generateKeyFlag = args.includes("--generate-key");

function printHelp() {
  console.log(`\n${bold("Steam DLC Protection SDK — Admin CLI v2 (SaaS)")}\n`);
  console.log(`Usage: node tools/dlc-admin.mjs ${cyan("<command>")} [options]\n`);
  console.log(`Commands:`);
  console.log(`  ${cyan("generate-key")}                    Generate a new AES-256 key`);
  console.log(`  ${cyan("encrypt")} <input> <output>          Encrypt a DLC bundle`);
  console.log(`  ${cyan("health")} [--url <url>]              Check server health`);
  console.log(`  ${cyan("test-verify")} [--url <url>]         Run verify-dlc roundtrip`);
  console.log(`  ${cyan("test-offline")} [--url <url>]        Test offline token flow`);
  console.log(`  ${cyan("admin games")} [--url <url>]         List registered games`);
  console.log(`  ${cyan("help")}                              Show this help\n`);
  console.log(`Options:`);
  console.log(`  --url <url>           Server URL`);
  console.log(`  --api-key <key>       API key (or DLC_ADMIN_API_KEY env)`);
  console.log(`  --key-base64 <key>    AES key for encrypt`);
  console.log(`  --generate-key        Generate a random key for encrypt\n`);
}

switch (cmd) {
  case "generate-key":   cmdGenerateKey(); break;
  case "encrypt":        cmdEncrypt(args[0], args[1], { keyBase64, generateKey: generateKeyFlag }); break;
  case "health":         await cmdHealth(serverUrl, apiKey); break;
  case "test-verify":    await cmdTestVerify(serverUrl, apiKey); break;
  case "test-offline":   await cmdTestOffline(serverUrl, apiKey); break;
  case "admin":
    if (args[0] === "games") await cmdAdminGames(serverUrl, apiKey);
    else printHelp();
    break;
  case "help":
  default:               printHelp(); break;
}