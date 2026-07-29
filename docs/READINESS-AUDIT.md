# Are we ready for real human users?

*Audit of dotbro.in / alge.html — 2026-07-28. Scope: the live globe, its backend, the landing page.*

**Short answer: yes for a small, invited group. No for a public link you can't take back.**

> **Update 2026-07-28 — the three blockers below are CLOSED:** `/mod.html` (passphrase-gated
> moderation: delete questions/replies, reported items pinned first), a "report" control in every
> conversation sheet, admin passphrase now bcrypt-hashed in a `private` schema with a
> 5-fails/15-min lockout, `parbro_register` revoked, and DB-side rate limits (BEFORE INSERT
> triggers: questions 10/min·200/day, replies 30/min·600/day, reports 20/min·400/day).
> **Update 2026-07-29 — the global-cap limitation below is CLOSED, and the reasoning that
> left it open was wrong.** The caps are now **per-IP**, done entirely inside the existing
> BEFORE INSERT triggers. "PostgREST exposes no caller IP" is false: `cf-connecting-ip` is
> readable from `current_setting('request.headers')`. No edge function was needed.
>
> This mattered more than "known limit" made it sound. A global 200/day cap meant **any
> stranger with curl could fill it and block every other human for the rest of the day** —
> and the identical flaw in the admin lockout let them lock the moderator out at the same
> time. Both are fixed; see HANDOFF.md for the shape.
>
> One trap worth recording: Supabase's own docs suggest
> `split_part(x-forwarded-for, ',', 1)`. Tested against this project, a client can prepend
> its own value (observed `"9.9.9.9,<real ip>"`), so that pattern reads attacker-controlled
> data and yields a rate limiter that silently does nothing. `cf-connecting-ip` is the only
> trustworthy source here — Cloudflare 403s any attempt to forge it.
>
> Still standing: the `.limit(300)` / unbounded-replies fetch items further down.

The build is sound — it loads, it holds frame rate, it saves what people write, and it no
longer dies when the network misbehaves. What it does not yet have is a way to deal with
people behaving badly, and that is the only thing standing between "share with the cohort"
and "share anywhere".

---

## Fixed in this pass

| Was | Now |
| --- | --- |
| If the supabase-js CDN request failed, the whole script threw at the top level — dead grey page, no globe, no message, forever | Detected; the globe still runs and a banner says nothing can be posted |
| A failed first load showed an empty globe, which reads as "nobody is here" | A red banner with a retry button |
| Blocking `alert()` on every error and validation failure | Non-blocking toast; buttons show "Sending…" and re-enable on failure |
| No throttle at all | Client-side limit (3 conversations/min, 8 replies/min) |
| Globe raster cost 24 ms — could not fit a 16.7 ms frame, so the spin stuttered | 5.3 ms while spinning (measured, same machine) |
| Companion bubble sat on top of the landing-page writing | Takes a clear corner; verified zero overlaps across 28 scroll positions at two widths |

---

## Blockers before a public link

**1. No moderation. This is the real one.**
Anyone can post anonymously with no account. The only way to remove something ugly today is
to open Supabase and run SQL by hand. The first troll, the first doxx, the first slur sits on
a globe you are showing people until you happen to notice it.
*Minimum bar:* a private admin page that lists newest-first with a delete button, and a
"report" control on each conversation. Until that exists, someone has to be watching.

**2. `admin_delete_question` is exposed and weakly protected.**
It is a `SECURITY DEFINER` function callable by the anonymous role over the public REST API,
and it compares a plaintext passphrase with no hashing and no rate limit — so it can be
brute-forced from anywhere. Either `REVOKE EXECUTE ... FROM anon, authenticated` and moderate
through the dashboard, or move it behind real auth. Same applies to `admin_verify`.

**3. The throttle is client-side only, so it is not a throttle.**
The publishable key is in the page source, as it is designed to be. Anyone can `curl` the
REST endpoint in a loop and fill the table. The `localStorage` limit stops accidents and
casual flooding, nothing more. Real limits belong in the database (a per-IP or per-window
insert cap in a `BEFORE INSERT` trigger, or an edge function in front of the writes).

**4. Nothing tells users what happens to what they write.**
Every question and reply is world-readable forever, and there is no delete-my-post path.
There is no privacy note and no terms anywhere on the site. One line near the compose box —
"anyone can read this, and you can't unsend it" — plus a short privacy page is the honest
minimum, and in India it is the safer position too.

**5. The location prompt appears with no explanation.**
About five seconds after landing, the browser asks for location, unprompted and unexplained.
That is a bounce trigger for a first-time visitor and it reads as creepy. Ask only when
someone chooses to post, and say why in one line. (The data itself is handled well — rounded
to 0.1°, roughly 11 km, never finer.)

---

## Will break as it grows — not urgent, but dated

- **Questions are capped at 300.** `listQuestions()` has `.limit(300)`. At 121 today there is
  headroom for 179 more, then the oldest silently stop appearing on the globe. Needs paging
  or a "recent + sampled older" strategy before that.
- **Replies are fetched with no limit at all**, so PostgREST's default cap (1000 rows) applies
  and every reply on the site is downloaded on every page load. This will get slow and then
  wrong. Fetch replies per-conversation when a sheet opens.
- **Supabase free tier pauses when idle.** A quiet week means the next visitor meets the
  "can't reach the space" banner. Already flagged in the project notes; still true.

---

## Checked and fine

- **XSS** — every user-controlled string (name, body, category) goes through `esc()` before
  it reaches `innerHTML`. The tooltip uses `textContent`. No injection path found.
- **Database constraints are real and server-side** — name 1–40 chars, body 3–500, reply kind
  restricted to a fixed set, lat/lon range-checked. A malicious client cannot bypass these.
- **RLS is insert-and-read only.** Nobody can edit or delete anyone's words, including their
  own. (That is also why point 4 above matters.)
- **The write path works end to end** — verified by posting a reply through the real UI and
  confirming the row, then deleting it.
- **Old shared links survive.** `/feed.html#life` forwards to `/alge.html#life` with the
  category filter intact.
- **Degrades honestly.** With the CDN blocked the globe still turns and says what is wrong.

---

## If you only do three things

1. A private moderation page with a delete button.
2. `REVOKE EXECUTE` on the two admin functions from `anon` and `authenticated`.
3. One honest line above the compose box about what posting means.

That is the difference between showing this to people you know and putting it on the open
internet.

---

*Seeded content note: 100 of the 121 conversations are authored by `.bro`, the house account.
They are labelled as such and none impersonate a person. Undo:
`DELETE FROM questions WHERE name = '.bro';` — see `docs/seed/100-questions.sql`.*
