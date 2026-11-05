-- AURA initial schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;
create sequence if not exists public.aura_id_seq start 100001;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  aura_id bigint unique not null default nextval('public.aura_id_seq'),
  username text unique,
  display_name text not null default 'AURA user',
  bio text not null default '',
  avatar_url text,
  cover_url text,
  premium_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[a-z0-9_]{5,32}$'),
  constraint bio_length check (char_length(bio) <= 160),
  constraint display_name_length check (char_length(display_name) between 1 and 48)
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  emoji text not null,
  rarity text not null check (rarity in ('Обычный','Редкий','Эпический','Легендарный')),
  description text not null default '',
  limited boolean not null default false,
  active boolean not null default true,
  free_daily_limit integer not null default 1 check (free_daily_limit between 0 and 10),
  created_at timestamptz not null default now()
);

create table if not exists public.user_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gift_id uuid not null references public.gifts(id),
  serial_number bigint generated always as identity,
  acquired_at timestamptz not null default now(),
  source text not null default 'free' check (source in ('free','purchase','transfer','admin')),
  unique(user_id,gift_id,serial_number)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists profiles_username_idx on public.profiles(username);

-- Seed demo catalogue. The gifts are in-app collectibles, not blockchain assets.
insert into public.gifts(slug,title,emoji,rarity,description,limited,free_daily_limit)
values
 ('moonlight','Moonlight','🌙','Обычный','Тихое сияние ночи',false,1),
 ('crystal-heart','Crystal Heart','💎','Редкий','Кристалл особенной связи',false,1),
 ('orbit','Orbit','🪐','Эпический','Маленькая личная галактика',false,1),
 ('velvet-rose','Velvet Rose','🌹','Легендарный','Цветок, который не увядает',true,1),
 ('starlight','Starlight','⭐','Редкий','Пойманная звезда',false,1),
 ('soft-bear','Soft Bear','🧸','Эпический','Тёплый цифровой талисман',true,1)
on conflict(slug) do nothing;

-- Create profile automatically on sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'AURA user'))
  on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- A user may claim one free copy of a given gift per UTC day.
create or replace function public.claim_free_gift(p_gift_slug text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_gift public.gifts; v_owned uuid;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  select * into v_gift from public.gifts where slug=p_gift_slug and active=true;
  if not found then raise exception 'Подарок недоступен'; end if;
  if v_gift.free_daily_limit < 1 then raise exception 'Этот подарок нельзя получить бесплатно'; end if;
  if exists (
    select 1 from public.user_gifts ug
    where ug.user_id=auth.uid() and ug.gift_id=v_gift.id
      and ug.source='free' and ug.acquired_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
  ) then raise exception 'Сегодня ты уже забрал этот подарок'; end if;
  insert into public.user_gifts(user_id,gift_id,source)
  values(auth.uid(),v_gift.id,'free') returning id into v_owned;
  return v_owned;
end;
$$;

alter table public.profiles enable row level security;
alter table public.gifts enable row level security;
alter table public.user_gifts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "Profiles are viewable by authenticated users" on public.profiles
for select to authenticated using (true);
create policy "Users insert their own profile" on public.profiles
for insert to authenticated with check (auth.uid()=id);
create policy "Users update their own profile" on public.profiles
for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);

create policy "Authenticated users can view active gifts" on public.gifts
for select to authenticated using (active=true);
create policy "Users view their own gifts" on public.user_gifts
for select to authenticated using (auth.uid()=user_id);

create policy "Members can view conversations" on public.conversations
for select to authenticated using (
  exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=auth.uid())
);
create policy "Authenticated users can create conversations" on public.conversations
for insert to authenticated with check (auth.uid()=created_by);
create policy "Members can view membership" on public.conversation_members
for select to authenticated using (
  exists(select 1 from public.conversation_members mine where mine.conversation_id=conversation_id and mine.user_id=auth.uid())
);
create policy "Conversation creator adds members" on public.conversation_members
for insert to authenticated with check (
  exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=auth.uid())
  or user_id=auth.uid()
);
create policy "Members can read messages" on public.messages
for select to authenticated using (
  exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid())
);
create policy "Members can send messages as themselves" on public.messages
for insert to authenticated with check (
  sender_id=auth.uid() and exists(
    select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()
  )
);

-- Realtime is used by the frontend for new messages.
alter publication supabase_realtime add table public.messages;
