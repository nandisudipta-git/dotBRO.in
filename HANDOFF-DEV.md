# dotbro.in — Developer Handoff Document

> **Last Updated:** August 10, 2026  
> **Status:** Live & Production Ready at [dotbro.in](https://dotbro.in)  
> **Primary Repository:** `nandisudipta-git/dotBRO.in` (Branch: `main`)

---

## 1. Executive Summary & Product Overview

**dotbro.in** (internally named **"the alge"**) is a living, interactive 3D graph for curiosity and open questions. Users float questions onto a 3D Earth or into satellite orbits without login friction. Other users answer, debate, and request private meetings.

- **Live URL:** [https://dotbro.in](https://dotbro.in) (and [https://www.dotbro.in](https://www.dotbro.in))
- **About Page:** [https://dotbro.in/about.html](https://dotbro.in/about.html)
- **Moderation Panel:** [https://dotbro.in/mod.html](https://dotbro.in/mod.html)
- **Tagline:** *"Some conversations deserve another chance."*

---

## 2. Architecture & Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend Framework** | Vanilla HTML5 / JavaScript (ES6 Modules) / CSS3 | Zero heavy frameworks; optimized for low memory overhead and instant load. |
| **3D Rendering** | Three.js + Postprocessing (UnrealBloomShader) | Real-time solar position calculations, lunar phases, starfield, meteors, and city night lights. |
| **2D Fallback** | HTML5 2D Canvas Engine | Built directly into `index.html` as automatic fallback for non-WebGL / low-power GPUs. |
| **PWA / Caching** | Service Worker (`sw.js`) + `manifest.webmanifest` | Installable shell, offline assets caching. |
| **Database & API** | Supabase (PostgreSQL 15) | Region: `ap-south-1` (Mumbai). Project Ref: `fliheqjbwmcoggajovln`. |
| **Hosting** | GitHub Pages | Served via custom domain `dotbro.in` (GoDaddy CNAME to GitHub Pages). |
| **Email Service** | Resend API + Supabase Edge Function (`notify`) | Scheduled via `pg_cron` / `pg_net` every 5 minutes (`notify-answers`). |

---

## 3. Directory & File Structure Map

The active codebase lives under `aLOKaRa/Ventures/dotBRO/www.dotbro.in/`:

```
aLOKaRa/Ventures/dotBRO/
├── www.dotbro.in/                 <-- PRODUCTION SITE REPO (nandisudipta-git/dotBRO.in)
│   ├── index.html                 # Main App: HUD, compose/question sheets, Supabase client, 2D fallback engine
│   ├── alge-engine.js             # WebGL 3D Globe Engine (Three.js shaders, lighting, starfield, tethers)
│   ├── about.html                 # Philosophy card-stack landing page
│   ├── mod.html                   # Moderation dashboard (Passphrase gated)
│   ├── sw.js                      # PWA Service Worker (Bump VERSION to force-refresh client caches)
│   ├── manifest.webmanifest       # PWA Application Manifest
│   ├── backend/                   # SQL migrations, edge functions (notify), security triggers
│   ├── docs/                      # Readiness audits, SQL seeds, system docs
│   └── old/                       # Archived retired legacy pages (blocked by robots.txt)
├── site/                          # Legacy static landing site (Vercel historical archive)
└── *.BRO/                         # Concept sub-modules (Chill.BRO, Law.BRO, con.BRO, gyan.BRO, etc.)
```

---

## 4. Where Things Are Hosted & How Deployment Works

### Live Infrastructure
1. **Domain & DNS:** Registered at GoDaddy. CNAME record points `dotbro.in` and `www.dotbro.in` to `nandisudipta-git.github.io`.
2. **Web Host:** GitHub Pages hosting repository `nandisudipta-git/dotBRO.in`.
3. **Database Host:** Supabase Free Tier (`ap-south-1` Mumbai).

### Deployment Workflow
To deploy updates to production:

```bash
cd ~/Ron/aLOKaRa/Ventures/dotBRO/www.dotbro.in
git add .
git commit -m "Your descriptive commit message"
git push origin main
```

> [!IMPORTANT]
> **GitHub Pages Rebuild Check:**  
> Always verify deployment by inspecting the service worker version:
> ```bash
> curl -s "https://dotbro.in/sw.js" | head -n 5
> ```
> If GitHub Pages stalls and does not rebuild within 2 minutes, push an empty kick commit:
> ```bash
> git commit --allow-empty -m "Kick build"
> git push origin main
> ```

---

## 5. Security & Backend Governance

### Database Security (RLS & RPCs)
- **Row Level Security (RLS):** Active on all tables (`questions`, `replies`, `reports`, `notify_subs`, `events`).
- **Access Policies:** Anonymous users have `INSERT` and `SELECT` rights only. No public `UPDATE` or `DELETE` policies exist.
- **Admin Moderation:** Handled strictly through PostgreSQL RPC functions (`security definer`):
  - `admin_verify(passphrase)`
  - `admin_delete_question(qid, passphrase)`
  - `admin_delete_reply(rid, passphrase)`
  - `admin_reports(passphrase)`
- **Passphrase Security:** Moderation passphrase is hashed with `bcrypt` inside `private.admin_secret`. Rate-limiting locks out IPs after 5 consecutive failures for 15 minutes.

### Rate Limiting & Privacy (P5 Principle)
- **IP Enforcement:** Trigger function `rl_guard` reads `cf-connecting-ip` directly from HTTP headers.
- **Privacy Preservation:** Visitor IPs are never stored raw. They are stored as salted SHA-256 hashes in `private.rl_hits` and automatically pruned after 2 days.
- **Rate Limits:**
  - Questions: 5 per minute / 40 per day per visitor IP.
  - Replies: 15 per minute / 120 per day per visitor IP.
  - Reports: 10 per minute / 60 per day per visitor IP.

---

## 6. Key Features & How They Work

1. **Living Globe ("the alge"):**
   - Renders 3D Earth with real solar declination, realistic lunar phases, starfields, and meteors.
   - Questions appear as glowing dots over their geo-location or on tilted satellite orbits if location-free.
   - Category clusters arrange nodes using a golden-angle sunflower rosette.

2. **Compose & Location System:**
   - 3 Location choices: **Orbit** (location-free), **GPS** (browser location), or **City Lookup** (3,066 Indian towns gazetteer).
   - Optional email notifications on answers powered by Resend & Supabase Edge Functions.

3. **Private Meet Requests:**
   - Asker-only thread activation: only the original question author (holding the author token in `localStorage`) can unlock a private meeting request thread with someone who answered.

4. **Analytics (`public.events`):**
   - First-party write-only event tracking (funnel events: page land, globe touch, geo action, compose, post, reply view, install PWA).

---

## 7. Developer Local Setup Guide

To run and test locally:

```bash
# Navigate to the production directory
cd ~/Ron/aLOKaRa/Ventures/dotBRO/www.dotbro.in

# Start a simple HTTP server (Port 8734)
python3 -m http.server 8734
```

Then open `http://localhost:8734` in Google Chrome.

> [!TIP]
> **Cache Busting:**  
> Chrome heavily caches local assets. When editing `alge-engine.js` or `index.html`, append `?v=timestamp` or hard reload (Cmd+Shift+R).

---

## 8. Summary of Open Items / Roadmap

1. **PWA Push Notifications:** Android Web Push infrastructure is built (`VAPID_PRIVATE_KEY` / FCM ready). Requires final handset verification.
2. **Moderation Monitoring:** Periodic check of [dotbro.in/mod.html](https://dotbro.in/mod.html).
3. **Database Pagination:** Questions currently fetched with `.limit(300)`. As content grows beyond 300 active nodes, implement infinite pagination / viewport bounds querying.
4. **Cloudflare Migration (Future Plan):** Consolidate Vercel/Supabase free tiers onto Cloudflare Pages + Workers + D1 when scaling.
