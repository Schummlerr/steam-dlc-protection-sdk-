# DLC Protect API Reference

Base URL: `https://<project>.supabase.co/functions/v1/verify-dlc`  
Content-Type: `application/json`

## Authentication

All API requests require an API key in the `X-Api-Key` header:

```
X-Api-Key: sk_dlc_abc123...
```

Get your API key from the [Dashboard](/).

## Endpoints

---

### `GET /health`

Check if the API is running.

**Response 200:**
```json
{
  "ok": true,
  "version": "2.0.0-saas",
  "offlineTokens": true
}
```

---

### `POST /verify-dlc`

Verify a player's Steam ticket, check DLC ownership, and receive a wrapped AES key to decrypt the DLC.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `steamAppId` | number | ✅ | Your game's Steam App ID |
| `dlcId` | number | ✅ | The DLC's Steam App ID |
| `ticketHex` | string | ✅ | Steam auth ticket (hex, from `GetAuthTicketForWebApi`) |
| `clientPublicKey` | string | ✅ | Client's P-256 public key in SPKI DER format (base64, 91 bytes) |
| `identity` | string | optional | Ticket identity string |
| `requestOfflineToken` | boolean | optional | Set `true` to receive an offline JWT token |

**Response 200:**
```json
{
  "success": true,
  "steamId": "76561198000000000",
  "wrappedKey": {
    "serverPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
    "iv": "cVhhdmUgc29tZSBpdiB0byB1c2U=",
    "ciphertext": "encrypted-aes-key-here",
    "mac": "hmac-sha256-signature"
  },
  "offlineToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "offlineTokenExpiresInHours": 24
}
```

**Errors:**

| Status | Meaning |
|--------|---------|
| 400 | Invalid request (missing or malformed fields) |
| 403 | Invalid Steam ticket or DLC not owned |
| 404 | Game or DLC not registered in your account |
| 429 | Rate limit exceeded (30 req/min) |
| 500 | Server error |

**Rate Limiting:** 30 requests per minute per IP.

---

### `POST /verify-offline-token`

Verify a cached offline token and receive a new wrapped AES key. Use this when the player is offline but has a valid token.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | ✅ | The offline JWT token from a previous `/verify-dlc` response |
| `clientPublicKey` | string | ✅ | Client's NEW P-256 public key (fresh per session) |
| `dlcId` | number | optional | DLC ID to verify against token |

**Response 200:**
```json
{
  "success": true,
  "steamId": "76561198000000000",
  "wrappedKey": { ... }
}
```

**Errors:**

| Status | Meaning |
|--------|---------|
| 401 | Token invalid or expired. Player must go online. |
| 404 | DLC not found for this token |

---

### `GET /admin/games`

List all registered games (requires API key).

**Response 200:**
```json
{
  "success": true,
  "games": [
    {
      "id": "uuid",
      "steam_app_id": 480,
      "name": "My Game",
      "offline_token_duration_hours": 24
    }
  ]
}
```

---

## Unity Integration

### Installation

1. Copy `SteamDLCProtectionClient.cs` and `DlcLoaderExample.cs` into `Assets/Scripts/`
2. Install [Steamworks.NET](https://steamworks.github.io/) via Unity Package Manager
3. Install [BouncyCastle.Crypto](https://www.bouncycastle.org/csharp/) via NuGet

### Configuration

Attach `SteamDLCProtectionClient` to a GameObject and set:

```csharp
verifyEndpointUrl = "https://<project>.supabase.co/functions/v1/verify-dlc";
apiKey = "sk_dlc_your_key";
steamAppId = 480;   // Your Steam App ID
targetDlcId = 123456; // Your DLC Steam App ID
```

### Encrypting Your DLC

```bash
node tools/generate-aes-key.mjs
node tools/encrypt-dlc-bundle.mjs game.bundle game.enc --key-base64 "YOUR_KEY"
```

The `.enc` file ships with your game. The key goes into the DLC Protect dashboard.

### Loading the DLC

```csharp
public class MyGameLoader : MonoBehaviour {
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

### Offline Support

The SDK automatically caches offline tokens in `PlayerPrefs`. After the initial online verification, the DLC works offline for the configured duration (default: 24 hours). After expiry, the player sees a "Please go online to verify DLC" prompt.

---

## Crypto Protocol

1. **Client** generates ephemeral P-256 ECDH key pair
2. **Client** requests Steam auth ticket via `GetAuthTicketForWebApi()`
3. **Client** sends `{ steamAppId, dlcId, ticketHex, clientPublicKey }` to `/verify-dlc`
4. **Server** validates Steam ticket via Valve API
5. **Server** checks DLC ownership via Valve API
6. **Server** generates ephemeral P-256 ECDH key pair, derives shared secret
7. **Server** wraps the DLC's AES-256 key with the transport key (HKDF-like)
8. **Client** unwraps AES key via ECDH agreement
9. **Client** decrypts the DLC AssetBundle (iv + HMAC + ciphertext)

**Bundle Format:** `iv(16 bytes) + hmac(32 bytes) + AES-256-CBC ciphertext`