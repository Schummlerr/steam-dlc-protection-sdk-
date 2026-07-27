# DLC Protect — Social Media Content Pack

## Twitter/X Posts

### Post 1: Launch Announcement
🛡️ I built an open-source SDK that encrypts Steam DLCs with ECDH P-256 + AES-256.

3 lines of C#. 24h offline tokens. Production API live.

Check it out: https://github.com/Schummlerr/steam-dlc-protection-sdk-

#gamedev #indiedev #gamedevelopment #cybersecurity

---

### Post 2: Technical Teaser
ECDH key exchange in a Unity game? Yes.

DLC Protect generates ephemeral P-256 keys per session, validates Steam tickets in real-time, and delivers AES keys that can only decrypt one DLC for one player.

https://github.com/Schummlerr/steam-dlc-protection-sdk-

#gamedev #unity3d #programming

---

### Post 3: Problem/Solution
"99% of my players are pirates."

This is a real post from r/gamedev. DLC Protect won't stop all piracy, but it makes cracking your DLC significantly harder — without breaking the bank.

Free to try: https://github.com/Schummlerr/steam-dlc-protection-sdk-

#gamedev #indiedev #gaming

---

### Post 4: Open Source
DLC Protect is MIT-licensed open source.

You can:
- Audit the crypto yourself
- Run the test suite (31 tests, all green)
- Deploy your own instance
- Or use our production API

https://github.com/Schummlerr/steam-dlc-protection-sdk-

#opensource #gamedev #unity

---

## LinkedIn Post

🚀 Just launched DLC Protect — an open-source SDK for Steam DLC encryption.

The problem: Steam DLC files are accessible to anyone who downloads them. Most developers have no runtime protection.

The solution: ECDH P-256 key exchange + AES-256-GCM encryption. Players authenticate via Steam in real-time, and the decryption key is delivered per-session. Offline tokens allow 24h of gameplay without internet.

Built with:
- Supabase Edge Functions (Deno)
- Unity C# SDK (Steamworks.NET)
- 31 automated tests
- Multi-tenant SaaS architecture

GitHub: https://github.com/Schummlerr/steam-dlc-protection-sdk-
Production API: live and testable

#GameDev #IndieDev #CyberSecurity #OpenSource

---

## Hashtags (by platform)

Twitter/X: #gamedev #indiedev #gamedevelopment #unity3d #unrealengine #cybersecurity #opensource #programming #steam #dlc #indiegame #devsecops #crypto

LinkedIn: #GameDev #IndieDev #CyberSecurity #OpenSource #Steam #DLC #Unity3D #SoftwareDevelopment #DevSecOps

Reddit: r/gamedev, r/Unity3D, r/IndieDev, r/IndieGaming, r/gameDevClassifieds

---

## Taglines / CTAs

- "3 lines of C#. 24h offline tokens. Production-ready."
- "Your DLC. Your key. Your rules."
- "Stop sharing your DLC. Start encrypting it."
- "ECDH + AES-256 for your Steam game. Open source."
- "Try the live API: curl <endpoint>/health"

---

## Content Ideas for Later

1. **Piracy case study**: Analyze a real r/gamedev thread about DLC piracy
2. **Performance benchmark**: ECDH vs RSA, AES vs ChaCha20
3. **Unity integration guide**: Step-by-step with screenshots
4. **Cost comparison**: DLC Protect vs Denuvo vs custom solutions
5. **Security audit**: Walk through the threat model
6. **Offline token deep dive**: How local JWT verification works
7. **Migration guide**: Moving from Steam DRM to DLC Protect