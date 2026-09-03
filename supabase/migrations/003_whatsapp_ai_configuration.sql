-- Already applied to the connected pilot Supabase project.
alter table public.organizations
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_waba_id text,
  add column if not exists whatsapp_display_phone text,
  add column if not exists whatsapp_enabled boolean not null default false,
  add column if not exists bot_name text not null default 'Violeta',
  add column if not exists bot_model text not null default 'gpt-5.6-luna';

create unique index if not exists organizations_whatsapp_phone_number_id_uidx
  on public.organizations (whatsapp_phone_number_id)
  where whatsapp_phone_number_id is not null;

create index if not exists organizations_whatsapp_enabled_idx
  on public.organizations (whatsapp_enabled)
  where whatsapp_enabled = true;
