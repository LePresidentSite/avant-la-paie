-- Compteur public de l'offre Early Bird "Acces a vie"
-- Les 100 premiers comptes avec status = 'lifetime' gardent le prix de lancement.

create or replace function public.get_lifetime_offer_status()
returns table (
  limit_total integer,
  sold integer,
  remaining integer,
  is_early_bird boolean
)
language sql
security definer
set search_path = public
as $$
  select
    100 as limit_total,
    count(*)::integer as sold,
    greatest(100 - count(*)::integer, 0) as remaining,
    count(*) < 100 as is_early_bird
  from public.subscriptions
  where status = 'lifetime';
$$;

revoke all on function public.get_lifetime_offer_status() from public;
grant execute on function public.get_lifetime_offer_status() to anon, authenticated, service_role;
