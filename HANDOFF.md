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
- Rate limits **in the DB** (BEFORE INSERT): questions 10/min·200/day, replies 30/min·600/day, reports 20/min·400/day. Global caps, not per-IP (PostgREST has no caller IP — per-IP needs an edge function in front)
- Admin: `admin_verify` / `admin_delete_question` / `admin_delete_reply` / `admin_reports` — all gate through `private.admin_check`: **bcrypt hash** in `private.admin_secret`, 5 fails / 15 min lockout
- Mod passphrase: same one the old feed admin used (Ron has it). Rotate with:
  `update private.admin_secret set hash = crypt('NEW-PASS', gen_salt('bf',10));`
- The publishable key in the pages is meant to be public. The DB constraints are the security

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
5. Per-IP rate limits need an edge function in front of writes (only matters if a real flood comes)
6. Vercel remnants: old project IDs in DEPLOY.md are archive-only; GitHub Pages is the truth

## Decisions already made (don't relitigate)

- Real human questions only on the globe (seed deleted 2026-07-28, Ron's call)
- Site = two pages + mod. Everything else lives in `old/`
- No framework rewrite: vanilla + three.js + Supabase is the stack. Portability > vendor magic
- "the alge" is the permanent name for the globe (locked 2026-07-12)
