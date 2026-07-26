---
title: "How to Protect Steam DLCs from Piracy (ECDH + AES Encryption)"
description: "A complete guide to implementing end-to-end encryption for Steam DLCs using ECDH key exchange and AES-256. Open-source SDK included."
tags: [gamedev, unity, security, steam, opensource]
published: false
---

## The Problem

You ship DLC content with your game. Players who didn't pay for it can still access the files on disk. Steam's DRM helps, but determined pirates crack the ownership check.

**The solution:** Ship encrypted DLC bundles. Decrypt them only after verifying ownership via Steam's API.

## How DLC Encryption Works

### The Protocol

```
1. Player launches game
2. Generate ephemeral P-256 ECDH key pair (fresh each session)
3. Request Steam auth ticket via GetAuthTicketForWebApi()
4. Send ticket + public key to verification server
5. Server validates ticket + checks DLC ownership via Valve API
6. Server wraps the DLC's AES-256 key using ECDH shared secret
7. Client unwraps the AES key and decrypts the DLC bundle
8. Full roundtrip: ~400ms
```

### Bundle Format

```
[IV: 16 bytes] + [HMAC-SHA256: 32 bytes] + [AES-256-CBC ciphertext]
```

### Why This Is Secure

- **Forward secrecy:** Every session generates fresh ECDH keys
- **No disk storage:** The AES key exists only in memory
- **Timing-safe comparisons:** HMAC verification uses constant-time comparison
- **Steam integration:** Uses Valve's official authentication API

### Offline Support

Players can authenticate once and receive a 24-hour JWT token. The token is cached locally and allows DLC access without internet. After expiry, a quick online re-authentication refreshes the token.

## Open-Source SDK

I've packaged everything into a ready-to-use SDK:

- **Unity C# client** with full ECDH + AES implementation
- **Supabase Edge Function** (Deno) for production
- **Local Node.js test server** for development
- **31 automated tests** covering crypto, validation, and edge cases
- **Docker Compose** for full-stack testing

[GitHub: Schummlerr/steam-dlc-protection-sdk-](https://github.com/Schummlerr/steam-dlc-protection-sdk-)

## Quick Start (5 Minutes)

```bash
git clone https://github.com/Schummlerr/steam-dlc-protection-sdk-.git
cd local-test-server && npm install && npm start
# In another terminal:
node tests/e2e-crypto-test.mjs
```

For Unity integration, copy `SteamDLCProtectionClient.cs` into your project, configure three fields (endpoint, Steam App ID, DLC ID), and call `RequestDlcAccess()`.

## Production Deployment

The SDK includes a deployment script for Supabase:

```bash
bash scripts/deploy-production.sh YOUR_PROJECT_REF YOUR_STEAM_KEY
```

This pushes database migrations, sets secrets, and deploys the Edge Function.

## License

MIT — free for any use, commercial or otherwise.

---

*Questions? Open an issue on GitHub or check the [landing page](https://schummlerr.github.io/steam-dlc-protection-sdk-/).*