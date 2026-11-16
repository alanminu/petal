-- Petal sharing backend.
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Design: the server is a dumb, encrypted mailbox.
--   * Each share is a "room" identified by a random UUID that only the two
--     devices know. Its contents are encrypted on the device with a key the
--     server never receives, so nothing stored here is readable.
--   * Tables have row level security on with no policies, so they cannot be
--     read or written directly. All access goes through the functions below.
--   * Only the person tracking holds the write token for a room, so only they
--     can replace the shared view or delete the room.

create table if not exists public.petal_rooms (
  id          uuid primary key,
  write_hash  text not null,
  snapshot    text,
  snapshot_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.petal_messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.petal_rooms (id) on delete cascade,
  sender     text not null check (sender in ('o', 's')),
  payload    text not null,
  created_at timestamptz not null default now()
);

create index if not exists petal_messages_room_idx on public.petal_messages (room_id, id);

alter table public.petal_rooms enable row level security;
alter table public.petal_messages enable row level security;
revoke all on public.petal_rooms from anon, authenticated;
revoke all on public.petal_messages from anon, authenticated;

create or replace function public.petal_token_ok(p_room uuid, p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from petal_rooms
    where id = p_room and write_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  );
$$;

create or replace function public.petal_create_room(p_room uuid, p_write_hash text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_write_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid write hash';
  end if;
  insert into petal_rooms (id, write_hash) values (p_room, p_write_hash);
end;
$$;

create or replace function public.petal_put_snapshot(p_room uuid, p_token text, p_payload text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_payload) > 20000 then
    raise exception 'Snapshot too large';
  end if;
  if not petal_token_ok(p_room, p_token) then
    raise exception 'Not allowed';
  end if;
  update petal_rooms set snapshot = p_payload, snapshot_at = now() where id = p_room;
end;
$$;

-- Returns no row when the room does not exist (sharing was stopped).
create or replace function public.petal_get_snapshot(p_room uuid)
returns table (payload text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select snapshot, snapshot_at from petal_rooms where id = p_room;
$$;

create or replace function public.petal_post_message(p_room uuid, p_sender text, p_payload text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
begin
  if length(p_payload) > 4000 then
    raise exception 'Message too large';
  end if;
  if not exists (select 1 from petal_rooms where id = p_room) then
    raise exception 'Sharing has ended';
  end if;
  insert into petal_messages (room_id, sender, payload)
  values (p_room, p_sender, p_payload)
  returning id into new_id;
  -- Keep only the latest 100 messages per room.
  delete from petal_messages
  where room_id = p_room
    and id <= (select m.id from petal_messages m where m.room_id = p_room order by m.id desc offset 100 limit 1);
  return new_id;
end;
$$;

create or replace function public.petal_get_messages(p_room uuid, p_after bigint default 0)
returns table (id bigint, sender text, payload text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender, m.payload, m.created_at
  from petal_messages m
  where m.room_id = p_room and m.id > p_after
  order by m.id;
$$;

create or replace function public.petal_delete_room(p_room uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not petal_token_ok(p_room, p_token) then
    raise exception 'Not allowed';
  end if;
  delete from petal_rooms where id = p_room;
end;
$$;

revoke all on function public.petal_token_ok(uuid, text) from public, anon, authenticated;
grant execute on function
  public.petal_create_room(uuid, text),
  public.petal_put_snapshot(uuid, text, text),
  public.petal_get_snapshot(uuid),
  public.petal_post_message(uuid, text, text),
  public.petal_get_messages(uuid, bigint),
  public.petal_delete_room(uuid, text)
to anon, authenticated;
