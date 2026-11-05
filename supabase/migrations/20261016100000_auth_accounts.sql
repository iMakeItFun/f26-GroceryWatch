alter table profiles
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists password_salt text,
  add column if not exists created_at timestamptz not null default now();

update profiles
set email = 'placeholder@demo.com'
where id = '00000000-0000-0000-0000-000000000001' and email is null;

create unique index if not exists profiles_email_unique
on profiles (lower(email))
where email is not null;

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
