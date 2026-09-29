-- =====================================================================
-- Alimentador automático IoT — Etapa A / migration 0001: SCHEMA
-- PIBIC SISPROJ 59635 — UEA — Eng. de Controle e Automação
-- =====================================================================
-- Aplicar no SQL Editor do Supabase, na ordem 0001 → 0005.
--
-- DECISÃO DE PROJETO REGISTRADA AQUI:
-- a célula de carga fica no COMEDOURO (tigela), não no reservatório.
-- Consequências, que valem para todo o schema:
--   * o peso medido (food_readings.bowl_grams) é o que está NA TIGELA;
--   * quanto o pet comeu (feeding_events.consumed_grams) é MEDIDO:
--     é a queda do peso da tigela depois que a porção caiu nela;
--   * quanto resta no reservatório (devices.hopper_grams) é ESTIMADO
--     por saldo: capacidade - soma das porções liberadas desde o último
--     reabastecimento registrado em hopper_refills.
-- O app deve rotular o nível do reservatório como "estimado".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- devices — um registro por alimentador (ESP32 principal)
-- ---------------------------------------------------------------------
create table if not exists public.devices (
  id                     text        primary key,              -- ex.: 'esp32-01'
  name                   text        not null,
  -- Segredo compartilhado com o firmware. Vai no secrets.h da ESP32 e é
  -- enviado no header X-Device-Token. NUNCA versionar este valor.
  device_token           text        not null unique,
  firmware_version       text        not null default '0.0.0',
  last_seen              timestamptz,                           -- atualizado pelo heartbeat
  stream_url             text        not null default '',       -- MJPEG da ESP32-CAM na rede local
  snapshot_path          text,                                  -- caminho no Storage (fallback)
  -- reservatório (estimado, ver cabeçalho)
  hopper_capacity_grams  numeric(10,2) not null default 2000,
  hopper_grams           numeric(10,2) not null default 0,
  hopper_updated_at      timestamptz not null default now(),
  -- calibração da célula de carga (gravada pelo procedimento de calibração)
  scale_factor           numeric(14,6),                         -- contagens HX711 por grama
  scale_offset           numeric(14,2),                         -- tara
  created_at             timestamptz not null default now()
);

comment on table  public.devices             is 'Alimentadores. Uma linha por ESP32 principal.';
comment on column public.devices.device_token is 'Segredo do firmware. Usado pela RLS via header X-Device-Token. Não versionar.';
comment on column public.devices.hopper_grams is 'Nível do reservatório ESTIMADO por saldo — a célula de carga está na tigela.';

-- ---------------------------------------------------------------------
-- pets
-- ---------------------------------------------------------------------
create table if not exists public.pets (
  id                  uuid primary key default gen_random_uuid(),
  device_id           text not null references public.devices(id) on delete cascade,
  name                text not null,
  avatar_url          text not null default '',
  weight_kg           numeric(5,2) not null default 0,
  daily_target_grams  integer      not null default 0,
  created_at          timestamptz  not null default now()
);

create index if not exists pets_device_idx on public.pets(device_id);

-- ---------------------------------------------------------------------
-- hopper_refills — registro manual de reabastecimento do reservatório.
-- É o que "zera" a estimativa de nível. Sem isso a estimativa só cai.
-- ---------------------------------------------------------------------
create table if not exists public.hopper_refills (
  id           uuid primary key default gen_random_uuid(),
  device_id    text not null references public.devices(id) on delete cascade,
  grams_after  numeric(10,2) not null,   -- quanto ficou no reservatório após encher
  note         text,
  refilled_at  timestamptz not null default now()
);

create index if not exists hopper_refills_device_idx
  on public.hopper_refills(device_id, refilled_at desc);

-- ---------------------------------------------------------------------
-- schedules — agendamentos. A ESP32 baixa esta tabela por polling e
-- executa LOCALMENTE pelo relógio interno (não depende do app aberto).
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id             uuid primary key default gen_random_uuid(),
  device_id      text not null references public.devices(id) on delete cascade,
  label          text not null,
  time_of_day    time not null,                         -- hora local (America/Manaus)
  frequency      text not null default 'daily'
                 check (frequency in ('daily','weekly','once')),
  weekdays       smallint[] not null default '{}',      -- 0=domingo … 6=sábado
  run_date       date,                                  -- usado quando frequency='once'
  portion_grams  integer not null check (portion_grams between 5 and 500),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- coerência: 'weekly' precisa de dias; 'once' precisa de data
  constraint schedules_freq_coerente check (
    (frequency = 'weekly' and array_length(weekdays,1) is not null)
    or (frequency = 'once' and run_date is not null)
    or (frequency = 'daily')
  )
);

create index if not exists schedules_device_idx on public.schedules(device_id, enabled);

comment on column public.schedules.time_of_day is 'Hora LOCAL America/Manaus (UTC-4). O firmware compara com o relógio local sincronizado por NTP.';

-- ---------------------------------------------------------------------
-- food_readings — leituras periódicas da balança da TIGELA
-- ---------------------------------------------------------------------
create table if not exists public.food_readings (
  id            bigserial primary key,
  device_id     text not null references public.devices(id) on delete cascade,
  bowl_grams    numeric(10,2) not null,   -- MEDIDO pela célula de carga
  hopper_grams  numeric(10,2),            -- ESTIMADO, copiado de devices no momento da leitura
  read_at       timestamptz not null default now()
);

create index if not exists food_readings_device_idx
  on public.food_readings(device_id, read_at desc);

-- ---------------------------------------------------------------------
-- feeding_events — uma linha por porção liberada
-- ---------------------------------------------------------------------
create table if not exists public.feeding_events (
  id                uuid primary key default gen_random_uuid(),
  device_id         text not null references public.devices(id) on delete cascade,
  pet_id            uuid references public.pets(id) on delete set null,
  schedule_id       uuid references public.schedules(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  trigger           text not null check (trigger in ('scheduled','manual')),
  grams_target      numeric(10,2) not null,            -- porção pedida
  grams             numeric(10,2) not null,            -- porção realmente liberada (medida na tigela)
  steps_executed    integer,                           -- passos do 28BYJ-48 efetivamente dados
  bowl_grams_after  numeric(10,2) not null,            -- peso da tigela logo após a liberação
  consumed_grams    numeric(10,2) not null default 0,  -- MEDIDO: queda do peso desde a liberação
  consumed          boolean       not null default false,
  settled_at        timestamptz,                       -- null = evento ainda "aberto" (pet ainda pode comer)
  source            text not null default 'device'
                    check (source in ('device','synthetic')),
  created_at        timestamptz not null default now()
);

create index if not exists feeding_events_device_time_idx
  on public.feeding_events(device_id, occurred_at desc);

-- índice para achar rapidamente o evento aberto de cada dispositivo
create index if not exists feeding_events_open_idx
  on public.feeding_events(device_id, occurred_at desc)
  where settled_at is null;

comment on column public.feeding_events.source is
  'device = veio do hardware; synthetic = gerado pelo script do dataset sintético (Etapa E). Permite ao app mostrar o aviso "Dados simulados" com base em dado, não em texto fixo.';

-- ---------------------------------------------------------------------
-- commands — fila de comandos app → ESP32.
-- A ESP32 está atrás de NAT: ela faz polling desta tabela.
-- ---------------------------------------------------------------------
create table if not exists public.commands (
  id            uuid primary key default gen_random_uuid(),
  device_id     text not null references public.devices(id) on delete cascade,
  type          text not null check (type in
                  ('feed_now','tare','calibrate','snapshot','reboot','sync_time')),
  payload       jsonb not null default '{}'::jsonb,   -- ex.: {"grams": 120}
  status        text not null default 'pending'
                check (status in ('pending','claimed','done','failed','expired')),
  result        jsonb,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  completed_at  timestamptz,
  -- comando velho não pode ser executado: evita o alimentador despejar ração
  -- "atrasada" quando o Wi-Fi volta depois de uma queda longa.
  expires_at    timestamptz not null default now() + interval '2 minutes'
);

-- índice parcial: o polling do firmware só olha os pendentes
create index if not exists commands_pending_idx
  on public.commands(device_id, created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------
-- Análise (Etapa E grava aqui; o app só lê)
-- ---------------------------------------------------------------------
create table if not exists public.analysis_runs (
  id            uuid primary key default gen_random_uuid(),
  device_id     text not null references public.devices(id) on delete cascade,
  pet_id        uuid references public.pets(id) on delete set null,
  period_days   integer not null check (period_days in (7,30,90)),
  events_count  integer not null default 0,
  -- 'synthetic' enquanto o dataset for gerado; 'real' quando vier do hardware.
  -- O aviso "Dados simulados — em validação técnica" da aba Análise deve ser
  -- ligado por este campo, e não por um texto fixo no componente.
  dataset_kind  text not null default 'synthetic'
                check (dataset_kind in ('synthetic','real','mixed')),
  k_clusters    integer,
  z_threshold   numeric(4,2),
  notes         text,
  ran_at        timestamptz not null default now()
);

create index if not exists analysis_runs_device_idx
  on public.analysis_runs(device_id, period_days, ran_at desc);

create table if not exists public.analysis_clusters (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.analysis_runs(id) on delete cascade,
  device_id          text not null references public.devices(id) on delete cascade,
  label              text not null,                 -- 'Manhã', 'Tarde', 'Noite'
  start_time         time not null,
  end_time           time not null,
  avg_portion_grams  numeric(10,2) not null,
  event_count        integer not null,
  times_in_minutes   integer[] not null default '{}',  -- minutos desde a meia-noite
  created_at         timestamptz not null default now()
);

create index if not exists analysis_clusters_run_idx on public.analysis_clusters(run_id);

create table if not exists public.analysis_anomalies (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.analysis_runs(id) on delete cascade,
  device_id    text not null references public.devices(id) on delete cascade,
  event_date   date not null,
  type         text not null,
  description  text not null,
  z_score      numeric(6,3) not null,
  severity     text not null check (severity in ('low','medium','high')),
  created_at   timestamptz not null default now()
);

create index if not exists analysis_anomalies_run_idx
  on public.analysis_anomalies(run_id, event_date desc);

-- ---------------------------------------------------------------------
-- updated_at automático em schedules
-- ---------------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists schedules_touch on public.schedules;
create trigger schedules_touch
  before update on public.schedules
  for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------------
-- Cálculo do consumo — o coração da decisão "célula na tigela".
--
-- A cada leitura da balança, fecha-se a conta do último evento ainda
-- aberto: o que saiu da tigela desde a liberação é o que o pet comeu.
--   consumed_grams = bowl_grams_after (na liberação) - bowl_grams (agora)
-- Se o tutor colocar ração na mão, o peso sobe e o valor seria negativo:
-- por isso o greatest(0, ...).
-- O evento é encerrado quando o pet comeu >= 80% da porção, ou depois de
-- 4 h — o que vier primeiro.
-- ---------------------------------------------------------------------
create or replace function public.tg_atualiza_consumo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento public.feeding_events%rowtype;
  v_consumido numeric(10,2);
begin
  select * into v_evento
    from public.feeding_events
   where device_id = new.device_id
     and settled_at is null
   order by occurred_at desc
   limit 1;

  if not found then
    return new;
  end if;

  v_consumido := greatest(0, v_evento.bowl_grams_after - new.bowl_grams);
  -- não pode "comer" mais do que foi liberado
  v_consumido := least(v_consumido, v_evento.grams);

  update public.feeding_events
     set consumed_grams = v_consumido,
         consumed       = (v_consumido >= 0.8 * greatest(v_evento.grams, 1)),
         settled_at     = case
                            when v_consumido >= 0.8 * greatest(v_evento.grams, 1)
                              or v_evento.occurred_at < now() - interval '4 hours'
                            then now()
                            else null
                          end
   where id = v_evento.id;

  return new;
end;
$$;

drop trigger if exists food_readings_consumo on public.food_readings;
create trigger food_readings_consumo
  after insert on public.food_readings
  for each row execute function public.tg_atualiza_consumo();

-- ---------------------------------------------------------------------
-- v_devices — o app lê daqui.
-- Deriva o status online/connecting/offline do heartbeat e NÃO expõe o
-- device_token. security_invoker = a RLS da tabela base continua valendo.
-- ---------------------------------------------------------------------
drop view if exists public.v_devices;
create view public.v_devices
with (security_invoker = true) as
select
  d.id,
  d.name,
  d.firmware_version,
  d.last_seen,
  d.stream_url,
  d.snapshot_path,
  d.hopper_capacity_grams,
  d.hopper_grams,
  d.hopper_updated_at,
  case
    when d.last_seen is null                            then 'offline'
    when d.last_seen > now() - interval '90 seconds'    then 'online'
    when d.last_seen > now() - interval '5 minutes'     then 'connecting'
    else 'offline'
  end as status
from public.devices d;

comment on view public.v_devices is
  'Visão pública dos dispositivos, sem o device_token. status derivado de last_seen: <=90s online, <=5min connecting, senão offline.';
