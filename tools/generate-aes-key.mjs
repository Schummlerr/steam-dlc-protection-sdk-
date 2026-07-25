#!/usr/bin/env node
/**
 * Generates a cryptographically random AES-256 key as base64 for Supabase dlcs table.
 */

import crypto from "crypto";

const key = crypto.randomBytes(32);
console.log(key.toString("base64"));
