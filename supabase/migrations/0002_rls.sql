-- =====================================================================
-- Migration 0002: RLS, privilégios e identificação do dispositivo
-- =====================================================================
-- MODELO DE ACESSO ADOTADO (decidido com o orientando):
--
--   O app e o firmware usam a MESMA anon key — no Postgres, os dois são
--   o papel `anon`. O que separa um do outro é o header X-Device-Token,
--   que só o firmware manda.
--
--   * LEITURA: liberada ao anon. Ainda não existe tela de login, então
--     qualquer um com a anon key lê os dados. Isso é aceitável para a
--     bancada/apresentação e está documentado como pendência.
--   * ESCRITA DO FIRMWARE (heartbeat, leitura de peso, registro de
--     alimentação, baixa de comando): NÃO vai direto na tabela. Passa
--     pelas funções da migration 0003, que são SECURITY DEFINER e exigem
--     o X-Device-Token válido. Assim, nem com a anon key na mão alguém
--     forja uma leitura de balança ou marca um comando como executado.
--   * ESCRITA DO APP (criar/editar agendamento, enfileirar comando):
--     liberada ao anon, com validação por CHECK no schema.
--   * devices.device_token NUNCA é lido pelo anon: o privilégio de SELECT
--     é dado coluna a coluna, deixando o token de fora. É por isso que o
--     app deve consultar a view v_devices.
--
-- Quando a tela de login existir, trocar os blocos marcados
-- "TROCAR AO ADICIONAR LOGIN" pelas versões comentadas no fim do arquivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identificação do dispositivo pelo header X-Device-Token.
-- O PostgREST expõe os headers da requisição em request.headers (sempre
-- em minúsculas). Fora do PostgREST a função devolve NULL, o que faz
-- todas as verificações falharem — que é o comportamento desejado.
-- ---------------------------------------------------------------------
create or replace function public.current_device_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.id
    from public.devices d
   where d.device_token = nullif(
           current_setting('request.headers', true)::jsonb ->> 'x-device-token',
           ''
         )
   limit 1;
$$;

comment on function public.current_device_id() is
  'Devolve o id do dispositivo cujo device_token casa com o header X-Device-Token, ou NULL. SECURITY DEFINER porque precisa ler devices.device_token, coluna que o anon não enxerga.';

revoke all on function public.current_device_id() from public;
grant execute on function public.current_device_id() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Privilégios de tabela
-- ---------------------------------------------------------------------
alter table public.devices            enable row level security;
alter table public.pets               enable row level security;
alter table public.hopper_refills     enable row level security;
alter table public.schedules          enable row level security;
alter table public.food_readings      enable row level security;
alter table public.feeding_events     enable row level security;
alter table public.commands           enable row level security;
alter table public.analysis_runs      enable row level security;
alter table public.analysis_clusters  enable row level security;
alter table public.analysis_anomalies enable row level security;

-- devices: SELECT coluna a coluna, SEM device_token, SEM calibração.
revoke all on public.devices from anon, authenticated;
grant select (
  id, name, firmware_version, last_seen, stream_url, snapshot_path,
  hopper_capacity_grams, hopper_grams, hopper_updated_at, created_at
) on public.devices to anon, authenticated;

grant select on public.v_devices to anon, authenticated;

-- demais tabelas: leitura liberada
grant select on
  public.pets,
  public.hopper_refills,
  public.schedules,
  public.food_readings,
  public.feeding_events,
  public.commands,
  public.analysis_runs,
  public.analysis_clusters,
  public.analysis_anomalies
to anon, authenticated;

-- escrita do app
grant insert, update, delete on public.schedules      to anon, authenticated;
grant insert                 on public.commands       to anon, authenticated;
grant insert                 on public.hopper_refills to anon, authenticated;
grant update (name, avatar_url, weight_kg, daily_target_grams)
                             on public.pets           to anon, authenticated;
grant usage, select on sequence public.food_readings_id_seq to anon, authenticated;

-- ---------------------------------------------------------------------
-- POLICIES DE LEITURA  — TROCAR AO ADICIONAR LOGIN
-- ---------------------------------------------------------------------
drop policy if exists app_le_devices on public.devices;
create policy app_le_devices on public.devices
  for select to anon, authenticated using (true);

drop policy if exists app_le_pets on public.pets;
create policy app_le_pets on public.pets
  for select to anon, authenticated using (true);

drop policy if exists app_le_refills on public.hopper_refills;
create policy app_le_refills on public.hopper_refills
  for select to anon, authenticated using (true);

drop policy if exists app_le_schedules on public.schedules;
create policy app_le_schedules on public.schedules
  for select to anon, authenticated using (true);

drop policy if exists app_le_readings on public.food_readings;
create policy app_le_readings on public.food_readings
  for select to anon, authenticated using (true);

drop policy if exists app_le_eventos on public.feeding_events;
create policy app_le_eventos on public.feeding_events
  for select to anon, authenticated using (true);

drop policy if exists app_le_commands on public.commands;
create policy app_le_commands on public.commands
  for select to anon, authenticated using (true);

drop policy if exists app_le_runs on public.analysis_runs;
create policy app_le_runs on public.analysis_runs
  for select to anon, authenticated using (true);

drop policy if exists app_le_clusters on public.analysis_clusters;
create policy app_le_clusters on public.analysis_clusters
  for select to anon, authenticated using (true);

drop policy if exists app_le_anomalias on public.analysis_anomalies;
create policy app_le_anomalias on public.analysis_anomalies
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- POLICIES DE ESCRITA DO APP
-- ---------------------------------------------------------------------
-- Agendamentos: o app cria, edita e apaga livremente, mas só para um
-- dispositivo que existe.
drop policy if exists app_escreve_schedules on public.schedules;
create policy app_escreve_schedules on public.schedules
  for insert to anon, authenticated
  with check (exists (select 1 from public.devices d where d.id = device_id));

drop policy if exists app_edita_schedules on public.schedules;
create policy app_edita_schedules on public.schedules
  for update to anon, authenticated using (true) with check (true);

drop policy if exists app_apaga_schedules on public.schedules;
create policy app_apaga_schedules on public.schedules
  for delete to anon, authenticated using (true);

-- Comandos: o app SÓ enfileira. Nunca marca como executado — quem faz
-- isso é o firmware, pela função da 0003. E só pode enfileirar os tipos
-- que fazem sentido a partir do celular.
drop policy if exists app_enfileira_comando on public.commands;
create policy app_enfileira_comando on public.commands
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and type in ('feed_now','tare','snapshot','sync_time')
    and exists (select 1 from public.devices d where d.id = device_id)
  );

-- Reabastecimento do reservatório: registrado pelo app (botão "enchi o
-- reservatório"), porque a célula de carga está na tigela e não tem como
-- perceber isso sozinha.
drop policy if exists app_registra_refill on public.hopper_refills;
create policy app_registra_refill on public.hopper_refills
  for insert to anon, authenticated
  with check (
    grams_after >= 0
    and exists (select 1 from public.devices d
                 where d.id = device_id and grams_after <= d.hopper_capacity_grams)
  );

drop policy if exists app_edita_pet on public.pets;
create policy app_edita_pet on public.pets
  for update to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- POLICIES DO DISPOSITIVO
-- O firmware normalmente usa as funções da 0003. Estas policies existem
-- para o caso de leitura direta e para deixar explícito o escopo: um
-- dispositivo só enxerga o que é dele.
-- ---------------------------------------------------------------------
drop policy if exists device_le_suas_schedules on public.schedules;
create policy device_le_suas_schedules on public.schedules
  for select to anon, authenticated
  using (device_id = public.current_device_id());

drop policy if exists device_le_seus_commands on public.commands;
create policy device_le_seus_commands on public.commands
  for select to anon, authenticated
  using (device_id = public.current_device_id());

-- =====================================================================
-- STORAGE — bucket de snapshots da ESP32-CAM (fallback da Etapa C)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', true)
on conflict (id) do nothing;

-- Leitura pública: o <img> do app aponta direto para a URL pública.
drop policy if exists snapshots_leitura_publica on storage.objects;
create policy snapshots_leitura_publica on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'snapshots');

-- Escrita só de quem apresentar o X-Device-Token, e só dentro da pasta
-- do próprio dispositivo (snapshots/<device_id>/...).
drop policy if exists snapshots_escrita_dispositivo on storage.objects;
create policy snapshots_escrita_dispositivo on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'snapshots'
    and public.current_device_id() is not null
    and (storage.foldername(name))[1] = public.current_device_id()
  );

drop policy if exists snapshots_update_dispositivo on storage.objects;
create policy snapshots_update_dispositivo on storage.objects
  for update to anon, authenticated
  using (
    bucket_id = 'snapshots'
    and public.current_device_id() is not null
    and (storage.foldername(name))[1] = public.current_device_id()
  );

-- =====================================================================
-- VERSÃO COM LOGIN (aplicar depois, quando houver tela de autenticação)
-- =====================================================================
-- 1) Criar a tabela de vínculo:
--
--    create table public.device_owners (
--      device_id text references public.devices(id) on delete cascade,
--      user_id   uuid references auth.users(id) on delete cascade,
--      primary key (device_id, user_id)
--    );
--
-- 2) Substituir CADA policy `app_*` acima pela forma abaixo, trocando
--    `to anon, authenticated` por `to authenticated` e o `using (true)`
--    por:
--
--    using (exists (
--      select 1 from public.device_owners o
--       where o.device_id = <coluna device_id da tabela>
--         and o.user_id = auth.uid()
--    ))
--
-- 3) Revogar os privilégios do anon:
--    revoke all on all tables in schema public from anon;
--    revoke execute on function public.current_device_id() from anon;
--    (o firmware continua funcionando: ele usa as funções da 0003, que
--     são SECURITY DEFINER — basta manter o grant execute delas ao anon.)
-- =====================================================================
