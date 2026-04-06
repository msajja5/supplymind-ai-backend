-- SupplyMind AI — Initial Database Schema
-- Run once in Supabase SQL Editor or via supabase db push
-- All tables use RLS; enable per-table policies as needed.

-- Extensions
create extension if not exists "uuid-ossp";

-- ── supplier_profiles ────────────────────────────────────────────────────────
create table if not exists supplier_profiles (
  id                     uuid primary key default uuid_generate_v4(),
  supplier_id            text unique not null,
  name                   text,
  state_code             text default 'KA',
  process                text,
  solar_kwh_capacity     numeric default 0,
  recycled_material_pct  numeric default 0 check (recycled_material_pct between 0 and 100),
  recycled_water_litres  numeric default 0,
  fuel_type              text default 'diesel',
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ── camera_readings ──────────────────────────────────────────────────────────
create table if not exists camera_readings (
  id                      uuid primary key default uuid_generate_v4(),
  reading_id              text unique,
  supplier_id             text not null references supplier_profiles(supplier_id) on delete cascade,
  supplier_name           text,
  captured_at             timestamptz default now(),
  energy_kwh              numeric,
  water_liters            numeric,
  waste_kg                numeric,
  co2_sensor_ppm          numeric,
  temperature_c           numeric,
  worker_count            int,
  anomaly_flag            boolean default false,
  anomaly_type            text,
  solar_kwh               numeric default 0,
  recycled_water_litres   numeric default 0,
  source                  text default 'ai_camera',
  created_at              timestamptz default now()
);
create index if not exists idx_camera_supplier on camera_readings(supplier_id);
create index if not exists idx_camera_captured on camera_readings(captured_at desc);

-- ── wa_messages ──────────────────────────────────────────────────────────────
create table if not exists wa_messages (
  id           uuid primary key default uuid_generate_v4(),
  message_id   text unique,
  supplier_id  text,
  phone        text,
  body         text,
  media_url    text,
  direction    text default 'inbound',
  received_at  timestamptz default now(),
  created_at   timestamptz default now()
);

-- ── wa_documents ─────────────────────────────────────────────────────────────
create table if not exists wa_documents (
  id           uuid primary key default uuid_generate_v4(),
  document_id  text unique,
  supplier_id  text,
  message_id   text references wa_messages(message_id),
  doc_type     text,
  filename     text,
  media_url    text,
  verified     boolean default false,
  parsed_at    timestamptz,
  created_at   timestamptz default now()
);

-- ── wa_extractions ───────────────────────────────────────────────────────────
create table if not exists wa_extractions (
  id            uuid primary key default uuid_generate_v4(),
  extraction_id text unique,
  document_id   text references wa_documents(document_id),
  supplier_id   text,
  fields        jsonb,
  raw_text      text,
  created_at    timestamptz default now()
);

-- ── wa_esg_entries ───────────────────────────────────────────────────────────
create table if not exists wa_esg_entries (
  id                    uuid primary key default uuid_generate_v4(),
  entry_id              text unique,
  supplier_id           text not null,
  doc_type              text,
  received_at           timestamptz default now(),
  energy_kwh            numeric default 0,
  co2e_kg               numeric default 0,
  verified              boolean default false,
  green_inputs          jsonb default '{}'::jsonb,
  created_at            timestamptz default now()
);
create index if not exists idx_wa_esg_supplier on wa_esg_entries(supplier_id);

-- ── passports ────────────────────────────────────────────────────────────────
create table if not exists passports (
  id           uuid primary key default uuid_generate_v4(),
  passport_id  text unique,
  supplier_id  text,
  product      jsonb,
  logistics    jsonb,
  financials   jsonb,
  supplier     jsonb,
  issued_at    timestamptz default now(),
  created_at   timestamptz default now()
);
create index if not exists idx_passports_supplier on passports(supplier_id);

-- ── esg_snapshots (time-series ESG history) ──────────────────────────────────
create table if not exists esg_snapshots (
  id                     uuid primary key default uuid_generate_v4(),
  supplier_id            text not null,
  merged_at              timestamptz default now(),
  esg_score              numeric,
  band                   text,
  total_tco2e            numeric,
  green_reduction_pct    numeric,
  scope1_tco2e           numeric,
  scope2_tco2e           numeric,
  scope3_tco2e           numeric,
  solar_kwh              numeric,
  recycled_material_pct  numeric,
  full_report            jsonb,
  created_at             timestamptz default now()
);
create index if not exists idx_snapshots_supplier on esg_snapshots(supplier_id);
create index if not exists idx_snapshots_merged   on esg_snapshots(merged_at desc);

-- ── ingest_log ────────────────────────────────────────────────────────────────
create table if not exists ingest_log (
  id         uuid primary key default uuid_generate_v4(),
  event      text,
  batch_id   text,
  channel    text,
  status     text,
  meta       jsonb,
  logged_at  timestamptz default now()
);

-- ── Row Level Security (enable, lock down later) ──────────────────────────────
alter table supplier_profiles enable row level security;
alter table camera_readings    enable row level security;
alter table wa_esg_entries     enable row level security;
alter table esg_snapshots      enable row level security;
alter table passports          enable row level security;

-- Service role bypass (backend uses service_role key)
create policy "service_role_all" on supplier_profiles  for all using (true);
create policy "service_role_all" on camera_readings     for all using (true);
create policy "service_role_all" on wa_esg_entries      for all using (true);
create policy "service_role_all" on esg_snapshots       for all using (true);
create policy "service_role_all" on passports           for all using (true);
