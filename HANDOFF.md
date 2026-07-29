# dotbro.in — HANDOFF

*State as of 2026-07-28. Everything below is live. One page of truth for whoever picks this up — Ron, another Claude session, or a builder.*

---

## What it is

**The alge**: a living globe of conversations. Anyone floats a question (no login), it appears as a glowing dot floating above its real place on a 3D Earth, others answer / debate / continue / ask to meet. Beachhead community: IIT Mandi cohort. Vision: LinkedIn+Quora+Reddit in Gen-Z form.

**Live:** https://dotbro.in (the app) · https://dotbro.in/about.html (what .Bro is)

---

## The map (what file does what)

| File | Job |
|---|---|
| `index.html` | The whole app: HUD, sheets (compose/question/connect), data layer (Supabase), report button, presence, share links, PWA registration — **plus the complete 2D-canvas engine as automatic no-WebGL fallback** |
| `alge-engine.js` | The picture + the touch: WebGL globe (three.js + UnrealBloom). Day/night shader with real city lights, float shell + tethers, arcs, starfield, camera. Talks to the classic script ONLY via `window.APP` bridge + window-level function declarations |
| `about.html` | .Bro philosophy card-stack (the old landing) |
| `mod.html` | Moderation: passphrase unlock → list (reported pinned first) → delete question/reply |
| `feed.html`, `alge.html` | Redirect stubs — old shared links land on `/`, hash intact |
| `manifest.webmanifest`, `sw.js` | PWA: installable, shell offline, Supabase never cached. **Bump `VERSION` in sw.js to force-refresh cached shells** |
| `old/` | Every retired page (parbro, podbro, conbro, gyan, old landings). Robots-blocked |
| `docs/READINESS-AUDIT.md` | The honest audit + what was closed |
| `docs/seed/100-questions.sql` | 100 house questions (currently NOT in the DB — Ron chose real-only). Re-runnable |
| `.claude/skills/verify/SKILL.md` | How to verify changes (serve + drive in Chrome). Read before touching anything |

---

## Deploy

`git push origin main` → GitHub Pages serves it (repo `nandisudipta-git/dotBRO.in`, CNAME `dotbro.in`). That's it. Confirm with `curl -sI https://dotbro.in | grep -i server` → `GitHub.com`.

## Backend (Supabase, project `fliheqjbwmcoggajovln`, Mumbai)

- Tables: `questions`, `replies`, `reports` (reports have **no public read** — admin RPC only)
- RLS: insert + read only. Nobody edits/deletes via the API
- Rate limits **in the DB** (BEFORE INSERT), **per-IP since 2026-07-29**: questions 5/min·40/day, replies 15/min·120/day, reports 10/min·60/day per visitor, plus a much higher global backstop (120/min·2000/day questions) for a distributed flood. Before this the caps were global, which meant any stranger could hit the cap with curl and block *everyone* for a day
- **The IP comes from `cf-connecting-ip`, never `x-forwarded-for`.** Verified against this project: a client can prepend its own value to `x-forwarded-for` (observed `"9.9.9.9,<real ip>"`), so the `split_part(x-forwarded-for, ',', 1)` pattern in Supabase's own docs reads attacker-controlled data and gives a rate limiter that does nothing. Forging `cf-connecting-ip` is refused by Cloudflare with a 403 before it reaches PostgREST
- Per-IP state lives in `private.rl_hits` as a **salted SHA-256, never a raw IP**, pruned after 2 days, never joined to a question or reply (P5). Both checks **fail open** — no IP means per-IP is skipped and only the global backstop applies, so a bug here can't take the site down
- Admin: `admin_verify` / `admin_delete_question` / `admin_delete_reply` / `admin_reports` — all gate through `private.admin_check`: **bcrypt hash** in `private.admin_secret`, 5 fails / 15 min lockout **per IP** (was global until 2026-07-29 — meaning any stranger could fail 5 times and lock *you* out of moderation, on a loop, forever). A correct passphrase clears that IP's failures; a global backstop at 100 fails/15 min still catches a distributed brute force
- Mod passphrase: same one the old feed admin used (Ron has it). Rotate with:
  `update private.admin_secret set hash = crypt('NEW-PASS', gen_salt('bf',10));`
- The publishable key in the pages is meant to be public. The DB constraints are the security
- **Analytics (2026-07-29):** `public.events` — first-party funnel only (landed → globe_touched → geo prompt/granted/denied → compose opened/abandoned → question_posted → reply viewed/posted → install pill events → session_end w/ dwell secs). **Write-only via the API** (INSERT policy, no SELECT — read it here or in the SQL editor). Anonymous session UUID, coarse device/browser, no IPs, no text, no third parties. Per-IP rate guard (`events_guard`, same hashed pattern), 90-day prune. Client: `track()` in index.html, fire-and-forget

## Working on it

```bash
cd ~/Ron/aLOKaRa/Ventures/dotBRO/www.dotbro.in && claude   # or serve:
python3 -m http.server 8734 --directory ~/Ron/aLOKaRa/Ventures/dotBRO/www.dotbro.in
```
Always cache-bust (`?v=1`, bump each reload) — Chrome serves stale builds silently. `window.__ENGINE.fps()` reads live frame rate. A `window.X is not a function` error inside the engine = missing `window.APP` bridge entry (classic `const`s are invisible to the module).

---

## Open threads (priority order)

1. **Watch the mod page** — moderation exists but someone has to look at it. dotbro.in/mod.html, reported items come up first
2. **Growth loop is built, not used** — every conversation has "copy link" (`/?q=<id>` lands newcomers inside it). The Reddit/Quora play is posting links, which is Ron's move, not code
3. Dated fetches: questions `.limit(300)`, replies fetched unbounded → paginate before ~300 questions
4. Supabase free tier pauses when idle → first visitor after a quiet week sees the "can't reach" banner
5. ~~Per-IP rate limits need an edge function in front of writes~~ — **done 2026-07-29, and no edge function was needed.** `cf-connecting-ip` is readable straight from `current_setting('request.headers')` inside the trigger
6. Vercel remnants: old project IDs in DEPLOY.md are archive-only; GitHub Pages is the truth

## Decisions already made (don't relitigate)

- Real human questions only on the globe (seed deleted 2026-07-28, Ron's call)
- Site = two pages + mod. Everything else lives in `old/`
- No framework rewrite: vanilla + three.js + Supabase is the stack. Portability > vendor magic
- "the alge" is the permanent name for the globe (locked 2026-07-12)
