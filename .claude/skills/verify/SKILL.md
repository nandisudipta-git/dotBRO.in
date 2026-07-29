---
name: verify
description: Verify dotbro.in site changes by serving the folder locally and driving it in Chrome
---

# Verify dotbro.in site changes

Static HTML site — no build step. The Chrome extension blocks `file://`, so serve over localhost:

Serve with an explicit directory so you never test a stale sibling copy — `site/` holds an older
checkout of the same repo with the same filenames:

```bash
python3 -m http.server 8734 --directory /Users/nandi/Ron/aLOKaRa/Ventures/dotBRO/www.dotbro.in
```

The site is TWO pages now: `/` (the globe app) and `/about.html` (the .Bro card-stack).
parbro/podbro/conbro/gyan were removed 2026-07-28 (git history has them). Drive both pages with the
claude-in-chrome tools. Always append a cache-buster (`?v=1`, bump it each reload) — Chrome caches
these pages aggressively and will silently serve the previous build.

## Flows worth driving
- About page: scroll the card stack top to bottom — hero → why → how → principles → family → ronvey → footer. The companion dot should narrate each stop.
- Family section links deep-link into the globe: `/#study-gyaan`, `#life`, `#build-startup`, `#meet-people` — the matching legend item must show as active (white/bold) and other categories dim.
- The globe (index.html) talks to live Supabase (project `fliheqjbwmcoggajovln`) — network required; header shows "N conversations floating" when connected. If it can't reach it, a red banner says so — an empty globe with no banner is a bug.
- `/feed.html` AND `/alge.html` are redirect stubs only (their links were shared). Both must forward to `/` carrying the `#category` across. `/?q=<uuid>` deep-links into that conversation with the sheet open.

## Gotchas
- Hash-only navigation does not reload the page — the globe has a `hashchange` listener; test both fresh-load and hash-change paths. `#connect` opens the Connect-now sheet rather than filtering.
- Ghost text bleeding between cards mid-scroll is the intended "recede" effect, not a bug.
- Footer is `text-transform: uppercase`; the aLOKaRa span and the mail link carry `style="text-transform:none"` to keep casing.
- The landing companion dot must never sit on text: it picks a clear corner when the scroll settles and
  hides its bubble while scrolling. Regression test = scroll the whole page and assert the `.cmsg` rect
  intersects no visible text rect at rest.
- The globe renders in WebGL (alge-engine.js — three.js + UnrealBloom; day/night shader with real
  city lights, off-axis sun so the terminator always crosses the disc). The 2D canvas engine in
  index.html is the AUTOMATIC FALLBACK — the module sets `window.__3D` and the old draw loop stands
  down. `window.__ENGINE.fps()` reads the live frame rate. Classic-script consts reach the module
  ONLY via the `window.APP` bridge — a "window.X is not a function" error in the engine means a
  missing bridge entry, not a missing function.
- Perf (2D fallback only): the globe raster is the hot path. `rasterEarth(sil, moving)` should cost <10ms at sil=400;
  if a change pushes it past ~16ms the spin visibly stutters.
- `/mod.html` = passphrase-gated moderation (noindex, robots-blocked). Unlock → list with reported-first, delete question/reply. Every destructive call re-checks the passphrase server-side (bcrypt + lockout in `private` schema).
- PWA: manifest.webmanifest + sw.js (network-first shell, CDN cache-first, supabase never cached).
  Bump `VERSION` in sw.js when a deploy must invalidate cached shells. Camera fit is aspect-aware
  (`baseDist()` in alge-engine.js) — globe fills ~87% of the narrow axis at any aspect ratio.
- **Deploy:** live site is GitHub Pages again (re-confirmed 2026-07-29: `curl -sI https://dotbro.in` → `server: GitHub.com`) — `git push origin main` to `nandisudipta-git/dotBRO.in` IS the deploy. A parallel copy exists on Vercel (project `dotbro`, team `team_6J97o78JsI4a5AMCneFh3GlM`) but DNS does not point there. ALWAYS re-check the `server:` header before deploying — this line has flipped twice.
