#!/usr/bin/env node
/**
 * Encrypts a DLC AssetBundle file using AES-256-CBC + HMAC-SHA256.
 * Output format: iv(16) + hmac(32) + ciphertext — matches Unity client DecryptDlcAssetBundle().
 *
 * Usage:
 *   node encrypt-dlc-bundle.mjs input.bundle output.enc [--key-base64 BASE64]
 *   node encrypt-dlc-bundle.mjs input.bundle output.enc --generate-key
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const TRANSPORT_LABEL = "dlc-protection-sdk-v1-transport";

function parseArgs(argv) {
  const args = { input: null, output: null, keyBase64: null, generateKey: false };

  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--generate-key") {
      args.generateKey = true;
    } else if (arg === "--key-base64") {
      args.keyBase64 = argv[++i];
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error(
      "Usage: node encrypt-dlc-bundle.mjs <input> <output> [--key-base64 BASE64 | --generate-key]",
    );
    process.exit(1);
  }

  args.input = positional[0];
  args.output = positional[1];
  return args;
}

function encryptBundle(plaintext, aesKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const mac = crypto.createHmac("sha256", aesKey).update(Buffer.concat([iv, ciphertext])).digest();
  return Buffer.concat([iv, mac, ciphertext]);
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.input)) {
    console.error(`Input file not found: ${args.input}`);
    process.exit(1);
  }

  let aesKey;
  if (args.generateKey) {
    aesKey = crypto.randomBytes(32);
    console.log("Generated AES-256 key (base64, store in Supabase dlcs table):");
    console.log(aesKey.toString("base64"));
  } else if (args.keyBase64) {
    aesKey = Buffer.from(args.keyBase64, "base64");
    if (aesKey.length !== 32) {
      console.error("AES key must be exactly 32 bytes when base64-decoded.");
      process.exit(1);
    }
  } else {
    aesKey = Buffer.alloc(32, 0);
    console.warn("No key provided — using 32 zero bytes (test key only).");
  }

  const plaintext = fs.readFileSync(args.input);
  const encrypted = encryptBundle(plaintext, aesKey);

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, encrypted);

  console.log(`Encrypted ${plaintext.length} bytes -> ${encrypted.length} bytes`);
  console.log(`Output: ${path.resolve(args.output)}`);
  console.log(`SQL update example:`);
  console.log(
    `  UPDATE dlcs SET aes_encryption_key = '${aesKey.toString("base64")}' WHERE steam_dlc_id = YOUR_DLC_ID;`,
  );
}

main();
