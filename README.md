# Steam DLC Protection SDK

**Production-ready Steam DLC protection system** with end-to-end encryption, Steam authentication, forward secrecy, and secure key delivery.

```
╔══════════════════════════════════════════════════════╗
║  Unity Client          Backend          Steam API   ║
║  ┌──────────┐     ┌──────────────┐    ┌─────────┐  ║
║  │ ECDH     │────▶│  verify-dlc  │───▶│ Auth    │  ║
║  │ Key Pair │     │  Edge Funct. │    │ Ticket  │  ║
║  └──────────┘     └──────┬───────┘    └─────────┘  ║
║  ┌──────────┐            │                ┌────────┐║
║  │ AES-256  │◀───────────┴────────────────│Ownershp│║
║  │ Decrypt  │  Wrapped AES Key (ECDH)     │ Check  │║
║  └──────────┘                              └────────┘║
╚══════════════════════════════════════════════════════╝
```

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | Supabase Edge Functions (Deno) | DLC verification + key delivery |
| **Local Server** | Express.js / Node.js | Development/mock testing |
| **Client SDK** | Unity 2022+ / C# | Game-side integration |
| **Database** | PostgreSQL (Supabase) | DLC keys + metadata |
| **Crypto** | P-256 ECDH, AES-256-CBC, HMAC-SHA256 | End-to-end encryption |

## Security Features

| Feature | Status |
|---------|--------|
| End-to-end encryption (ECDH + AES) | ✅ |
| Integrity verification (HMAC) | ✅ |
| Steam authentication | ✅ |
| Forward secrecy (fresh ECDH keys per session) | ✅ |
| Timing-safe comparisons | ✅ |
| Row Level Security (database) | ✅ |
| Rate limiting (20 req/min per IP) | ✅ |
| Input validation (types, ranges, formats) | ✅ |
| Request size limits (256kb) | ✅ |
| CORS protection | ✅ |

## Quick Start (Local Testing)

```bash
# 1. Install & start test server
cd local-test-server
cp .env.example .env
npm install
npm start

# 2. Run tests (in another terminal)
node tests/e2e-crypto-test.mjs
node tests/comprehensive-api-test.mjs

# 3. Use the admin CLI
node tools/dlc-admin.mjs health
node tools/dlc-admin.mjs test-verify
node tools/dlc-admin.mjs generate-key
```

## Admin CLI Tool

A full-featured CLI for managing DLC keys and testing:

```
Usage: node tools/dlc-admin.mjs <command> [options]

Commands:
  generate-key                  Generate a new AES-256 key
  encrypt <input> <output>      Encrypt a DLC bundle
  health [--url <url>]          Check server health
  test-verify [--url <url>]     Run verify-dlc roundtrip
  help                          Show help

Options:
  --url <url>           Server URL (default: http://localhost:3000)
  --key-base64 <key>    AES key for encrypt (base64)
  --generate-key        Generate a random key for encrypt
```

## Test Suites

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `tests/e2e-crypto-test.mjs` | 2 | Full ECDH + AES roundtrip, health check |
| `tests/comprehensive-api-test.mjs` | 27 | 12 suites: validation, crypto, security, rate limiting, tools |
| `tests/test-security.mjs` | 5 | Security hardening against production endpoint |

Run all tests:
```bash
npm test
# Or individually:
node tests/e2e-crypto-test.mjs
node tests/comprehensive-api-test.mjs
```

## Production Deployment

```bash
# 1. Configure Supabase
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase secrets set STEAM_WEB_API_KEY=your_key
npx supabase secrets set MOCK_STEAM=false

# 2. Deploy Edge Function
npx supabase functions deploy verify-dlc --no-verify-jwt

# 3. Configure Unity Client
# Update verifyEndpointUrl in SteamDLCProtectionClient.cs
```

**Production Endpoint:** `https://<project>.supabase.co/functions/v1/verify-dlc`

## Tools

| Tool | Purpose |
|------|---------|
| `tools/dlc-admin.mjs` | Admin CLI (generate keys, encrypt, test, health) |
| `tools/encrypt-dlc-bundle.mjs` | Encrypt DLC AssetBundles |
| `tools/generate-aes-key.mjs` | Generate AES-256 keys |
| `tools/encrypt-test-dlc.ps1` | PowerShell helper for Unity workflow |

## Project Structure

```
steam-dlc-protection-sdk/
├── .github/workflows/ci.yml     # CI pipeline (27 tests)
├── local-test-server/            # Express.js mock server
│   └── server.js                 # Full Steam API simulation
├── supabase/
│   ├── functions/verify-dlc/     # Deno Edge Function
│   ├── migrations/               # PostgreSQL schema + RLS
│   └── config.toml               # Supabase project config
├── tests/
│   ├── comprehensive-api-test.mjs # 27-test suite
│   ├── e2e-crypto-test.mjs       # Crypto roundtrip
│   └── test-security.mjs         # Security hardening tests
├── tools/
│   ├── dlc-admin.mjs             # Admin CLI
│   ├── encrypt-dlc-bundle.mjs    # Bundle encryption
│   └── generate-aes-key.mjs      # AES key generation
├── unity-client/                 # Unity C# integration
|   └── Assets/Scripts/
│       ├── SteamDLCProtectionClient.cs
│       └── DlcLoaderExample.cs
└── scripts/                      # Deployment helpers
```

## Crypto Protocol

1. **Client** generates ephemeral P-256 ECDH key pair
2. **Client** requests Steam auth ticket via `GetAuthTicketForWebApi()`
3. **Client** sends `{ steamAppId, dlcId, ticketHex, clientPublicKey }` to server
4. **Server** validates Steam ticket via Valve API
5. **Server** checks DLC ownership via Valve API
6. **Server** generates ephemeral P-256 ECDH key pair, derives shared secret
7. **Server** wraps the DLC's AES-256 key with the transport key (HKDF-like)
8. **Client** unwraps AES key via ECDH agreement
9. **Client** decrypts the DLC AssetBundle (iv + HMAC + ciphertext)

**Total time:** ~400-1000ms per verification.