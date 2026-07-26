<!-- DLCPROTECT_BADGES -->
<div align="center">
  <a href="https://schummlerr.github.io/steam-dlc-protection-sdk-/"><img src="https://img.shields.io/badge/Landing%20Page-DLC%20Protect-blueviolet?style=for-the-badge"></a>
  <a href="API.md"><img src="https://img.shields.io/badge/API-Docs-blue?style=for-the-badge"></a>
  <a href="https://github.com/Schummlerr/steam-dlc-protection-sdk-/releases"><img src="https://img.shields.io/github/v/release/Schummlerr/steam-dlc-protection-sdk-?style=for-the-badge"></a>
  <img src="https://img.shields.io/badge/tests-31%2F31-green?style=for-the-badge">
  <img src="https://img.shields.io/badge/license-MIT-orange?style=for-the-badge">
</div>

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

## Table of Contents

- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Quick Start (Local)](#quick-start-local)
- [Docker (Full Stack)](#docker-full-stack)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Crypto Protocol](#crypto-protocol)
- [Security Features](#security-features)
- [Project Structure](#project-structure)
- [Tools](#tools)
- [License](#license)

---

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | Supabase Edge Functions (Deno) | DLC verification + key delivery |
| **Local Server** | Express.js / Node.js | Development & mock testing |
| **Client SDK** | Unity 2022+ / C# | Game-side integration |
| **Database** | PostgreSQL (Supabase) | DLC keys + metadata |
| **Crypto** | P-256 ECDH, AES-256-CBC, HMAC-SHA256 | End-to-end encryption |

## How It Works

1. **Player launches game** → Client generates ephemeral P-256 ECDH key pair
2. **Client requests Steam ticket** → `GetAuthTicketForWebApi()` callback
3. **Client sends to server**: `{ steamAppId, dlcId, ticketHex, clientPublicKey }`
4. **Server validates ticket** → Checks via Valve's `AuthenticateUserTicket` API
5. **Server checks ownership** → Verifies DLC ownership via `CheckAppOwnership`
6. **Server wraps the DLC AES key** → Uses ECDH key agreement + AES-256-CBC + HMAC
7. **Client unwraps** → Derives shared secret, verifies HMAC, decrypts AES key
8. **Client decrypts** → Loads and decrypts the DLC AssetBundle

**Total time:** ~400-1000ms per verification.

## Quick Start (Local)

### Prerequisites

- Node.js 22+
- npm

### Setup & Run

```bash
# 1. Clone and install
cd local-test-server
cp .env.example .env
npm install

# 2. Start the test server (mock mode by default)
npm start

# 3. In another terminal — run tests
node tests/e2e-crypto-test.mjs
node tests/comprehensive-api-test.mjs

# 4. Use the Admin CLI
node tools/dlc-admin.mjs health
node tools/dlc-admin.mjs test-verify
node tools/dlc-admin.mjs generate-key
```

### Environment Variables (local-test-server/.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MOCK_STEAM` | `true` | Bypass real Steam API (set to `false` for production testing) |
| `STEAM_WEB_API_KEY` | — | Your Steam Publisher Web API key |
| `DLC_AES_KEY_BASE64` | — | Fixed AES-256 key (random per request if empty) |
| `DISABLE_RATE_LIMIT` | `false` | Disable rate limiting (handy for CI / test suites) |

## Docker (Full Stack)

Simulate a production environment with PostgreSQL:

```bash
# Start everything (server + PostgreSQL + Adminer DB GUI)
docker compose up -d

# Check health
curl http://localhost:3000/health

# Adminer DB GUI at http://localhost:8080
#   System: PostgreSQL
#   Server: postgres
#   Username: dlc_admin
#   Password: dlc_dev_password_change_me
#   Database: dlc_protection

# Run tests against Docker server
node tests/e2e-crypto-test.mjs

# Stop everything
docker compose down
```

The Docker setup automatically runs all SQL migrations on first start, so your database is ready to go.

## Testing

| Test Suite | Tests | What It Covers | Run Command |
|-----------|-------|----------------|-------------|
| **E2E Crypto** | 2 | Full ECDH + AES roundtrip, health check | `npm run test:e2e` |
| **Comprehensive** | 27 | 12 suites: validation, crypto, security, rate limiting, tools | `npm run test:all` |
| **All Tests** | 29 | Both suites sequentially | `npm test` |
| **CI Mode** | 27 | Comprehensive suite with rate limiting disabled | `npm run test:ci` |
| **Production Sim** | ∞ | Full end-to-end simulation (see below) | `bash scripts/test-production.sh` |

### Production Simulation

The `scripts/test-production.sh` script runs the **entire production flow**:

1. ✅ Environment validation
2. ✅ Dependency installation
3. ✅ Server start (via `start.mjs` wrapper)
4. ✅ E2E crypto tests
5. ✅ Comprehensive test suite (27 tests)
6. ✅ Tool smoke tests (key gen, bundle encryption, format verification)
7. ✅ Admin CLI roundtrip test
8. ✅ Docker build & smoke test (if Docker available)

```bash
bash scripts/test-production.sh
```

All tests must pass for a green exit code. This is what CI runs.

## Production Deployment

### Supabase (Serverless)

```bash
# Prerequisites
npm install -g supabase
supabase login

# 1. Link your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# 2. Push database migrations
supabase db push

# 3. Set secrets
supabase secrets set STEAM_WEB_API_KEY=your_key
supabase secrets set MOCK_STEAM=false

# 4. Deploy Edge Function
supabase functions deploy verify-dlc --no-verify-jwt

# Or use the automated script
bash scripts/deploy-supabase.sh YOUR_PROJECT_REF YOUR_STEAM_WEB_API_KEY
# Windows:
# .\scripts\deploy-supabase.ps1 -ProjectRef YOUR_PROJECT_REF -SteamWebApiKey YOUR_KEY
```

**Production Endpoint:** `https://<project>.supabase.co/functions/v1/verify-dlc`

### Unity Client Configuration

In the Unity Editor, set the following fields on your `SteamDLCProtectionClient` component:

| Field | Value |
|-------|-------|
| `Verify Endpoint URL` | Your production endpoint (or `http://localhost:3000/verify-dlc` for dev) |
| `Steam App ID` | Your game's Steam App ID |
| `Target DLC ID` | The Steam DLC App ID |

## Crypto Protocol

### Key Exchange

```
Client                              Server
  │                                    │
  ├─ Generate P-256 ECDH key pair ─────┤
  │                                    │
  ├─ GetAuthTicketForWebApi() ─────────┤
  │                                    │
  ├─ POST /verify-dlc ─────────────────┤
  │  { ticket, clientPublicKey }       │
  │                                    ├─ Validate ticket (Steam API)
  │                                    ├─ Check ownership (Steam API)
  │                                    ├─ Generate P-256 ECDH key pair
  │                                    ├─ Derive shared secret (ECDH)
  │                                    ├─ Derive transport key (HMAC-SHA256)
  │                                    ├─ Encrypt DLC AES key (AES-256-CBC)
  │                                    ├─ Sign with HMAC-SHA256
  │◀─── { serverPublicKey, iv,         │
  │        ciphertext, mac }           │
  │                                    │
  ├─ Compute shared secret (ECDH) ─────┤
  ├─ Verify HMAC (timing-safe) ────────┤
  ├─ Decrypt AES key (AES-256-CBC) ────┤
  │                                    │
  ├─ Decrypt DLC AssetBundle ──────────┤
  │  (iv + HMAC + AES-256-CBC)        │
```

### Bundle Encryption Format

```
┌──────────┬──────────┬──────────────────────┐
│  IV      │  HMAC    │  Ciphertext          │
│  (16B)   │  (32B)   │  (AES-256-CBC)       │
└──────────┴──────────┴──────────────────────┘
```

## Security Features

| Feature | Status | Notes |
|---------|--------|-------|
| End-to-end encryption (ECDH + AES) | ✅ | P-256 ECDH key agreement, AES-256-CBC |
| Integrity verification (HMAC) | ✅ | HMAC-SHA256 on every encrypted payload |
| Steam authentication | ✅ | Validates via Valve's official API |
| DLC ownership check | ✅ | Verifies via Valve's CheckAppOwnership v2 |
| Forward secrecy | ✅ | Fresh ECDH keys per session |
| Timing-safe comparisons | ✅ | `crypto.timingSafeEqual()` everywhere |
| Row Level Security (database) | ✅ | PostgreSQL RLS + service_role policies |
| Rate limiting (20 req/min per IP) | ✅ | Configurable via `DISABLE_RATE_LIMIT` |
| Input validation | ✅ | Types, ranges, formats — all checked |
| Request size limits (256kb) | ✅ | DoS protection |
| CORS protection | ✅ | Proper OPTIONS handling |

## Project Structure

```
steam-dlc-protection-sdk/
├── .github/workflows/ci.yml       # CI pipeline (29+ tests + Docker)
├── docker-compose.yml              # Full-stack Docker setup
├── .env.example                    # Root environment template
├── LICENSE                         # MIT license
│
├── local-test-server/              # Express.js mock server
│   ├── server.js                   # Full Steam API simulation + crypto
│   ├── start.mjs                   # Non-TTY wrapper (Windows-safe)
│   ├── Dockerfile                  # Docker image for CI/testing
│   ├── .env.example                # Server environment template
│   └── package.json                # Dependencies + scripts
│
├── supabase/
│   ├── config.toml                 # Supabase project config
│   ├── functions/verify-dlc/       # Deno Edge Function (production)
│   │   └── index.ts
│   └── migrations/                 # PostgreSQL schema + RLS
│       ├── 20260723222159_initial_schema.sql
│       └── 20260724180000_add_dlc_metadata.sql
│
├── tests/
│   ├── comprehensive-api-test.mjs  # 27-test validation suite
│   ├── e2e-crypto-test.mjs         # Crypto roundtrip
│   ├── test-security.mjs           # Production endpoint security tests
│   └── fixtures/                   # Test assets
│       ├── dummy-dlc.txt
│       ├── sample-dlc.bundle
│       └── sample-dlc.bundle.enc
│
├── tools/
│   ├── dlc-admin.mjs               # Admin CLI (generate, encrypt, health, test)
│   ├── encrypt-dlc-bundle.mjs      # Encrypt AssetBundles
│   ├── generate-aes-key.mjs        # AES-256 key generation
│   └── encrypt-test-dlc.ps1        # PowerShell helper
│
├── scripts/
│   ├── test-production.sh          # Full production simulation
│   ├── deploy-supabase.sh          # Supabase deployment (macOS/Linux)
│   └── deploy-supabase.ps1         # Supabase deployment (Windows)
│
└── unity-client/                   # Unity C# integration
    └── Assets/
        ├── Scripts/
        │   ├── SteamDLCProtectionClient.cs   # Main SDK client
        │   ├── DlcLoaderExample.cs            # Example implementation
        │   └── Editor/BuildAssetBundles.cs    # Bundle build script
        ├── BuiltAssetBundles/                 # Pre-built test bundles
        ├── dummy-dlc.bytes
        └── real-dlc.bytes
```

## Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `dlc-admin.mjs` | Admin CLI | `node tools/dlc-admin.mjs health` |
| `encrypt-dlc-bundle.mjs` | Encrypt DLC bundles | `node tools/encrypt-dlc-bundle.mjs input output --key-base64 ...` |
| `generate-aes-key.mjs` | Generate AES-256 keys | `node tools/generate-aes-key.mjs` |
| `encrypt-test-dlc.ps1` | PowerShell helper | `.\tools\encrypt-test-dlc.ps1` |

### Admin CLI

```bash
node tools/dlc-admin.mjs <command> [options]

Commands:
  generate-key                  Generate a new AES-256 key
  encrypt <input> <output>      Encrypt a DLC bundle
  health [--url <url>]          Check server health
  test-verify [--url <url>]     Run verify-dlc roundtrip
  help                          Show help
```

## Changelog

### v1.0.0 (2026-07-26)
- ✅ Production-ready crypto protocol (ECDH + AES-256-CBC + HMAC-SHA256)
- ✅ Local test server with full Steam API simulation
- ✅ Supabase Edge Function for production deployment
- ✅ Unity C# client SDK with example implementation
- ✅ 29 automated tests with CI pipeline
- ✅ Docker Compose for full-stack testing
- ✅ Production simulation script
- ✅ Admin CLI tools
- ✅ Database schema with Row Level Security

## License

MIT — see [LICENSE](LICENSE).