-- dotBRO public chat ROOM ("Everyone" tab): anyone on dotbro.in can talk to everyone else online. Project: fliheqjbwmcoggajovln.
-- Run ONCE in the Supabase SQL Editor, AFTER chat-schema.sql and chat-inbox-schema.sql (it uses the inbox passphrase check). Only adds new things.
--
-- Privacy and safety design (the "IP guidelines"):
--  * A visitor's IP address is NEVER stored as text. The server turns it into a scrambled code (SHA-256 with a private salt) used only
--    to slow spam and to block abusers. The code is never shown to other visitors and is erased from messages after 7 days.
--  * Blocks (bans) last at most 7 days and are made only from the team inbox.
--  * No links, email addresses or phone numbers are allowed in room messages (protects people, stops spam and scams).
--  * Names cannot pretend to be the team (dotbro, team, admin, moderator).
--  * The table is closed. Visitors can only call two functions: send, and read the latest 100 public messages.
--  * The team can delete any message, block the sender, and post as "dotBRO team" from inbox.html (passphrase needed).

create table if not exists public.chat_room (
  id          bigint generated always as identity primary key,
  sender      text        not null default 'visitor' check (sender in ('visitor', 'team')),
  handle      text        not null check (char_length(handle) between 1 and 30),
  body        text        not null check (char_length(body) between 1 and 300),
  lang        text        check (lang is null or char_length(lang) <= 12),
  ip_hash     text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists chat_room_id_idx on public.chat_room (id desc) where deleted = false;
create index if not exists chat_room_hash_idx on public.chat_room (ip_hash, created_at);

create table if not exists public.chat_room_bans (
  ip_hash  text primary key,
  until    timestamptz not null,
  reason   text
);
create table if not exists public.chat_room_secret (
  id    int primary key default 1 check (id = 1),
  salt  text not null default gen_random_uuid()::text
);
insert into public.chat_room_secret (id) values (1) on conflict do nothing;

alter table public.chat_room enable row level security;
alter table public.chat_room_bans enable row level security;
alter table public.chat_room_secret enable row level security;
revoke all on public.chat_room, public.chat_room_bans, public.chat_room_secret from anon, authenticated;

-- Scrambled code for the caller (never the raw address). Falls back to the browser's random id if no address is visible.
create or replace function public.chat_room_key(p_thread uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_h json;
  v_ip text;
  v_salt text;
begin
  begin
    v_h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  exception when others then
    v_h := '{}'::json;
  end;
  v_ip := coalesce(nullif(btrim(v_h->>'cf-connecting-ip'), ''), nullif(btrim(split_part(coalesce(v_h->>'x-forwarded-for', ''), ',', 1)), ''), 'thread:' || coalesce(p_thread::text, 'none'));
  select salt into v_salt from public.chat_room_secret where id = 1;
  return encode(extensions.digest(v_ip || '|' || v_salt, 'sha256'), 'hex');
end;
$$;

create or replace function public.chat_room_send(p_thread uuid, p_name text, p_body text, p_hp text default '', p_lang text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_n int;
  v_id bigint;
begin
  if coalesce(p_hp, '') <> '' then
    return json_build_object('ok', true, 'id', 0);          -- honeypot filled: a bot. Pretend it worked.
  end if;
  if p_thread is null then
    return json_build_object('ok', false, 'error', 'Something went wrong. Please reload the page.');
  end if;

  p_body := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  p_name := left(coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Guest'), 30);
  if char_length(p_body) < 1 or char_length(p_body) > 300 then
    return json_build_object('ok', false, 'error', 'Please keep the message between 1 and 300 characters.');
  end if;
  if lower(p_name) ~ '(dotbro|team|admin|moderator|mod\y)' then
    return json_build_object('ok', false, 'error', 'Please choose a different name.');
  end if;
  if p_body ~* '(https?:|www\.|[a-z0-9]\.(com|in|net|org|io|me|co|app|xyz|ly)(/|\s|$))' or p_name ~* '(https?:|www\.|\.(com|in|net|org))' then
    return json_build_object('ok', false, 'error', 'Links are not allowed in the room.');
  end if;
  if p_body ~ '\S+@\S+' or p_body ~ '(\d[ .-]?){7,}' then
    return json_build_object('ok', false, 'error', 'For your safety, please do not share phone numbers, emails or other contact details here.');
  end if;

  v_hash := public.chat_room_key(p_thread);
  if exists (select 1 from public.chat_room_bans where ip_hash = v_hash and until > now()) then
    return json_build_object('ok', false, 'error', 'You cannot post in the room right now.');
  end if;

  select count(*) into v_n from public.chat_room where ip_hash = v_hash and created_at > now() - interval '1 minute';
  if v_n >= 5 then
    return json_build_object('ok', false, 'error', 'You are sending very fast. Please wait a moment.');
  end if;
  select count(*) into v_n from public.chat_room where ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_n >= 60 then
    return json_build_object('ok', false, 'error', 'You have sent a lot of messages. Please take a short break.');
  end if;
  if exists (select 1 from public.chat_room where ip_hash = v_hash and body = p_body and created_at > now() - interval '2 minutes') then
    return json_build_object('ok', false, 'error', 'You already said that.');
  end if;
  select count(*) into v_n from public.chat_room where sender = 'visitor' and created_at > now() - interval '1 hour';
  if v_n >= 1500 then
    return json_build_object('ok', false, 'error', 'The room is very busy right now. Please try again in a little while.');
  end if;

  p_lang := left(nullif(btrim(coalesce(p_lang, '')), ''), 12);
  insert into public.chat_room (sender, handle, body, lang, ip_hash) values ('visitor', p_name, p_body, p_lang, v_hash) returning id into v_id;

  if random() < 0.02 then                                  -- tidy up now and then: scrambled codes older than 7 days, expired blocks
    update public.chat_room set ip_hash = null where ip_hash is not null and created_at < now() - interval '7 days';
    delete from public.chat_room_bans where until < now();
  end if;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- The latest 100 messages that have not been removed. No scrambled codes are returned.
create or replace function public.chat_room_read()
returns table (id bigint, sender text, handle text, body text, lang text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select x.id, x.sender, x.handle, x.body, x.lang, x.created_at
  from (select r.* from public.chat_room r where r.deleted = false order by r.id desc limit 100) x
  order by x.id;
$$;

revoke all on function public.chat_room_key(uuid) from public, anon, authenticated;
revoke all on function public.chat_room_send(uuid, text, text, text, text) from public;
revoke all on function public.chat_room_read() from public;
grant execute on function public.chat_room_send(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.chat_room_read() to anon, authenticated;

-- ===== Team side (inbox.html, needs the inbox passphrase) =====
create or replace function public.chat_admin_room_list(p_pass text)
returns table (id bigint, sender text, handle text, body text, lang text, created_at timestamptz, deleted boolean, who text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.chat_admin_ok(p_pass) then return; end if;
  return query
    select r.id, r.sender, r.handle, r.body, r.lang, r.created_at, r.deleted, left(r.ip_hash, 6)
    from public.chat_room r order by r.id desc limit 200;
end;
$$;

create or replace function public.chat_admin_room_delete(p_pass text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.chat_admin_ok(p_pass) then return json_build_object('ok', false, 'error', 'Not allowed.'); end if;
  update public.chat_room set deleted = true where id = p_id;
  return json_build_object('ok', true);
end;
$$;

-- Delete this message AND everything that sender wrote in the last 24 hours, and block them for p_hours (1 to 168).
create or replace function public.chat_admin_room_ban(p_pass text, p_id bigint, p_hours int default 24)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if not public.chat_admin_ok(p_pass) then return json_build_object('ok', false, 'error', 'Not allowed.'); end if;
  select ip_hash into v_hash from public.chat_room where id = p_id;
  if v_hash is null then
    update public.chat_room set deleted = true where id = p_id;
    return json_build_object('ok', true, 'note', 'Message deleted. The sender code is already erased (older than 7 days), so no block was possible.');
  end if;
  p_hours := least(greatest(coalesce(p_hours, 24), 1), 168);
  insert into public.chat_room_bans (ip_hash, until, reason) values (v_hash, now() + make_interval(hours => p_hours), 'blocked from inbox')
    on conflict (ip_hash) do update set until = excluded.until;
  update public.chat_room set deleted = true where ip_hash = v_hash and created_at > now() - interval '24 hours';
  return json_build_object('ok', true, 'note', 'Deleted and blocked for ' || p_hours || ' hours.');
end;
$$;

create or replace function public.chat_admin_room_post(p_pass text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.chat_admin_ok(p_pass) then return json_build_object('ok', false, 'error', 'Not allowed.'); end if;
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) < 1 or char_length(p_body) > 300 then
    return json_build_object('ok', false, 'error', 'Keep it between 1 and 300 characters.');
  end if;
  insert into public.chat_room (sender, handle, body) values ('team', 'dotBRO team', p_body);
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.chat_admin_room_list(text) from public;
revoke all on function public.chat_admin_room_delete(text, bigint) from public;
revoke all on function public.chat_admin_room_ban(text, bigint, int) from public;
revoke all on function public.chat_admin_room_post(text, text) from public;
grant execute on function public.chat_admin_room_list(text) to anon, authenticated;
grant execute on function public.chat_admin_room_delete(text, bigint) to anon, authenticated;
grant execute on function public.chat_admin_room_ban(text, bigint, int) to anon, authenticated;
grant execute on function public.chat_admin_room_post(text, text) to anon, authenticated;

-- ===== Undo (removes the room and everything in it) =====
--   drop function if exists public.chat_admin_room_post(text, text);
--   drop function if exists public.chat_admin_room_ban(text, bigint, int);
--   drop function if exists public.chat_admin_room_delete(text, bigint);
--   drop function if exists public.chat_admin_room_list(text);
--   drop function if exists public.chat_room_read();
--   drop function if exists public.chat_room_send(uuid, text, text, text, text);
--   drop function if exists public.chat_room_key(uuid);
--   drop table if exists public.chat_room_secret;
--   drop table if exists public.chat_room_bans;
--   drop table if exists public.chat_room;
