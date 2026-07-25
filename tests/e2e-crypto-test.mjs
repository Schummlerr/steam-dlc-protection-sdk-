#!/usr/bin/env node
/**
 * End-to-end crypto + API test for the DLC Protection SDK.
 * Tests ECDH key wrapping and bundle encryption/decryption roundtrip
 * against the local test server (MOCK_STEAM=true).
 *
 * Usage:
 *   cd local-test-server && npm install && npm start   (terminal 1)
 *   node tests/e2e-crypto-test.mjs                     (terminal 2)
 */

import crypto from "crypto";
import assert from "assert";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";

const TRANSPORT_SALT = Buffer.from("dlc-protection-sdk-v1-transport", "utf8");

function deriveTransportKey(sharedSecret) {
  return crypto.createHmac("sha256", TRANSPORT_SALT).update(sharedSecret).digest();
}

function wrapAesKey(aesKey, clientPublicKeySpki) {
  const serverEcdh = crypto.createECDH("prime256v1");
  serverEcdh.generateKeys();
  const sharedSecret = serverEcdh.computeSecret(clientPublicKeySpki);
  const transportKey = deriveTransportKey(sharedSecret);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", transportKey, iv);
  const ciphertext = Buffer.concat([cipher.update(aesKey), cipher.final()]);
  const mac = crypto
    .createHmac("sha256", transportKey)
    .update(Buffer.concat([iv, ciphertext]))
    .digest();

  return {
    serverPublicKey: serverEcdh.getPublicKey("spki"),
    iv,
    ciphertext,
    mac,
    transportKey,
  };
}

function unwrapAesKey(clientEcdh, wrapped) {
  const serverPublicKey = wrapped.serverPublicKey;
  const sharedSecret = clientEcdh.computeSecret(serverPublicKey);
  const transportKey = deriveTransportKey(sharedSecret);

  const expectedMac = crypto
    .createHmac("sha256", transportKey)
    .update(Buffer.concat([wrapped.iv, wrapped.ciphertext]))
    .digest();

  assert.ok(crypto.timingSafeEqual(expectedMac, wrapped.mac), "HMAC mismatch on unwrap");

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

  const expectedMac = crypto
    .createHmac("sha256", aesKey)
    .update(Buffer.concat([iv, ciphertext]))
    .digest();
  assert.ok(crypto.timingSafeEqual(expectedMac, mac), "Bundle HMAC mismatch");

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function unwrapAesKeyAsync(clientKeyPair, wrapped) {
  // Server now returns SPKI format directly — import it as-is
  const serverPublicKey = await crypto.subtle.importKey(
    "spki",
    wrapped.serverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: serverPublicKey },
    clientKeyPair.privateKey,
    256
  );

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    Buffer.from("dlc-protection-sdk-v1-transport", "utf8"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const transportKeyDigest = await crypto.subtle.sign("HMAC", hmacKey, sharedBits);
  const transportKey = await crypto.subtle.importKey(
    "raw",
    transportKeyDigest,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );

  // Use the derived transport key as the HMAC key (not the salt!)
  const transportHmacKey = await crypto.subtle.importKey(
    "raw",
    transportKeyDigest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedMac = await crypto.subtle.sign(
    "HMAC",
    transportHmacKey,
    Buffer.concat([wrapped.iv, wrapped.ciphertext])
  );
  assert.ok(
    crypto.timingSafeEqual(wrapped.mac, Buffer.from(expectedMac)),
    "HMAC mismatch on unwrap"
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: wrapped.iv },
    transportKey,
    wrapped.ciphertext
  );
  return Buffer.from(plaintext);
}

async function testLocalServer() {
  const clientKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const clientPublicKeySpki = await crypto.subtle.exportKey("spki", clientKeyPair.publicKey);
  const clientPublicKeySpkiBase64 = Buffer.from(clientPublicKeySpki).toString("base64");

  const fakeTicketHex = crypto.randomBytes(64).toString("hex");

  const response = await fetch(`${SERVER_URL}/verify-dlc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      steamAppId: 480,
      dlcId: 123456,
      ticketHex: fakeTicketHex,
      identity: "dlc-protection-sdk-v1",
      clientPublicKey: clientPublicKeySpkiBase64,
    }),
  });

  assert.strictEqual(response.status, 200, `Expected 200, got ${response.status}`);
  const body = await response.json();
  assert.strictEqual(body.success, true, JSON.stringify(body));
  assert.ok(body.wrappedKey, "Missing wrappedKey in response");

  const wrapped = {
    serverPublicKey: Buffer.from(body.wrappedKey.serverPublicKey, "base64"),
    iv: Buffer.from(body.wrappedKey.iv, "base64"),
    ciphertext: Buffer.from(body.wrappedKey.ciphertext, "base64"),
    mac: Buffer.from(body.wrappedKey.mac, "base64"),
  };

  // Verify server returns SPKI format (91 bytes), not raw EC point (65 bytes)
  assert.strictEqual(
    wrapped.serverPublicKey.length,
    91,
    `Server public key must be SPKI (91 bytes), got ${wrapped.serverPublicKey.length}`
  );

  const aesKey = await unwrapAesKeyAsync(clientKeyPair, wrapped);
  assert.strictEqual(aesKey.length, 32, "AES key must be 32 bytes");

  const originalPayload = Buffer.from("UnityAssetBundle-Mock-Content-v1");
  const encrypted = encryptBundle(originalPayload, aesKey);
  const decrypted = decryptBundle(encrypted, aesKey);

  assert.ok(originalPayload.equals(decrypted), "Bundle roundtrip failed");
  console.log("PASS: Local server verify-dlc + ECDH unwrap + bundle roundtrip");
}

async function testHealth() {
  const response = await fetch(`${SERVER_URL}/health`);
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.strictEqual(body.ok, true);
  console.log(`PASS: Health check (mock=${body.mock})`);
}

async function main() {
  console.log(`Testing against ${SERVER_URL}\n`);

  await testHealth();
  await testLocalServer();

  console.log("\nAll E2E crypto tests passed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  if (err.cause) console.error(err.cause);
  console.error("\nEnsure local test server is running: cd local-test-server && npm start");
  process.exit(1);
});
