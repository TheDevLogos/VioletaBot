-- VioletaBot Care Network / Emotional Triage
-- Esta migración YA fue aplicada al proyecto piloto conectado.
-- Se conserva en Git para reproducibilidad de nuevos entornos.

alter table public.conversations
  add column if not exists conversation_stage text not null default 'listening',
  add column if not exists last_human_handoff_at timestamptz;

alter table public.messages
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz;

create unique index if not exists messages_provider_message_id_uidx
  on public.messages(provider_message_id)
  where provider_message_id is not null;

create table if not exists public.distress_events (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  distress_level text not null check (distress_level in ('none','mild','moderate','high','severe')),
  self_harm_level text not null check (self_harm_level in ('none','concern','high','imminent')),
  hopelessness boolean not null default false,
  panic_signals boolean not null default false,
  triggers text[] not null default '{}',
  semantic_summary text,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null default 'combined' check (source in ('rules','semantic','combined')),
  created_at timestamptz not null default now()
);

create index if not exists distress_events_conversation_created_idx
  on public.distress_events(conversation_id, created_at desc);
create index if not exists distress_events_self_harm_idx
  on public.distress_events(self_harm_level, created_at desc);
create index if not exists distress_events_distress_idx
  on public.distress_events(distress_level, created_at desc);

create table if not exists public.therapists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  whatsapp_number text not null,
  specialties text[] not null default '{}',
  active boolean not null default true,
  availability_status text not null default 'off_duty'
    check (availability_status in ('available','busy','off_duty')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, whatsapp_number)
);

create index if not exists therapists_org_availability_idx
  on public.therapists(organization_id, active, availability_status);

create table if not exists public.therapist_shifts (
  id bigint generated always as identity primary key,
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','active','completed','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists therapist_shifts_lookup_idx
  on public.therapist_shifts(therapist_id, starts_at, ends_at, status);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  referral_type text not null
    check (referral_type in ('emotional_support','suicide_prevention','violence_support','combined')),
  priority text not null default 'normal'
    check (priority in ('normal','priority','urgent','immediate')),
  status text not null default 'offered'
    check (status in ('offered','consented','queued','assigned','accepted','contacted','in_progress','follow_up','completed','declined','unavailable','cancelled')),
  consent_id bigint references public.consents(id) on delete set null,
  assigned_therapist_id uuid references public.therapists(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  summary text,
  victim_contact_shared boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consented_at timestamptz,
  assigned_at timestamptz,
  accepted_at timestamptz,
  contacted_at timestamptz,
  closed_at timestamptz
);

create index if not exists referrals_org_status_idx
  on public.referrals(organization_id, status, created_at desc);
create index if not exists referrals_conversation_idx
  on public.referrals(conversation_id, created_at desc);
create index if not exists referrals_therapist_idx
  on public.referrals(assigned_therapist_id, status, created_at desc);
create index if not exists referrals_test_idx
  on public.referrals(organization_id,is_test,status,created_at desc);

create table if not exists public.referral_events (
  id bigint generated always as identity primary key,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_type text not null default 'system'
    check (actor_type in ('bot','operator','therapist','system')),
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists referral_events_referral_created_idx
  on public.referral_events(referral_id, created_at desc);
create index if not exists referral_events_org_created_idx
  on public.referral_events(organization_id, created_at desc);

alter table public.distress_events enable row level security;
alter table public.therapists enable row level security;
alter table public.therapist_shifts enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_events enable row level security;

revoke all on table public.distress_events from anon, authenticated;
revoke all on table public.therapists from anon, authenticated;
revoke all on table public.therapist_shifts from anon, authenticated;
revoke all on table public.referrals from anon, authenticated;
revoke all on table public.referral_events from anon, authenticated;

grant select on table public.distress_events to authenticated;
grant select on table public.therapists to authenticated;
grant select on table public.therapist_shifts to authenticated;
grant select on table public.referrals to authenticated;
grant select on table public.referral_events to authenticated;

drop policy if exists org_members_read_distress on public.distress_events;
create policy org_members_read_distress on public.distress_events
for select to authenticated using (
  exists (
    select 1
    from public.conversations c
    join public.profiles p on p.organization_id = c.organization_id
    where c.id = distress_events.conversation_id
      and p.id = (select auth.uid())
  )
);

drop policy if exists org_members_read_therapists on public.therapists;
create policy org_members_read_therapists on public.therapists
for select to authenticated using (
  organization_id = (
    select organization_id
    from public.profiles
    where id = (select auth.uid())
  )
);

drop policy if exists org_members_read_therapist_shifts on public.therapist_shifts;
create policy org_members_read_therapist_shifts on public.therapist_shifts
for select to authenticated using (
  exists (
    select 1
    from public.therapists t
    join public.profiles p on p.organization_id = t.organization_id
    where t.id = therapist_shifts.therapist_id
      and p.id = (select auth.uid())
  )
);

drop policy if exists org_members_read_referrals on public.referrals;
create policy org_members_read_referrals on public.referrals
for select to authenticated using (
  organization_id = (
    select organization_id
    from public.profiles
    where id = (select auth.uid())
  )
);

drop policy if exists org_members_read_referral_events on public.referral_events;
create policy org_members_read_referral_events on public.referral_events
for select to authenticated using (
  organization_id = (
    select organization_id
    from public.profiles
    where id = (select auth.uid())
  )
);
