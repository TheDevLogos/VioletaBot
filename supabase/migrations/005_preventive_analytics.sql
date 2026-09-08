-- VioletaBot 3.0 — Analítica preventiva
-- Esta migración YA fue aplicada al proyecto piloto conectado.
-- Conservar en Git para reproducibilidad; no volver a ejecutarla manualmente en el mismo proyecto.

alter table public.organizations
  add column if not exists analytics_enabled boolean not null default true,
  add column if not exists analytics_min_geo_group_size integer not null default 5;

alter table public.organizations
  drop constraint if exists organizations_analytics_min_geo_group_size_check;

alter table public.organizations
  add constraint organizations_analytics_min_geo_group_size_check
  check (analytics_min_geo_group_size between 3 and 20);

create table if not exists public.case_profiles (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  age_band text not null default 'unknown'
    check (age_band in (
      'under_18','18_24','25_34','35_44','45_54','55_64','65_plus','unknown'
    )),

  neighborhood text,
  zone text,
  locality text,

  relationship_to_aggressor text not null default 'unknown'
    check (relationship_to_aggressor in (
      'partner','ex_partner','family','acquaintance','work','community','other','unknown'
    )),

  violence_types text[] not null default '{}',

  recurrence_pattern text not null default 'unknown'
    check (recurrence_pattern in (
      'first_reported_episode','occasional','repeated','escalating','unknown'
    )),

  cohabitation_status text not null default 'unknown'
    check (cohabitation_status in ('yes','no','unknown')),

  minors_present text not null default 'unknown'
    check (minors_present in ('yes','no','unknown')),

  previous_report text not null default 'unknown'
    check (previous_report in ('yes','no','unknown')),

  service_needs text[] not null default '{}',

  case_outcome text not null default 'open'
    check (case_outcome in (
      'open','orientation','therapy_referral','legal_referral','medical_referral',
      'authority_referral','safety_plan','unreachable','closed','other'
    )),

  follow_up_required boolean not null default false,
  statistical_notes text,

  completed_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_profiles_org_idx
  on public.case_profiles(organization_id);

create index if not exists case_profiles_org_neighborhood_idx
  on public.case_profiles(organization_id, neighborhood)
  where neighborhood is not null;

create index if not exists case_profiles_org_zone_idx
  on public.case_profiles(organization_id, zone)
  where zone is not null;

create index if not exists case_profiles_org_age_idx
  on public.case_profiles(organization_id, age_band);

create index if not exists case_profiles_org_relationship_idx
  on public.case_profiles(organization_id, relationship_to_aggressor);

create index if not exists case_profiles_updated_idx
  on public.case_profiles(organization_id, updated_at desc);

alter table public.case_profiles enable row level security;

revoke all on table public.case_profiles from anon, authenticated;
grant select on table public.case_profiles to authenticated;

drop policy if exists org_members_read_case_profiles on public.case_profiles;

create policy org_members_read_case_profiles
on public.case_profiles
for select
to authenticated
using (
  organization_id = (
    select organization_id
    from public.profiles
    where id = (select auth.uid())
  )
);
