-- Notifications push : appareils abonnés, file d'envoi (messages chiffrés) et configuration privée.
create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "Mes appareils" on public.push_subs;
create policy "Mes appareils" on public.push_subs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.push_subs from anon;
grant select, insert, update, delete on public.push_subs to authenticated;

create table if not exists public.push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sub_id uuid not null references public.push_subs(id) on delete cascade,
  fire_at timestamptz not null,
  payload text not null,
  sent boolean not null default false
);
create index if not exists push_queue_due on public.push_queue (fire_at) where not sent;
create index if not exists push_queue_user on public.push_queue (user_id);
alter table public.push_queue enable row level security;
drop policy if exists "Mes notifications" on public.push_queue;
create policy "Mes notifications" on public.push_queue for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.push_subs s where s.id = sub_id and s.user_id = (select auth.uid())));
revoke all on public.push_queue from anon;
grant select, insert, update, delete on public.push_queue to authenticated;

-- Clés VAPID : RLS activé sans aucune règle = invisible pour les utilisateurs ; seule la fonction serveur y accède.
create table if not exists public.push_config (id int primary key default 1, public_key text not null, private_jwk jsonb not null);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
grant all on public.push_config, public.push_subs, public.push_queue to service_role;

-- Envoi automatique chaque minute
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('mlm-push') where exists (select 1 from cron.job where jobname = 'mlm-push');
select cron.schedule('mlm-push', '* * * * *',
  $$select net.http_post(url := 'https://ualaypljpclvvuxgcgro.supabase.co/functions/v1/push', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)$$);
