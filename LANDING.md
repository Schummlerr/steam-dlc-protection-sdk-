# DLC Protect

> **Secure your Steam DLCs in minutes**

End-to-end encryption for Steam DLCs. SaaS. No backend setup.

---

## Features

| Feature | Description |
|---------|-------------|
| **ECDH P-256 Encryption** | Military-grade elliptic-curve Diffie-Hellman key exchange with AES-256-GCM payload encryption. Every DLC token is uniquely bound to the user's Steam identity. |
| **Offline Tokens** | 24-hour offline validity window. Players keep access even without an internet connection after initial verification. |
| **Unity SDK** | Drop-in C# SDK for Unity 2021 LTS+. No game code changes needed — wrap your DLC check with a single `DlcProtect.Verify()`. |
| **Steam Integration** | Native Steamworks API integration via `ISteamUser.GetAuthSessionTicket()`. Automatic Steam ID extraction and replay-attack prevention. |
| **5-Minute Setup** | One NuGet package / Unity .unitypackage import, one API key from the dashboard, one config entry. |

---

## Pricing

| Plan | DLCs | Requests/mo | Price | Best for |
|------|------|-------------|-------|----------|
| **Starter** | 3 DLCs | 10,000 | **$9/mo** | Indie devs, jam games, prototypes |
| **Pro** | 50 DLCs | 100,000 | **$49/mo** | Commercial titles, early access |
| **Enterprise** | Unlimited | Custom | **Custom** | AAA studios, multi-title portfolios, SLA guarantees |

All plans include:
- ECDH P-256 encryption at rest and in transit
- 24-hour offline tokens
- Discord-first support
- 99.9% API uptime SLA (Pro and Enterprise)

---

## Quick Start

### 1. Get your API key

Sign up at [dlcprotect.dev](https://dlcprotect.dev) and generate an API key from the dashboard. Each key is scoped to your Steam App ID.

### 2. Install the SDK

```bash
# Unity — via Package Manager
# Add scoped registry: https://packages.dlcprotect.dev
# Package: com.dlcprotect.sdk

# Or .NET / standalone
dotnet add package DlcProtect.Sdk
```

### 3. Call the API

```csharp
using DlcProtect;

var client = new DlcProtectClient("your-api-key");
var result = await client.VerifyDlcAsync(new VerifyRequest
{
    SteamId = "76561197960287930",
    AppId = 480,
    DlcId = 1234567,
    AuthTicket = "AQAAAAAABGQJAAAAAAA...="
});

if (result.IsValid)
{
    // Unlock the DLC content
    GameContent.UnlockDlc(result.DlcId);
}
```

That's it. You're live.

---

## FAQ

### How does DLC Protect differ from Steam's built-in DLC?

Steam's `ISteamApps.BIsDlcInstalled()` is a client-side flag that any memory editor can flip. DLC Protect uses server-authoritative, end-to-end encrypted tokens. Even if a user patches their client, the token chain is validated and signed by our SaaS backend.

### Is my data encrypted on your servers?

Yes. DLC tokens are encrypted with ECDH P-256 + AES-256-GCM before they leave the game client. We never see plaintext DLC identifiers — only encrypted blobs and Steam auth signatures that we verify against Valve's API.

### What happens if the DLC Protect service is down?

Every verification generates a 24-hour offline token. Players who verified their DLC within the last 24 hours continue to have access with no internet connection required. Pro and Enterprise plans add a 99.9% SLA.

### Can I self-host?

Enterprise plans include an on-premise deployment option. Contact us for details.

### Do you support platforms other than Steam?

Currently Steam is our primary platform. Epic Games Store and GOG support are on the roadmap — [vote on features](https://dlcprotect.dev/roadmap) to move them up.

### What if I exceed my request quota?

We never reject a valid DLC owner due to quota. If you exceed your monthly limit, we'll bill at $0.001 per additional verification (Starter) or $0.0005 (Pro) until the next billing cycle, or you can upgrade your plan.

---

## Call to Action

**Stop leaving money on the table.** Every hour your DLC goes unprotected is another hour pirates redistribute your work. DLC Protect locks it down in 5 minutes.

👉 **[Get started free →](https://dlcprotect.dev)**  
No credit card required. First 1,000 verifications free on any plan.

---

*DLC Protect is not affiliated with Valve Corporation. Steam, the Steam logo, and Steamworks are trademarks of Valve Corporation.*