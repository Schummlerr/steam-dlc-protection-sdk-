# How DLC Protect Works: A Technical Deep Dive

## The Problem

Steam DLCs are downloaded as regular files. Anyone who owns the base game can access the DLC files — even if they haven't purchased them. Most developers rely on Steam's DRM, but that only checks ownership at download time, not at runtime.

## The Solution

**DLC Protect** adds a cryptographic layer: the DLC is encrypted with AES-256, and the key is only delivered after a real-time Steam authentication check.

## Protocol Flow

### 1. Session Setup

The player launches the game. The Unity client generates an ephemeral P-256 ECDH key pair. This key pair is one-time-use — even if logged, it cannot be reused.

### 2. Steam Ticket Request

The client requests a Steam auth ticket via `GetAuthTicketForWebApi()`. This ticket proves the player is who they claim to be.

### 3. Verification Request

The client sends:
```json
{
  "steamAppId": 480,
  "dlcId": 123456,
  "ticketHex": "abcdef...",
  "clientPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..."
}
```

### 4. Server-Side Validation

The server:
1. Validates the Steam ticket via Valve's `AuthenticateUserTicket` API
2. Checks DLC ownership via `CheckAppOwnership`
3. Generates its own ephemeral ECDH key pair
4. Derives a shared secret using ECDH key agreement
5. Derives a transport key using HMAC-SHA256
6. Wraps the DLC's AES-256 key using AES-256-GCM
7. Signs everything with HMAC-SHA256 (timing-safe)

### 5. Key Delivery

The server returns:
```json
{
  "success": true,
  "steamId": "76561198000000000",
  "wrappedKey": {
    "serverPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
    "iv": "cVhhdmUgc29tZSBpdiB0byB1c2U=",
    "ciphertext": "encrypted-aes-key",
    "mac": "hmac-sha256-signature"
  }
}
```

### 6. Client Unwraps

The client:
1. Derives the same shared secret using its private key and the server's public key
2. Verifies the HMAC (timing-safe comparison)
3. Decrypts the AES key
4. Uses the AES key to decrypt the DLC AssetBundle

## Security Properties

| Property | How It's Achieved |
|----------|------------------|
| **Forward Secrecy** | Fresh ECDH key pair per session. Compromising one session key doesn't compromise past or future sessions. |
| **Perfect Forward Secrecy** | ECDH is ephemeral on both sides — no long-term keys are used for key exchange. |
| **Integrity** | Every encrypted payload is signed with HMAC-SHA256. |
| **Replay Protection** | Steam tickets are single-use and time-limited. |
| **Timing Attacks** | All comparisons use `crypto.timingSafeEqual()`. |
| **DoS Protection** | Rate limiting (30 req/min/IP), request size limits (256KB). |

## Offline Support

Players who authenticate once receive a signed JWT token (24h TTL). The token is cached in `PlayerPrefs` and verified locally. While the token is valid, the DLC works without internet access.

## Unity Integration

```csharp
public class DlcLoader : MonoBehaviour {
    public SteamDLCProtectionClient protection;
    public TextAsset encryptedDlcFile;

    void Start() {
        protection.RequestDlcAccess(
            aesKey => {
                byte[] bundle = protection.DecryptDlcAssetBundle(
                    encryptedDlcFile.bytes, aesKey);
                AssetBundle.LoadFromMemory(bundle);
            },
            error => Debug.LogError($"DLC failed: {error}")
        );
    }
}
```

Three lines of code. One config field. Done.

## Test Coverage

The SDK ships with 31 automated tests covering:
- Full ECDH + AES crypto roundtrip
- Input validation (all fields, all types)
- Rate limiting
- Forward secrecy (two sessions produce different keys)
- Offline token generation and verification
- Admin CLI tooling
- Docker production simulation

## Production Deployment

The production backend runs as a Supabase Edge Function (Deno) with PostgreSQL. Deployment is a single CLI command:

```bash
supabase functions deploy verify-dlc --no-verify-jwt
```

## Performance

Single verification: ~400-1000ms. Offline token verification: instant (no network).

## Try It

```bash
curl https://waocbngkeujyejpfnahg.supabase.co/functions/v1/verify-dlc/health
```

Full source code at [github.com/Schummlerr/steam-dlc-protection-sdk-](https://github.com/Schummlerr/steam-dlc-protection-sdk-)