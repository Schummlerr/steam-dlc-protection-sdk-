# DLC Protect — Marketing Blueprint 🚀

## Executive Summary

**Produkt:** Open-Source ECDH + AES-256 SDK für Steam DLCs  
**Zielgruppe:** Indie Game Developers (Unity, Steam)  
**USP:** 3 Zeilen C#, 24h Offline-Tokens, keine Infrastruktur nötig  
**Modell:** Open Core (Client SDK kostenlos, SaaS-Backend kostenpflichtig)

---

## 1. Launch-Strategie

### Reihenfolge (abgestimmt auf maximale Wirkung)

| Schritt | Plattform | Zeitpunkt | Impact |
|---------|-----------|-----------|--------|
| 1 | **Hacker News** Show HN | ✅ Bereits live | Hoch |
| 2 | **Reddit** r/gamedev + r/Unity3D | Heute | Sehr hoch |
| 3 | **X/Twitter** Launch Thread | Heute | Mittel |
| 4 | **Indie Hackers** Launch Post | Morgen | Mittel |
| 5 | **GitHub** Release Announcement | Diese Woche | Niedrig |
| 6 | **Product Hunt** Launch | Nächste Woche | Hoch |

### Launch-Checkliste (heute)
- [x] HN Post live
- [x] GitHub Repo öffentlich
- [ ] Reddit Post auf r/gamedev → JETZT
- [ ] X/Twitter Launch Tweet → NACH Reddit
- [ ] Landing Page prüfen → URL testen

---

## 2. Content-Strategie

### Reddit 🧵 (HIGHEST IMPACT)

**Passende Subreddits:**

| Subreddit | Mitglieder | Erlaubt Self-Promo? | Taktik |
|-----------|-----------|---------------------|--------|
| r/gamedev | 3.3M | Nein, aber "Show my project" | Text-Post mit Tech-Details |
| r/Unity3D | 400K | Ja, Show-off Friday | Video/GIF vom DLC-Loading |
| r/IndieDev | 400K | Ja, am Wochenende | Projekt-Vorstellung |
| r/Steam | 2M | Nein | Kommentar, wenn relevant |
| r/gameDevClassifieds | 100K | Ja | "Take my money" für Devs |
| r/gamedesign | 130K | Nein | Antworten, wenn DLC-Thema |
| r/devblogs | 15K | Ja | Ausführlicher Blog-Post |

**r/gamedev Post Vorlage (heute posten):**
```
Titel: I built an open-source SDK that encrypts Steam DLCs with ECDH P-256 (29 tests passing)

Text:
After seeing posts about DLC piracy on here, I built DLC Protect — an SDK that encrypts Steam DLCs with per-session ECDH key exchange.

How it works:
• Player launches game → ephemeral P-256 key pair generated
• Steam ticket validated via Valve API in real-time
• ECDH key agreement delivers session-unique AES-256 key
• DLC decrypted in memory, never stored on disk
• 24h offline tokens for offline gameplay

Unity integration is 3 lines of C#. The full source is MIT-licensed on GitHub.

Production API: https://waocbngkeujyejpfnahg.supabase.co/functions/v1/verify-dlc/health
GitHub: https://github.com/Schummlerr/steam-dlc-protection-sdk-

Happy to answer technical questions about the crypto protocol!

#gamedev #indiedev #unity3d #steam
```

**Reddit Fehler, die du vermeiden solltest:**
- ❌ Nur Link-Posts (sehen nach Spam aus)
- ❌ Self-Promo ohne Kontext
- ❌ Posten in Subreddits ohne vorherige Aktivität
- ❌ Gleichen Post in 5 Subreddits gleichzeitig
- ✅ Immer "Show my project" oder "I built" Format nutzen

### X/Twitter 🐦 (LAUNCH THREAD)

**30-Tage Plan (1 Post/Tag minimum):**

| Tag | Typ | Inhalt |
|-----|-----|--------|
| 1 | 🔥 Launch Thread | "I built an open-source SDK..." (4 Tweets) |
| 2 | 📊 Wirklichkeit | "29 tests, 0 failures" |
| 3 | 🔧 Tech | "How ECDH key exchange works in games" |
| 4 | ❓ Frage | "What's your biggest DLC piracy concern?" |
| 5 | 📈 Zahlen | HN Post + Traffic Update |
| 6 | 🔥 Thread | "Why I open-sourced my security product" |
| 7 | 🧪 Dev | "How I test crypto code" |
| 8 | 💬 Community | Retweet/Folge anderen Devs |
| 9 | 🔨 Update | "Added XYZ feature" |
| 10 | 🎮 Unity | "3 lines of C# to protect your DLC" |
| 11 | 😂 Meme | DLC piracy meme (relatable) |
| 12 | 📊 Umfrage | "How do you protect your DLCs?" |
| 13 | 🔥 Thread | "Lessons from building a game security product" |
| 14 | ❓ AMA | "Ask me anything about game encryption" |
| 15 | 📉 Real Talk | "Zero users so far — here's what I learned" |
| 16 | 🎯 Use Case | "When should you encrypt your DLC?" |
| 17 | 💻 Code | Code snippet: encrypting a DLC bundle |
| 18 | 📈 Wachstum | "Open source vs closed source for security" |
| 19 | 🎨 Visual | Architecture diagram |
| 20 | 🔥 Thread | "Game dev security mistakes" |
| 21 | ❓ Frage | "Would you pay for managed DLC protection?" |
| 22 | 📊 Update | User stats, downloads |
| 23 | 🎮 Gaming | Post about Steam in general |
| 24 | 🔨 DevLog | "Building a Unity SDK" |
| 25 | 😂 Meme | Game dev life + security |
| 26 | 📈 Zahlen | GitHub stars, traffic |
| 27 | 🔥 Thread | "How to protect your game from pirates" |
| 28 | 🧪 Tech | Performance benchmarks |
| 29 | 🎯 CTA | "Try it yourself" |
| 30 | 📊 Recap | "30 days of building in public" |

**Launch Thread Vorlage:**
```
Tweet 1/4:
I built an open-source SDK that encrypts Steam DLCs.
ECDH P-256 key exchange. AES-256-GCM encryption. 24h offline tokens.
29 tests. All passing.

No more free DLCs for people who didn't pay. 🛡️
[Link]

Tweet 2/4:
The problem:
Steam DLCs are downloaded as regular files.
Anyone with the base game can access them — even without buying.

The fix:
Real-time Steam auth → ECDH key agreement → AES key delivered
3 lines of C#. One config field.

Tweet 3/4:
Why open source?
Security products need to be auditable.
MIT license means you can inspect every line.

Production API is live and free to try:
curl [endpoint]/health

Tweet 4/4:
Built with:
• Supabase Edge Functions (Deno)
• Unity + Steamworks.NET
• Web Crypto API (ECDH)

Looking for feedback from game devs!
Star the repo if this resonates ⭐
[GitHub]
```

### LinkedIn 💼 (Optional, niedriger Impact)

- **1x/Woche** Technischen Beitrag posten
- Beispiel: "How ECDH key exchange prevents DLC piracy — a technical deep dive"
- Nur machen wenn der Account schon Dev-Follower hat

### Product Hunt 🎯

**Vorbereitung (1 Woche vor Launch):**
- Landing Page optimieren (CTA "Get Early Access")
- 3-5 Maker-Freunde finden die am Launch-Tag upvoten
- Kommentare vorbereiten (FAQ)
- PH-Titel: "DLC Protect — Open-source encryption for Steam DLCs"
- Tagline: "ECDH P-256 + AES-256-GCM key delivery for your Steam game. 3 lines of Unity C#."

### Indie Hackers 💪

- Post: "How I built an open-source DLC protection system — $0 revenue, 1 HN post, 2 points"
- Format: "Why I built this → What I learned → Results so far → What's next"
- Link zum GitHub Repo und Landing Page
- Timing: Nachdem Reddit/HN etwas Traffic gebracht haben (1-2 Tage)

---

## 3. Reddit-Strategie (DETAIL)

### Vertrauen aufbauen (Phase 1 — Woche 1-2)

| Tag | Aktion | Subreddit |
|-----|--------|-----------|
| 1 | 🔴 **Hauptpost** auf r/gamedev | r/gamedev |
| 2 | Kommentar auf nem Hot-Post zum Thema DLC/Piracy | r/gamedev |
| 3 | Antworten auf Kommentare im eigenen Post | r/gamedev |
| 5 | Post auf r/Unity3D (anderer Winkel: "3 lines of C#") | r/Unity3D |
| 7 | r/IndieDev "Show my project" Post | r/IndieDev |

### DANACH: Engagement (Phase 2 — Woche 3+)

- **Jeden Tag** 10 Minuten: Kommentare auf r/gamedev schreiben (keine Promo, nur helfen)
- **Wenn DLC/Piracy-Thema aufkommt:** Natürlich erwähnen ("I built something similar...")
- **Nicht:** Den eigenen Link unter jeden Post klatschen
- **Nicht:** 5 Subreddits am gleichen Tag zuspammen

### Timing
- **Beste Zeit:** Dienstag-Donnerstag, 14-17 Uhr US-EST
- **Schlechteste Zeit:** Wochenende, nachts US-EST
- **Warum:** Game devs arbeiten im amerikanischen Nachmittag

---

## 4. X/Twitter Strategie (AUTOMATISIERT)

### Tools (kostenlos):
- **Buffer** — Post planen (kostenloser Plan: 3 Kanäle)
- **Typefully** — Threads vorbereiten
- **CapCut** — Kurze Videos schneiden
- **Canva** — Grafiken (kostenlose Vorlagen)

### Fokus:
1. **Build in Public** — Authentisch, kein Marketing-Sprech
2. **Technisch** — Code-Snippets, Architektur, Benchmarks
3. **Community** — Retweeten, Antworten, Folgen

### Hashtags (max 3): #gamedev #indiedev #opensource

---

## 5. Cold-Email-Strategie (LEICHT, NIEDRIGER IMPACT)

### Zielgruppen (priorisiert):

| Zielgruppe | Warum? | Wo finden? |
|-----------|--------|-----------|
| **Unity Asset Store Devs** mit DLCs | Haben bereits DLC-Content | Asset Store, itch.io |
| **Steam Indie Devs** (1-3 Spiele) | Brauchen Schutz, kein Budget für Denuvo | SteamDB, Twitter |
| **Game Dev Blogger/YouTuber** | Können darüber berichten | YouTube, Blog |
| **Discord Community Owners** | Multiplikator | Discord Server |

### Kontakte finden (kostenlos):
1. **SteamDB** — Nach Spielen mit DLC suchen, Publisher-Seite nach Kontakt scannen
2. **itch.io** — Entwickler mit DLC-Content
3. **Twitter** — "game developer dlc" Suche
4. **Reddit** — r/gamedev Nutzer die über Piracy posten

### E-Mail Vorlage (Kurz + Technisch):

```
Subject: Open-source Steam DLC encryption (29 tests passing)

Hi [Name],

I saw your game [Game] on Steam — looks great.

I built DLC Protect, an open-source SDK that encrypts Steam DLCs with ECDH P-256 + AES-256. The idea is to prevent unauthorized DLC access without needing expensive DRM.

Unity integration is 3 lines of C#. The production API is live.

Would love your feedback: https://github.com/Schummlerr/steam-dlc-protection-sdk-

Best,
[Name]
```

### Follow-Up Sequenz (wenn keine Antwort):
1. Tag 3: "Quick follow-up on the DLC protection SDK..."
2. Tag 7: Letzter Versuch
3. Danach: Archivieren

---

## 6. Community Building

### Discord
- **Sofort:** Kein eigener Discord-Server (zu viel Arbeit)
- **Stattdessen:** In bestehenden Game Dev Discords aktiv sein

### GitHub
- **Issues** freischalten → Feedback einsammeln
- **Discussions** aktivieren (bereits gemacht)
- **Contributing Guide** schreiben
- **Good First Issue** Label für Contributors

### Newsletter / Warteliste
- **Noch nicht:** Kein Traffic, keine Liste
- **Sobald 100+ GitHub Stars:** Newsletter mit Substack starten
- **Lead Magnet:** "The Indie Developer's Guide to DLC Protection" (PDF)

---

## 7. Viralität

### Build in Public
- Täglich 1 Post über Fortschritt, Zahlen, Learnings
- Authentisch bleiben: Auch Misserfolge teilen
- Hashtag: #buildinpublic #indiedev

### Free Tool
- **Steam DLC Analyzer** — Kostenloses Tool das checkt ob ein Steam-Spiel DLCs hat und wie geschützt sie sind
- Viral-Effekt: Devs geben Link zu ihren eigenen Spielen → Traffic
- Aufsetzzeit: ~4h

### "Rate My DLC Protection" Challenge
- Devs schicken ihr Spiel → ich teste wie geschützt die DLCs sind → öffentlicher Report
- Social-Media Content + Liste der Teilnehmer

### Lead Magnets
- "Steam DLC Security Checklist" (PDF, 1 Seite)
- "ECDH vs AES vs RSA — Which crypto for your game?" (Blog)
- "DLC Protection Benchmark: 10 Popular Games Compared" (Blog)

---

## 8. Multiplikatoren & Influencer

### Wer kontaktieren?

| Creator | Plattform | Reichweite | Wie ansprechen |
|---------|-----------|-----------|----------------|
| **Game Dev YouTuber** (Code Bullet, Dani,等等) | YouTube | 1M+ | Erst kommentieren, dann per E-Mail |
| **Fireship** | YouTube | 3M+ | "Build a DLC protection system in 100 seconds" |
| **Indie Game Dev Podcasts** | Spotify/YouTube | 50-200K | Interview-Angebot |
| **Game Dev Newsletter** (GameDiscoverCo) | E-Mail | 50K | "Your readers might find this useful" |

### Kontakt-Taktik:
1. Folge dem Creator auf X
2. Kommentiere unter deren Posts (echten Mehrwert bieten)
3. Erwähne das Projekt NUR wenn relevant
4. Erst dann: DM oder E-Mail

---

## 9. SEO & Content Marketing

### Keywords (Google Suche)

| Keyword | Suchvolumen | Schwierigkeit | Artikel-Idee |
|---------|------------|---------------|-------------|
| "steam dlc protection" | Niedrig | Easy | #1 Ranking sichern (README + Landing Page) |
| "protect game dlc" | Niedrig | Easy | Blog: "How to protect your Steam DLC" |
| "dlc encryption" | Niedrig | Easy | Blog: "ECDH encryption for game DLCs" |
| "unity drm" | Mittel | Mittel | Blog: "Open source DRM alternatives for Unity" |
| "steam drm bypass" | Mittel | Mittel | Blog: "Why Steam DRM isn't enough" |
| "game piracy protection" | Mittel | Mittel | Blog: "Game piracy in 2026" |
| "ecdh game development" | Sehr niedrig | Easy | Blog: "Implementing ECDH in Unity" |

### Blog-Artikel (Reihenfolge)

1. **How to protect your Steam DLC from piracy** (SEO + Mehrwert)
2. **ECDH key exchange explained for game developers** (Technisch)
3. **Steam DRM vs DLC Protect: A comparison** (Vergleich)
4. **Why open source is better for game security** (Philosophisch)
5. **The Indie Developer's Guide to DLC Protection** (Lead Magnet PDF)
6. **Implementing ECDH in Unity: A step-by-step guide** (Tutorial)

### Landing Pages
- `/` — Hauptseite (✅ erstellt)
- `/docs` — API Reference
- `/blog` — Blog-Artikel
- `/pricing` — Preise (wenn Stripe bereit)
- `/security` — Security Details, Threat Model

---

## 📋 PRIORITÄTENLISTE — Top 20 Maßnahmen

| # | Maßnahme | Impact | Aufwand | Kategorie |
|---|----------|--------|---------|-----------|
| 1 | **Reddit r/gamedev Post** 🔴 | Sehr hoch | 10 Min | Heute |
| 2 | **X/Twitter Launch Thread** 🐦 | Hoch | 20 Min | Heute |
| 3 | **HN Kommentar beantworten** | Mittel | 5 Min | Heute |
| 4 | **Reddit r/Unity3D Post** | Hoch | 10 Min | Morgen |
| 5 | **Indie Hackers Post** | Mittel | 15 Min | Morgen |
| 6 | **README Beitragsbild** (OG Image) | Mittel | 30 Min | Dringend |
| 7 | **30-Tage X-Plan abfeuern** (Buffer) | Hoch | 1h Setup | Diese Woche |
| 8 | **Steam DLC Analyzer Tool bauen** | Sehr hoch | 4h | Diese Woche |
| 9 | **Blog "How to protect Steam DLC"** | Mittel | 1h | Diese Woche |
| 10 | **Product Hunt Launch vorbereiten** | Hoch | 2h | Nächste Woche |
| 11 | **Cold E-Mails an 10 Indie Devs** | Mittel | 1h | Diese Woche |
| 12 | **Discord Game Dev Server beitreten** | Mittel | 30 Min | Diese Woche |
| 13 | **SEO Landing Page optimieren** | Mittel | 1h | Laufend |
| 14 | **GitHub Issues für Feedback öffnen** | Niedrig | 10 Min | Diese Woche |
| 15 | **"Rate My DLC Protection" Challenge** | Hoch | 2h | Nächste Woche |
| 16 | **SteamDB nach DLC-Spielen durchsuchen** | Mittel | 1h | Diese Woche |
| 17 | **Game Dev YouTuber kommentieren** | Mittel | 30 Min | Täglich |
| 18 | **Reddit r/IndieDev Post** | Mittel | 10 Min | Nächste Woche |
| 19 | **DLC Security Checklist PDF** | Niedrig | 30 Min | Nächste Woche |
| 20 | **Newsletter Substack einrichten** | Niedrig | 30 Min | Nach 100 Stars |

---

## Schnellstart (Heute Abend)

```
Reddit → X/Twitter → HN antworten → Fertig
└─ 20 Minuten ─┘
```

Alles andere ist optional und kann an den Folgetagen nachgeholt werden. **Der wichtigste Schritt ist heute der Reddit-Post.** Da liegt die meiste Zielgruppe (3.3M game devs) und die höchste Conversion-Rate für ein Dev-Tool.