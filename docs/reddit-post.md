🚀 I built a free, open-source DLC protection system for Steam games — here's how it works

🔐 **DLC Protect** — End-to-end encryption for Steam DLCs

After spending weeks researching how to prevent DLC piracy for our indie game, I realized there's no good off-the-shelf solution. So I built one.

**How it works:**
1. Ship encrypted AssetBundles with your game
2. Player authenticates via Steam (standard ticket system)
3. ECDH P-256 key exchange delivers a session-unique AES-256 key
4. DLC is decrypted in memory — never stored on disk
5. Offline tokens allow 24h of gameplay without internet

**Why I'm sharing:**
The SDK is MIT-licensed and ready to use. If you want a hosted version (no backend setup), I'm launching a SaaS — but the full code is on GitHub to self-host.

**Tech stack:**
- Backend: Supabase Edge Functions (Deno) + Node.js test server
- Crypto: ECDH P-256, AES-256-CBC, HMAC-SHA256
- Client: Unity C# with Steamworks.NET
- 31 automated tests, all passing

**GitHub:** https://github.com/Schummlerr/steam-dlc-protection-sdk-
**Landing page:** https://schummlerr.github.io/steam-dlc-protection-sdk-/

Would love feedback from fellow devs! What's your approach to DLC security?