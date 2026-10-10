-- dotBRO live chat: database setup. Project: fliheqjbwmcoggajovln (the one www.dotbro.in already uses).
-- Run ONCE in the Supabase SQL Editor, as the project owner. It only adds new objects; it changes nothing that exists.
-- Design: the table is closed to the public. Visitors can only call two functions, and a visitor can only read the thread whose
-- random id (a UUID kept in their own browser) they know. Replies from the team are inserted by you in the SQL Editor (see PART 2).

-- ===== PART 1: create =====
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  thread      uuid        not null,
  sender      text        not null check (sender in ('visitor', 'team')),
  name        text        check (name is null or char_length(name) <= 60),
  body        text        not null check (char_length(body) between 1 and 600),
  lang        text        check (lang is null or char_length(lang) <= 12),   -- visitor's language code, e.g. hi, bn, en
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread, id);

alter table public.chat_messages enable row level security;      -- no policies on purpose: nobody gets direct access
revoke all on public.chat_messages from anon, authenticated;

create or replace function public.chat_send(p_thread uuid, p_name text, p_body text, p_hp text default '', p_lang text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  if coalesce(p_hp, '') <> '' then                         -- honeypot field filled in: a bot. Pretend it worked.
    return json_build_object('ok', true);
  end if;
  if p_thread is null then
    return json_build_object('ok', false, 'error', 'Something went wrong. Please reload the page.');
  end if;
  p_body := btrim(coalesce(p_body, ''));
  p_name := nullif(btrim(coalesce(p_name, '')), '');
  if char_length(p_body) < 1 or char_length(p_body) > 600 then
    return json_build_object('ok', false, 'error', 'Please keep the message between 1 and 600 characters.');
  end if;
  if p_name is not null and char_length(p_name) > 60 then
    p_name := left(p_name, 60);
  end if;

  select count(*) into v_recent from public.chat_messages
    where thread = p_thread and sender = 'visitor' and created_at > now() - interval '1 minute';
  if v_recent >= 8 then
    return json_build_object('ok', false, 'error', 'You are sending very fast. Please wait a moment.');
  end if;

  select count(*) into v_recent from public.chat_messages
    where sender = 'visitor' and created_at > now() - interval '1 hour';
  if v_recent >= 600 then                                  -- flood guard for the whole site
    return json_build_object('ok', false, 'error', 'Chat is very busy right now. Please try again in a little while.');
  end if;

  p_lang := left(nullif(btrim(coalesce(p_lang, '')), ''), 12);
  insert into public.chat_messages (thread, sender, name, body, lang) values (p_thread, 'visitor', p_name, p_body, p_lang);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.chat_read(p_thread uuid, p_after bigint default 0)
returns table (id bigint, sender text, name text, body text, created_at timestamptz, lang text)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.sender, m.name, m.body, m.created_at, m.lang
  from public.chat_messages m
  where m.thread = p_thread and m.id > coalesce(p_after, 0)
  order by m.id
  limit 200;
$$;

revoke all on function public.chat_send(uuid, text, text, text, text) from public;
revoke all on function public.chat_read(uuid, bigint) from public;
grant execute on function public.chat_send(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.chat_read(uuid, bigint) to anon, authenticated;

-- ===== PART 2: how the team reads and answers (SQL Editor) =====
-- Newest conversations first:
--   select thread, max(created_at) as last_at, count(*) as messages,
--          (array_agg(name order by id) filter (where sender = 'visitor'))[1] as visitor
--   from public.chat_messages group by thread order by last_at desc limit 20;
-- Read one conversation:
--   select id, sender, name, lang, body, created_at from public.chat_messages where thread = '<THREAD-ID>' order by id;
-- Reply in the visitor's own language (the `lang` column tells you which; the visitor's browser also translates it when it can).
-- The visitor sees it within about 5 seconds if the chat box is open:
--   insert into public.chat_messages (thread, sender, name, body) values ('<THREAD-ID>', 'team', 'dotBRO team', 'Your reply here');

-- ===== PART 3: undo (removes everything this file made, including all messages) =====
--   drop function if exists public.chat_send(uuid, text, text, text, text);
--   drop function if exists public.chat_read(uuid, bigint);
--   drop table if exists public.chat_messages;
