-- Run in Supabase: Dashboard -> SQL Editor -> paste -> Run. Safe to run again. See signups in Table Editor -> waitlist.
-- The site's public key can only add rows. Nobody can read the list without the secret key (or the dashboard).
create table if not exists public.waitlist (
  email text primary key check (email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
-- Optional. 7-15 digits (the international max), any spaces, dashes, brackets or leading + allowed.
alter table public.waitlist add column if not exists phone text
  check (phone is null or (length(phone) <= 30 and phone ~ '^\+?[0-9 ().-]+$' and length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15));

alter table public.waitlist enable row level security;
drop policy if exists "anyone can join" on public.waitlist;
create policy "anyone can join" on public.waitlist for insert to anon with check (true);

revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon;

-- Admin dashboard (/admin): one signed-in admin can read the list.
-- 1. Authentication -> Users -> Add user (email + password, auto-confirm).
-- 2. Put that email below in place of ADMIN_EMAIL, then run this file again.
-- 3. Authentication -> Sign In / Providers: turn off "Allow new users to sign up".
drop policy if exists "admin can read" on public.waitlist;
create policy "admin can read" on public.waitlist for select to authenticated using ((auth.jwt() ->> 'email') = 'jaztulsi99@gmail.com');
grant select on public.waitlist to authenticated;
