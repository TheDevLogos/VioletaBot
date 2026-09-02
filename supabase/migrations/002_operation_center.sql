-- VioletaBot Operation Center / multi-tenant staff administration and simulator.
-- Production was reconciled through Supabase before this file was generated.
create schema if not exists private;
create table if not exists private.admin_invites(email text primary key,organization_id uuid not null references public.organizations(id),full_name text not null,role text not null,created_at timestamptz not null default now(),consumed_at timestamptz);
revoke all on table private.admin_invites from public,anon,authenticated;

alter table public.organizations add column if not exists active boolean not null default true;
alter table public.organizations add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists must_change_password boolean not null default false;

alter table public.conversations add column if not exists channel text not null default 'whatsapp';
alter table public.conversations add column if not exists is_test boolean not null default false;
alter table public.conversations add column if not exists subject_label text;
alter table public.conversations add column if not exists assigned_to uuid references public.profiles(id);
alter table public.conversations add column if not exists assigned_by uuid references public.profiles(id);
alter table public.conversations add column if not exists assigned_at timestamptz;
alter table public.conversations add column if not exists closed_reason text;
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check check(channel in('whatsapp','simulator'));
create index if not exists conversations_org_channel_updated_idx on public.conversations(organization_id,channel,updated_at desc);
create index if not exists conversations_assigned_to_idx on public.conversations(assigned_to) where assigned_to is not null;

create table if not exists public.case_notes(id bigint generated always as identity primary key,conversation_id uuid not null references public.conversations(id) on delete cascade,organization_id uuid not null references public.organizations(id) on delete cascade,author_id uuid not null references auth.users(id),note text not null check(char_length(note) between 1 and 5000),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists case_notes_conversation_created_idx on public.case_notes(conversation_id,created_at desc);
alter table public.case_notes enable row level security;
revoke all on table public.case_notes from anon,authenticated;
grant select on table public.case_notes to authenticated;
grant all on table public.case_notes to service_role;
grant usage,select on sequence public.case_notes_id_seq to service_role;
drop policy if exists org_members_read_case_notes on public.case_notes;
create policy org_members_read_case_notes on public.case_notes for select to authenticated using(organization_id=(select organization_id from public.profiles where id=(select auth.uid())));

create table if not exists public.staff_invites(id uuid primary key default gen_random_uuid(),email text not null,organization_id uuid not null references public.organizations(id) on delete cascade,full_name text not null,role text not null check(role in('admin','supervisor','operator','auditor')),invited_by uuid references auth.users(id),status text not null default 'pending' check(status in('pending','accepted','cancelled','error')),auth_user_id uuid references auth.users(id),last_error text,created_at timestamptz not null default now(),accepted_at timestamptz);
create unique index if not exists staff_invites_pending_email_idx on public.staff_invites(lower(email)) where status='pending';
alter table public.staff_invites enable row level security;
revoke all on table public.staff_invites from anon,authenticated;
grant all on table public.staff_invites to service_role;

-- Requires the legacy private.admin_invites table created during initial provisioning.
create or replace function private.provision_violeta_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare staff_inv public.staff_invites%rowtype; legacy_inv private.admin_invites%rowtype;
begin
 if new.email is null then return new; end if;
 select * into staff_inv from public.staff_invites where lower(email)=lower(new.email) and status='pending' order by created_at desc limit 1;
 if staff_inv.id is not null then
  insert into public.profiles(id,organization_id,full_name,role,active,must_change_password,updated_at) values(new.id,staff_inv.organization_id,staff_inv.full_name,staff_inv.role,true,true,now()) on conflict(id) do update set organization_id=excluded.organization_id,full_name=excluded.full_name,role=excluded.role,active=true,must_change_password=true,updated_at=now();
  update public.staff_invites set status='accepted',auth_user_id=new.id,accepted_at=now(),last_error=null where id=staff_inv.id; return new;
 end if;
 select * into legacy_inv from private.admin_invites where lower(email)=lower(new.email) and consumed_at is null limit 1;
 if legacy_inv.email is not null then insert into public.profiles(id,organization_id,full_name,role,active,must_change_password,updated_at) values(new.id,legacy_inv.organization_id,legacy_inv.full_name,legacy_inv.role,true,false,now()) on conflict(id) do update set organization_id=excluded.organization_id,full_name=excluded.full_name,role=excluded.role,active=true,updated_at=now(); update private.admin_invites set consumed_at=now() where lower(email)=lower(new.email); end if;
 return new;
end$$;
revoke all on function private.provision_violeta_profile() from public,anon,authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created_provision_violeta') THEN
    CREATE TRIGGER on_auth_user_created_provision_violeta AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.provision_violeta_profile();
  END IF;
END $$;
