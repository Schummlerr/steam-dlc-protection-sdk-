# Changelog

All notable changes to the Steam DLC Protection SDK are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0-saas] — 2026-07-26

### Added
- **SaaS Multi-tenant Architecture** — Rewrote the backend as a multi-tenant cloud service. Each team/developer gets an isolated tenant with their own API keys, DLC catalog, and usage quotas. No self-hosted server required.
- **API Key Authentication** — Replace the shared-secret HMAC scheme with per-tenant API keys (`dcp_live_` / `dcp_test_`). Keys are managed via the dashboard and scoped to a single Steam App ID.
- **Offline Token System** — Every DLC verification now returns a 24-hour offline token. Players can validate access without network connectivity using local token verification. Enabled by default, no configuration needed.
- **Rate Limiting** — 30 requests/minute per API key with burst capacity. `X-RateLimit-*` headers returned on every response.
- **Web Dashboard** — New SaaS dashboard at [dlcprotect.dev](https://dlcprotect.dev) for managing API keys, viewing usage analytics, configuring DLCs, and monitoring live verification events.
- **Unity Package Manager Support** — The Unity SDK is now distributed via a scoped registry (`https://packages.dlcprotect.dev`). Install directly from the Package Manager window.
- **Health Endpoint** — `GET /health` endpoint with version info, uptime, and timestamp.
- **Usage Quotas & Billing** — Monthly request quotas enforced per plan tier (Starter: 10k, Pro: 100k, Enterprise: custom). Overage billed at per-request rate.
- **Structured Error Responses** — All error responses now include an `error.code` machine-readable identifier alongside a human-readable `error.message`. See API.md for the full error code table.
- **Request ID Tracking** — Every API response includes a `meta.request_id` for debugging and support.

### Changed
- **Authentication Scheme** — Migrated from `Authorization: Bearer <shared-secret>` to `X-Api-Key: dcp_live_*` header. Legacy bearer tokens are deprecated and will be removed in v3.0.
- **ECDH Key Exchange** — Server now generates ephemeral ECDH P-256 key pairs per session instead of a static long-lived key. Each `/verify-dlc` response includes a fresh `server_public_key` and `session_id`.
- **Response Envelope** — All API responses now use a consistent envelope with `success`, `data`, `error`, and `meta` fields.
- **Endpoint Paths** — Moved from `/api/verify` to `/v1/verify-dlc`. Old paths will redirect for 90 days.
- **Unity SDK API** — Renamed `DlcProtectClient.Verify()` to `DlcProtectClient.VerifyDlcAsync()`. Added `OfflineTokenValidator` class.
- **Configuration** — Removed `shared_secret` from config. Replaced with `api_key` field.

### Deprecated
- Legacy bearer token authentication (`Authorization: Bearer <token>`). Support ends October 26, 2026.
- Self-hosted local test server (`npm run dev:local`). See [Local Testing →](https://dlcprotect.dev/docs/local-testing) for new sandbox environment using `dcp_test_` keys.
- `POST /api/verify` endpoint. Migrate to `POST /v1/verify-dlc`.

### Removed
- Static ECDH key pair generation on first run — replaced by ephemeral session-based key exchange.
- HMAC-SHA256 request signing — replaced by API key authentication.
- Local SQLite backend — replaced by managed Supabase PostgreSQL backend.
- `npm run setup` command — setup is now handled via the web dashboard.

### Fixed
- Replay attack window reduced from 60s to 5s by using per-session ephemeral ECDH keys.
- Race condition in concurrent DLC verification for the same Steam user (now serialized per session).
- Unity SDK thread-safety issue when calling `VerifyDlcAsync` from multiple game objects simultaneously.
- Offline token collisions when two different users shared the same offline token (tokens now bind to Steam ID + DLC ID + timestamp).
- Memory leak in auth ticket buffer handling in the Unity SDK.

### Security
- **Forward Secrecy** — Ephemeral ECDH keys ensure that compromise of a long-term key does not compromise past sessions.
- **Session Isolation** — Each `/verify-dlc` call generates a unique session ID and key pair. No cross-session key reuse.
- **Offline Token HMAC** — Offline tokens are now HMAC-signed with a server-side secret, preventing forgery even with full knowledge of the token format.
- **API Key Rotation** — Dashboard now supports instant key rotation with optional 24-hour cooldown period.
- **Audit Logging** — All verification requests are logged with request ID, timestamp, Steam ID, and DLC IDs for compliance and abuse analysis.

---

## [1.0.0] — 2026-06-15

### Added
- **ECDH P-256 Key Exchange** — Elliptic-curve Diffie-Hellman key exchange between game client and local validation server. Each session generates a unique shared secret.
- **AES-256-GCM Payload Encryption** — DLC identifiers and metadata encrypted with AES-256 in Galois/Counter Mode. Authenticated encryption prevents tampering.
- **Local Test Server** — Node.js Express-based local server (`npm run dev:local`) for development and testing. Supports in-memory DLC ownership database.
- **Steam Auth Ticket Verification** — Integration with Steamworks `ISteamUser.GetAuthSessionTicket()` and `ISteamGameServer.BeginAuthSessionTicket()` for client identity proof.
- **Unity SDK (Initial)** — Basic Unity SDK with `DlcProtectClient.Verify()` synchronous method. Supports MonoBehaviour-based lifecycle.
- **HMAC-SHA256 Request Signing** — Shared-secret HMAC signing for request integrity. All requests include `Authorization: Bearer <hmac>` header.
- **Static Key Pair** — Server generates a static ECDH P-256 key pair on first launch, stored in `keys/` directory.
- **Basic Error Responses** — Simple error responses with `error` string field (no structured error codes).
- **Console Logging** — Request/response logging to stdout with basic timestamps.
- **Docker Support** — `docker-compose.yml` for running the local test server and dependencies.
- **Example Unity Scene** — Sample Unity scene demonstrating DLC unlock flow with Steam integration.

### Security
- Initial implementation of client-server ECDH key exchange.
- AES-256-GCM authenticated encryption for DLC tokens.
- Steam auth ticket verification against Valve's API.
- HMAC request signing to prevent request tampering.

---

## [Unreleased]

### Planned
- Epic Games Store (EGS) identity integration
- GOG Galaxy SDK integration
- Unreal Engine 5 native plugin
- Godot 4 native plugin
- Real-time abuse detection via anomaly scoring
- DLC usage analytics dashboard (per-DLC unlock rates, geographic distribution)
- Webhook notifications for verification events
- Billing metering API for Enterprise plan custom reporting
- Client-side token caching layer with configurable TTL
- Multi-language SDKs (Rust, C++, Python)

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 2.0.0-saas | 2026-07-26 | SaaS multi-tenant, offline tokens, API key auth, dashboard |
| 1.0.0 | 2026-06-15 | Initial release with ECDH + AES crypto, local test server |