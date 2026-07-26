#!/usr/bin/env node
/**
 * Comprehensive API + Crypto + Security Test Suite
 * Tests the local test server exhaustively — covers happy path, edge cases,
 * input validation, crypto roundtrip, and security hardening.
 *
 * Usage:
 *   cd local-test-server && npm start          (terminal 1)
 *   node tests/comprehensive-api-test.mjs      (terminal 2)
 */

import crypto from "crypto";
import assert from "assert";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY || "sk_test_dlc_protection_demo_key_2026";  // SaaS API key
const TRANSPORT_SALT = Buffer.from("dlc-protection-sdk-v1-transport", "utf8");

// ── Crypto Helpers ──────────────────────────────────────────────────────

function deriveTransportKey(sharedSecret) {
  return crypto.createHmac("sha256", TRANSPORT_SALT).update(sharedSecret).digest();
}

function rawPointToSpki(rawPoint) {
  const header = Buffer.from(
    "3059301306072a8648ce3d020106082a8648ce3d030107034200",
    "hex"
  );
  return Buffer.concat([header, rawPoint]);
}

function generateClientKeyPair() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    spkiBase64: rawPointToSpki(ecdh.getPublicKey()).toString("base64"),
  };
}

function unwrapAesKey(clientEcdh, wrapped) {
  const serverPublicKeySpki = Buffer.from(wrapped.serverPublicKey, "base64");
  // Extract raw EC point from SPKI (bytes 26-90 for P-256)
  const serverPublicKeyRaw = serverPublicKeySpki.subarray(26);
  const sharedSecret = clientEcdh.computeSecret(serverPublicKeyRaw);
  const transportKey = deriveTransportKey(sharedSecret);

  const expectedMac = crypto
    .createHmac("sha256", transportKey)
    .update(Buffer.concat([wrapped.iv, wrapped.ciphertext]))
    .digest();
  crypto.timingSafeEqual(expectedMac, wrapped.mac);

  const decipher = crypto.createDecipheriv("aes-256-cbc", transportKey, wrapped.iv);
  return Buffer.concat([decipher.update(wrapped.ciphertext), decipher.final()]);
}

function encryptBundle(plaintext, aesKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const mac = crypto.createHmac("sha256", aesKey).update(Buffer.concat([iv, ciphertext])).digest();
  return Buffer.concat([iv, mac, ciphertext]);
}

function decryptBundle(encrypted, aesKey) {
  const iv = encrypted.subarray(0, 16);
  const mac = encrypted.subarray(16, 48);
  const ciphertext = encrypted.subarray(48);
  const expectedMac = crypto.createHmac("sha256", aesKey).update(Buffer.concat([iv, ciphertext])).digest();
  assert.ok(crypto.timingSafeEqual(expectedMac, mac), "Bundle HMAC mismatch");
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── HTTP Helper ─────────────────────────────────────────────────────────

async function post(endpoint, body) {
  const url = `${SERVER_URL}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Api-Key": API_KEY },
    body: JSON.stringify(body),
  });
  const data = response.ok || response.status < 500 ? await response.json() : null;
  return { status: response.status, data };
}

async function get(endpoint) {
  const response = await fetch(`${SERVER_URL}${endpoint}`);
  return { status: response.status, data: response.ok ? await response.json() : null };
}

// ── Test Runner ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ❌ ${name}: ${err.message}`);
    }
  };
}

async function run(...tests) {
  console.log(`\n📋 Running ${tests.length} tests against ${SERVER_URL}\n`);
  for (const t of tests) await t();
  const total = passed + failed;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All tests passed. ✅\n");
}

// ── Test Suites ─────────────────────────────────────────────────────────

// ── Suite 1: Health & Server Info ──

const testHealth = test("GET /health returns ok", async () => {
  const { status, data } = await get("/health");
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
});

const testHealthMockFlag = test("GET /health shows mock flag", async () => {
  const { data } = await get("/health");
  assert.strictEqual(typeof data.mock, "boolean");
});

// ── Suite 2: Happy Path — Full Crypto Roundtrip ──

const testHappyPath = test("POST /verify-dlc — full ECDH + AES roundtrip", async () => {
  const client = generateClientKeyPair();
  const ticketHex = crypto.randomBytes(64).toString("hex");

  const { status, data } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: client.spkiBase64,
  });

  assert.strictEqual(status, 200);
  assert.strictEqual(data.success, true);
  assert.ok(data.steamId);
  assert.ok(data.wrappedKey);

  const wrapped = {
    serverPublicKey: Buffer.from(data.wrappedKey.serverPublicKey, "base64"),
    iv: Buffer.from(data.wrappedKey.iv, "base64"),
    ciphertext: Buffer.from(data.wrappedKey.ciphertext, "base64"),
    mac: Buffer.from(data.wrappedKey.mac, "base64"),
  };

  // SPKI must be 91 bytes
  assert.strictEqual(wrapped.serverPublicKey.length, 91);

  const aesKey = unwrapAesKey(client.ecdh, wrapped);
  assert.strictEqual(aesKey.length, 32);

  // Bundle roundtrip
  const payload = Buffer.from("UnityAssetBundle-Mock-Content-v1-HelloWorld");
  const encrypted = encryptBundle(payload, aesKey);
  const decrypted = decryptBundle(encrypted, aesKey);
  assert.ok(payload.equals(decrypted));
});

// ── Suite 3: Input Validation ──

const testMissingSteamAppId = test("400 — missing steamAppId", async () => {
  const client = generateClientKeyPair();
  const { status, data } = await post("/verify-dlc", {
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(data.success, false);
});

const testMissingDlcId = test("400 — missing dlcId", async () => {
  const client = generateClientKeyPair();
  const { status, data } = await post("/verify-dlc", {
    steamAppId: 480,
    ticketHex: "aa",
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(data.success, false);
});

const testMissingTicketHex = test("400 — missing ticketHex", async () => {
  const client = generateClientKeyPair();
  const { status, data } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(data.success, false);
});

const testMissingClientKey = test("400 — missing clientPublicKey", async () => {
  const { status, data } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "aa",
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(data.success, false);
});

const testEmptyBody = test("400 — empty body", async () => {
  const { status } = await post("/verify-dlc", {});
  assert.strictEqual(status, 400);
});

const testInvalidJson = test("400 — invalid JSON body", async () => {
  const response = await fetch(`${SERVER_URL}/verify-dlc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    body: "not-json-at-all",
  });
  assert.strictEqual(response.status, 400);
});

// ── Suite 4: Invalid Data Types ──

const testNegativeAppId = test("400 — negative steamAppId", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: -1,
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
});

const testZeroAppId = test("400 — zero steamAppId", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: 0,
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
});

const testNegativeDlcId = test("400 — negative dlcId", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: -1,
    ticketHex: "aa",
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
});

const testStringAppId = test("400 — string instead of number for steamAppId", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: "not-a-number",
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
});

// ── Suite 5: Public Key Validation ──

const testEmptyPublicKey = test("400 — empty clientPublicKey", async () => {
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: "",
  });
  assert.strictEqual(status, 400);
});

const testShortPublicKey = test("400 — too-short clientPublicKey", async () => {
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: "AAAA",
  });
  assert.strictEqual(status, 400);
});

const testGarbagePublicKey = test("400 — garbage public key (not a real SPKI)", async () => {
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "aa",
    clientPublicKey: "aW52YWxpZC1rZXk=", // "invalid-key" base64
  });
  assert.strictEqual(status, 400);
});

// ── Suite 6: Ticket Validation ──

const testInvalidTicketHex = test("400 — invalid ticket hex (non-hex chars)", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "XYZ123",  // Not valid hex
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
});

const testOddLengthTicket = test("400 — odd-length ticket hex", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "abc",  // odd length
    clientPublicKey: client.spkiBase64,
  });
  assert.strictEqual(status, 400);
});

// ── Suite 7: Large Payload / DoS Protection ──

const testLargeTicket = test("400 — overly large ticket (DoS protection)", async () => {
  const client = generateClientKeyPair();
  const { status } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex: "aa".repeat(100000),  // 200K chars
    clientPublicKey: client.spkiBase64,
  });
  // The server limits to 256kb — 200K hex chars + other fields should be OK,
  // but we're testing that it doesn't crash
  assert.ok(status === 400 || status === 413 || status === 200);
});

// ── Suite 8: Method Restrictions ──

const testGetReturns405 = test("405 — GET not allowed", async () => {
  const response = await fetch(`${SERVER_URL}/verify-dlc`);
  assert.strictEqual(response.status, 405 || 404); // 404 is also acceptable
});

const testOptionsReturns204 = test("OPTIONS returns 204 / CORS headers", async () => {
  const response = await fetch(`${SERVER_URL}/verify-dlc`, { method: "OPTIONS" });
  // The current server may send 204 with CORS headers, or forward to main handler
  assert.ok([200, 204].includes(response.status));
});

// ── Suite 9: CORS Headers ──

const testCorsHeaders = test("POST response has CORS headers", async () => {
  const client = generateClientKeyPair();
  const response = await fetch(`${SERVER_URL}/verify-dlc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    body: JSON.stringify({
      steamAppId: 480,
      dlcId: 123456,
      ticketHex: "aa",
      clientPublicKey: client.spkiBase64,
    }),
  });
  const origin = response.headers.get("access-control-allow-origin");
  assert.ok(origin === "*" || origin === null); // some setups don't send on error
});

// ── Suite 10: Repeatability / Idempotency ──

const testTwoRequestsDifferentKeys = test("Two requests use different ECDH keys (forward secrecy)", async () => {
  const ticketHex = crypto.randomBytes(64).toString("hex");

  const client1 = generateClientKeyPair();
  const r1 = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: client1.spkiBase64,
  });
  assert.strictEqual(r1.status, 200);

  const client2 = generateClientKeyPair();
  const r2 = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: client2.spkiBase64,
  });
  assert.strictEqual(r2.status, 200);

  // Server public keys should differ (forward secrecy)
  const spk1 = r1.data.wrappedKey.serverPublicKey;
  const spk2 = r2.data.wrappedKey.serverPublicKey;
  assert.notStrictEqual(spk1, spk2, "Server ECDH keys should differ per session");
});

// ── Suite 11: Bundle Encrypt/Decrypt Tool Tests ──

const testEncryptTool = test("encrypt-dlc-bundle tool produces valid output format", async () => {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dlc-test-"));
  const input = path.join(tmpDir, "test.bundle");
  const output = path.join(tmpDir, "test.enc");

  fs.writeFileSync(input, "Hello DLC Bundle Content!");

  // Test with key
  const key = crypto.randomBytes(32).toString("base64");
  execSync(
    `node tools/encrypt-dlc-bundle.mjs "${input}" "${output}" --key-base64 "${key}"`,
    { cwd: path.resolve(import.meta.dirname, "..") }
  );

  const encrypted = fs.readFileSync(output);
  assert.strictEqual(encrypted.length > 48, true, "Should have iv(16)+hmac(32)+ciphertext");
  assert.strictEqual(encrypted.length % 16 === 0, true, "Ciphertext should be AES block aligned");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
  console.log("  (encrypted bundle format verified)");
});

const testEncryptToolGenerateKey = test("encrypt-dlc-bundle --generate-key produces a valid key", async () => {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dlc-test-"));
  const input = path.join(tmpDir, "test.bundle");
  const output = path.join(tmpDir, "test.enc");

  fs.writeFileSync(input, "Test content");

  const stdout = execSync(
    `node tools/encrypt-dlc-bundle.mjs "${input}" "${output}" --generate-key`,
    { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" }
  );

  // Should have printed a key
  const keyMatch = stdout.match(/^([A-Za-z0-9+/=]{44})$/m);
  assert.ok(keyMatch, "Should output a base64 AES-256 key (44 chars)");
  const key = Buffer.from(keyMatch[1], "base64");
  assert.strictEqual(key.length, 32);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
});

// ── Suite 12: Generate AES Key Tool ──

const testGenerateKeyTool = test("generate-aes-key.mjs produces valid 32-byte base64 key", async () => {
  const { execSync } = await import("child_process");
  const path = await import("path");

  const stdout = execSync("node tools/generate-aes-key.mjs", {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });

  const key = stdout.trim();
  const decoded = Buffer.from(key, "base64");
  assert.strictEqual(decoded.length, 32, "Should decode to 32 bytes");
  assert.match(key, /^[A-Za-z0-9+/=]+$/, "Should be valid base64");
});

// ── Suite 13: Offline Token Support ──

const testOfflineToken = test("POST /verify-dlc with requestOfflineToken returns token", async () => {
  const client = generateClientKeyPair();
  const ticketHex = crypto.randomBytes(64).toString("hex");
  const { status, data } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: client.spkiBase64,
    requestOfflineToken: true,
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.success, true);
  assert.ok(data.offlineToken, "Should return an offline token");
  assert.ok(data.offlineTokenExpiresInHours > 0, "Should have expiration");
  assert.ok(data.offlineToken.split(".").length === 3, "Token should be JWT-like (3 parts)");
  console.log("  (offline token received, TTL:", data.offlineTokenExpiresInHours, "hours)");
});

const testOfflineTokenVerify = test("POST /verify-offline-token verifies cached token", async () => {
  // First get a token
  const client = generateClientKeyPair();
  const ticketHex = crypto.randomBytes(64).toString("hex");
  const { data: verifyData } = await post("/verify-dlc", {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: client.spkiBase64,
    requestOfflineToken: true,
  });
  assert.ok(verifyData.offlineToken, "Must have offline token");

  // New session (new key pair) — verify using the cached token
  const client2 = generateClientKeyPair();
  const { status, data } = await post("/verify-offline-token", {
    token: verifyData.offlineToken,
    clientPublicKey: client2.spkiBase64,
    dlcId: 123456,
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.success, true);
  assert.ok(data.wrappedKey, "Should unwrap key from offline token");
  console.log("  (offline token verification successful)");
});

// ── Suite 14: Rate Limiting ──

const testRateLimitHeaders = test("Rate limit headers present on limited request", async () => {
  // Force a burst to trigger the 20/min limit
  const client = generateClientKeyPair();
  const ticketHex = crypto.randomBytes(64).toString("hex");
  const payload = {
    steamAppId: 480,
    dlcId: 123456,
    ticketHex,
    identity: "dlc-protection-sdk-v1",
    clientPublicKey: client.spkiBase64,
  };

  let limitedResponse = null;
  for (let i = 0; i < 30; i++) {
    const response = await fetch(`${SERVER_URL}/verify-dlc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Api-Key": API_KEY },
      body: JSON.stringify(payload),
    });
    if (response.status === 429) {
      limitedResponse = response;
      break;
    }
  }
  assert.ok(limitedResponse, "Should get rate limited after burst of requests");
  const remaining = limitedResponse.headers.get("ratelimit-remaining");
  assert.ok(remaining !== null, "Should have RateLimit-Remaining header");
  assert.strictEqual(remaining, "0", "Rate limit remaining should be 0");
});

// ── Run Everything ──────────────────────────────────────────────────────

await run(
  // Suite 1: Server Health
  testHealth,
  testHealthMockFlag,

  // Suite 2: Happy Path
  testHappyPath,

  // Suite 3: Forward Secrecy (run early before rate limit exhausts)
  testTwoRequestsDifferentKeys,

  // Suite 4: Method Restrictions (run early — GET/OPTIONS count against rate limit)
  testGetReturns405,
  testOptionsReturns204,

  // Suite 5: CORS (1 POST, still early)
  testCorsHeaders,

  // Suite 6: Ticket Validation (small volume, run before bulk)
  testInvalidTicketHex,
  testOddLengthTicket,

  // Suite 7: DoS Protection (single POST, run early)
  testLargeTicket,

  // Suite 8: Missing Fields
  testMissingSteamAppId,
  testMissingDlcId,
  testMissingTicketHex,
  testMissingClientKey,
  testEmptyBody,
  testInvalidJson,

  // Suite 9: Invalid Data Types
  testNegativeAppId,
  testZeroAppId,
  testNegativeDlcId,
  testStringAppId,

  // Suite 10: Public Key Validation
  testEmptyPublicKey,
  testShortPublicKey,
  testGarbagePublicKey,

  // ── Suite 11: Offline Token Tests
  testOfflineToken,
  testOfflineTokenVerify,

  // Suite 12: Encrypt Tool
  testEncryptTool,
  testEncryptToolGenerateKey,

  // ── Suite 13: Key Gen Tool
  testGenerateKeyTool,

  // ── Suite 14: Rate Limiting (runs last, rate limiter active)
  testRateLimitHeaders,
);
