# Steam DLC Protection SDK

SDK for protecting Steam DLCs with ECDH + AES-256-GCM end-to-end encryption.  
Includes a local test server, a production Supabase Edge Function, and a Unity client.

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Local Server** | Express.js / Node.js | Development and mock testing |
| **Backend** | Supabase Edge Functions (Deno) | Production DLC verification |
| **Client SDK** | Unity 2022+ / C# | Game-side integration |
| **Database** | PostgreSQL (Supabase) | DLC keys and metadata |
| **Crypto** | P-256 ECDH, AES-256-CBC, HMAC-SHA256 | End-to-end encryption |

## Quick Start

```bash
# Install and start the test server
cd local-test-server
cp .env.example .env
npm install
npm start

# Run tests (separate terminal)
node tests/e2e-crypto-test.mjs
node tests/comprehensive-api-test.mjs
```

## Project Structure

```
steam-dlc-protection-sdk/
├── local-test-server/       # Express.js test server
├── supabase/                # Supabase Edge Function + migrations
├── tests/                   # Test suites (31 tests)
├── tools/                   # CLI tools (admin, encrypt, keygen)
├── unity-client/            # Unity C# SDK
├── scripts/                 # Deployment + test scripts
└── docker-compose.yml       # Full-stack Docker setup
```

## API

### POST /verify-dlc

Verifies a player owns a DLC and returns a wrapped encryption key.

**Request:**
```json
{
  "steamAppId": 480,
  "dlcId": 123456,
  "ticketHex": "abcdef...",
  "identity": "dlc-protection-sdk-v1",
  "clientPublicKey": "base64-spki...",
  "requestOfflineToken": true
}
```

**Response:**
```json
{
  "success": true,
  "steamId": "76561198000000000",
  "wrappedKey": {
    "serverPublicKey": "base64...",
    "iv": "base64...",
    "ciphertext": "base64...",
    "mac": "base64..."
  },
  "offlineToken": "jwt...",
  "offlineTokenExpiresInHours": 24
}
```

### POST /verify-offline-token

Validates a cached offline token and returns a fresh wrapped key.

**Request:**
```json
{
  "token": "jwt...",
  "clientPublicKey": "base64-spki...",
  "dlcId": 123456
}
```

### GET /health

Server health check.

### GET /metrics

Server metrics (uptime, request counts, rate limit status).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MOCK_STEAM` | `true` | Skip real Steam API calls |
| `MOCK_API_KEY` | `true` | Skip API key authentication |
| `DISABLE_RATE_LIMIT` | `false` | Disable rate limiting |
| `JWT_SECRET` | `"dev-jwt-secret..."` | Secret for offline tokens |

## Testing

```bash
npm test                    # E2E + comprehensive (31 tests)
npm run test:ci             # With rate limiting disabled
node tests/developer-simulation.mjs   # Full developer workflow
bash scripts/test-production.sh       # Production simulation
```

Tests cover: crypto roundtrip, input validation, rate limiting, forward secrecy, offline tokens, tool smoke tests, and admin CLI.

## Crypto Protocol

1. Client generates ephemeral P-256 ECDH key pair
2. Client requests Steam auth ticket via `GetAuthTicketForWebApi()`
3. Client sends `{ steamAppId, dlcId, ticketHex, clientPublicKey }` to server
4. Server validates ticket via Steam API, checks DLC ownership
5. Server generates ephemeral ECDH key pair, derives shared secret
6. Server wraps the DLC AES-256 key with the transport key (HMAC-SHA256 + AES-256-CBC)
7. Client unwraps AES key via ECDH agreement, verifies HMAC (timing-safe)
8. Client decrypts the DLC AssetBundle

**Bundle format:** `iv(16) | hmac(32) | ciphertext`

## Deployment

### Supabase

```bash
npx supabase login
npx supabase link --project-ref YOUR_REF
npx supabase db push
npx supabase secrets set STEAM_WEB_API_KEY=your_key
npx supabase secrets set MOCK_STEAM=false
npx supabase functions deploy verify-dlc --no-verify-jwt
```

### Docker

```bash
docker compose up -d
```
Starts the server on port 3000, PostgreSQL on 5432, and Adminer on 8080.

## Offline Support

Players can cache a signed JWT token (default 24h TTL).  
While the token is valid, the DLC works without internet access.

## License

MIT — see [LICENSE](LICENSE).