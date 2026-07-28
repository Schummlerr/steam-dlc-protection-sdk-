# Steam DLC Delivery SDK

Server-side DLC content delivery for Steam games.  
ECDH P-256 key exchange + AES-256-CBC+HMAC. Unity client. MIT license.

**What this does:** Your game ships with encrypted DLC AssetBundles. At runtime, a Steam-authenticated session negotiates a unique decryption key with the server. Paid DLC content is only decrypted for players who own it.

## Architecture

| Component | Stack | Role |
|-----------|-------|------|
| **Delivery Server** | Supabase Edge Functions (Deno) | Runtime key negotiation |
| **Local Dev Server** | Express.js / Node.js | Mock server for development |
| **Unity Client** | C# / Steamworks.NET | Runtime DLC loading |
| **Database** | PostgreSQL (Supabase) | DLC keys, entitlements, tokens |
| **Crypto** | P-256 ECDH, AES-256-CBC, HMAC-SHA256 | Per-session key delivery |

## Quick Start

```bash
# Start the dev server
cd local-test-server
cp .env.example .env
npm install
npm start

# Run tests (separate terminal)
node tests/e2e-crypto-test.mjs
node tests/comprehensive-api-test.mjs
```

## How It Works

1. **Encrypt** your DLC AssetBundle with `tools/encrypt-dlc-bundle.mjs`
2. **Deploy** the AES key to the delivery server
3. **Ship** the encrypted bundle with your game
4. **At runtime**, the Unity client requests a key via Steam auth + ECDH
5. **Server validates** ownership, delivers session-unique key
6. **Client decrypts** and loads the bundle in memory

## Unity Integration

```csharp
public class DlcLoader : MonoBehaviour {
    public SteamDLCProtectionClient client;
    public TextAsset encryptedDlcFile;

    void Start() {
        client.RequestDlcAccess(
            key => {
                var bundle = client.DecryptDlcAssetBundle(
                    encryptedDlcFile.bytes, key);
                AssetBundle.LoadFromMemory(bundle);
            },
            err => Debug.LogError($"DLC access denied: {err}")
        );
    }
}
```

## Offline Access

After the initial online verification, the client caches a 24-hour JWT token. The DLC works offline until the token expires. Self-host the server for full control.

## Project Structure

```
├── local-test-server/    Dev server + mock DB
├── supabase/             Edge Function + migrations
├── unity-client/         Unity C# SDK
├── tests/                E2E + comprehensive test suites
├── tools/                CLI tools (encrypt, keygen, admin)
└── docs/                 Landing page + SEO
```

## Test Suite

29 tests covering crypto roundtrip, input validation, rate limiting, offline tokens, forward secrecy, and admin CLI. All passing.

## License

MIT — use it, modify it, self-host it.