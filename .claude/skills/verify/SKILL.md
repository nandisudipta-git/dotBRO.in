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

Then drive `http://localhost:8734/index.html` (the globe app — the front page) and `/about.html`
(the .Bro framework card-stack) with the
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
- Perf: the globe raster is the hot path. `rasterEarth(sil, moving)` should cost <10ms at sil=400;
  if a change pushes it past ~16ms the spin visibly stutters.
- **Deploy:** live site is Vercel (confirmed via `curl -sI https://dotbro.in` → `server: Vercel`), deployed via Vercel file-upload API — NOT git push, NOT GitHub Pages (old DEPLOY.md in ../www.dotbro.in is stale). See ../dotbro-in-PROJECT.md build log.
