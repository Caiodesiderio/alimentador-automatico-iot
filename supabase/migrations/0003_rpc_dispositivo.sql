-- =====================================================================
-- Migration 0003: funções chamadas pelo firmware (RPC do PostgREST)
-- =====================================================================
-- Todas são SECURITY DEFINER e começam identificando o dispositivo pelo
-- header X-Device-Token. Se o token não bater, a função levanta erro e o
-- PostgREST devolve 4xx — o firmware nunca escreve nada sem se identificar.
--
-- Do lado do firmware, cada uma é UM POST:
--   POST {SUPABASE_URL}/rest/v1/rpc/<nome>
--   apikey: <anon key>
--   Authorization: Bearer <anon key>
--   X-Device-Token: <segredo do secrets.h>
--   Content-Type: application/json
--   corpo: {"p_xxx": ...}
--
-- Menos chamadas = menos coisa para dar errado em Wi-Fi ruim. Por isso
-- device_heartbeat faz três coisas de uma vez (marca presença, grava a
-- leitura da balança e avisa se há comando na fila) e device_get_config
-- traz agendamentos e ajustes num pacote só.
-- =====================================================================

-- ---------------------------------------------------------------------
-- helper interno: identifica ou falha
-- ---------------------------------------------------------------------
create or replace function public.exige_dispositivo()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_id text;
begin
  v_id := public.current_device_id();
  if v_id is null then
    raise exception 'dispositivo não identificado: header X-Device-Token ausente ou inválido'
      using errcode = '42501';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) HEARTBEAT + LEITURA DE PESO
-- Chamada a cada ~30 s pelo firmware.
-- p_bowl_grams = NULL quando a balança não pôde ser lida (ex.: HX711 fora
-- do ar); nesse caso só a presença é registrada.
-- Devolve a hora do servidor (o firmware usa para conferir o relógio),
-- o nível estimado do reservatório e quantos comandos estão esperando.
-- ---------------------------------------------------------------------
create or replace function public.device_heartbeat(
  p_firmware    text    default null,
  p_bowl_grams  numeric default null,
  p_rssi        integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       text := public.exige_dispositivo();
  v_hopper   numeric;
  v_pending  integer;
begin
  update public.devices
     set last_seen        = now(),
         firmware_version = coalesce(p_firmware, firmware_version)
   where id = v_id
  returning hopper_grams into v_hopper;

  if p_bowl_grams is not null then
    insert into public.food_readings (device_id, bowl_grams, hopper_grams)
    values (v_id, round(p_bowl_grams, 2), v_hopper);
  end if;

  select count(*) into v_pending
    from public.commands
   where device_id = v_id and status = 'pending' and expires_at > now();

  return jsonb_build_object(
    'device_id',        v_id,
    'server_time',      to_char(now() at time zone 'America/Manaus', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'server_epoch',     extract(epoch from now())::bigint,
    'hopper_grams',     v_hopper,
    'pending_commands', v_pending,
    'rssi',             p_rssi
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2) CONFIGURAÇÃO + AGENDAMENTOS
-- Chamada a cada ~5 min (e uma vez no boot). O firmware guarda os
-- agendamentos na memória e os executa pelo relógio interno, sem depender
-- de rede na hora da refeição.
-- ---------------------------------------------------------------------
create or replace function public.device_get_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text := public.exige_dispositivo();
  v_dev public.devices%rowtype;
begin
  select * into v_dev from public.devices where id = v_id;

  return jsonb_build_object(
    'device_id',     v_id,
    'server_epoch',  extract(epoch from now())::bigint,
    'hopper_grams',  v_dev.hopper_grams,
    'hopper_capacity_grams', v_dev.hopper_capacity_grams,
    'scale_factor',  v_dev.scale_factor,
    'scale_offset',  v_dev.scale_offset,
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            s.id,
               'label',         s.label,
               'time',          to_char(s.time_of_day, 'HH24:MI'),
               'frequency',     s.frequency,
               'weekdays',      s.weekdays,
               'date',          s.run_date,
               'portion_grams', s.portion_grams
             ) order by s.time_of_day)
        from public.schedules s
       where s.device_id = v_id and s.enabled
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3) PEGAR COMANDOS DA FILA (polling a cada ~3 s)
-- Marca como 'claimed' na mesma transação: se a resposta se perder no
-- caminho, o comando NÃO é entregue duas vezes — o pet não recebe porção
-- dobrada. Comandos vencidos viram 'expired' e não são executados.
-- ---------------------------------------------------------------------
create or replace function public.device_claim_commands(p_limit integer default 3)
returns setof public.commands
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.exige_dispositivo();
begin
  update public.commands
     set status = 'expired', completed_at = now()
   where device_id = v_id and status = 'pending' and expires_at <= now();

  return query
  update public.commands c
     set status = 'claimed', claimed_at = now()
   where c.id in (
     select c2.id
       from public.commands c2
      where c2.device_id = v_id
        and c2.status = 'pending'
        and c2.expires_at > now()
      order by c2.created_at
      limit greatest(1, least(p_limit, 10))
      for update skip locked
   )
  returning c.*;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) DAR BAIXA NO COMANDO
-- ---------------------------------------------------------------------
create or replace function public.device_complete_command(
  p_id      uuid,
  p_ok      boolean default true,
  p_result  jsonb   default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.exige_dispositivo();
begin
  update public.commands
     set status       = case when p_ok then 'done' else 'failed' end,
         result       = p_result,
         completed_at = now()
   where id = p_id and device_id = v_id;

  if not found then
    raise exception 'comando % não pertence ao dispositivo %', p_id, v_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) REGISTRAR UMA ALIMENTAÇÃO
-- Chamada logo depois de o motor girar.
--   p_grams            = quanto REALMENTE caiu, medido pela balança da
--                        tigela (peso depois - peso antes)
--   p_bowl_grams_after = peso total da tigela depois da liberação; é o
--                        ponto de partida da conta de consumo (o gatilho
--                        tg_atualiza_consumo cuida do resto)
-- Também abate a porção do nível estimado do reservatório.
-- ---------------------------------------------------------------------
create or replace function public.device_register_feeding(
  p_grams_target      numeric,
  p_grams             numeric,
  p_bowl_grams_after  numeric,
  p_trigger           text    default 'scheduled',
  p_steps             integer default null,
  p_schedule_id       uuid    default null,
  p_command_id        uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     text := public.exige_dispositivo();
  v_pet    uuid;
  v_evento uuid;
begin
  if p_trigger not in ('scheduled','manual') then
    raise exception 'trigger inválido: %', p_trigger;
  end if;

  -- fecha qualquer evento ainda aberto: a porção nova reinicia a contagem
  update public.feeding_events
     set settled_at = now()
   where device_id = v_id and settled_at is null;

  select id into v_pet from public.pets where device_id = v_id limit 1;

  insert into public.feeding_events (
    device_id, pet_id, schedule_id, occurred_at, trigger,
    grams_target, grams, steps_executed, bowl_grams_after, source
  ) values (
    v_id, v_pet, p_schedule_id, now(), p_trigger,
    round(p_grams_target, 2), round(p_grams, 2), p_steps,
    round(p_bowl_grams_after, 2), 'device'
  )
  returning id into v_evento;

  update public.devices
     set hopper_grams      = greatest(0, hopper_grams - round(p_grams, 2)),
         hopper_updated_at = now()
   where id = v_id;

  if p_command_id is not null then
    update public.commands
       set status = 'done', completed_at = now(),
           result = jsonb_build_object('feeding_event_id', v_evento, 'grams', p_grams)
     where id = p_command_id and device_id = v_id;
  end if;

  return v_evento;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) SALVAR A CALIBRAÇÃO DA CÉLULA DE CARGA
-- Assim o fator não fica só no código: se a ESP32 for regravada, ela
-- recupera a calibração do banco no boot (device_get_config).
-- ---------------------------------------------------------------------
create or replace function public.device_save_calibration(
  p_scale_factor numeric,
  p_scale_offset numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.exige_dispositivo();
begin
  update public.devices
     set scale_factor = p_scale_factor,
         scale_offset = p_scale_offset
   where id = v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) ATUALIZAR A URL DO STREAM (a ESP32-CAM pode mudar de IP no DHCP)
-- Chamada pelo firmware da câmera no boot, depois de pegar IP.
-- ---------------------------------------------------------------------
create or replace function public.device_set_stream_url(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.exige_dispositivo();
begin
  update public.devices set stream_url = p_url where id = v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Privilégios das funções
-- ---------------------------------------------------------------------
revoke all on function public.exige_dispositivo()            from public;
revoke all on function public.device_heartbeat(text,numeric,integer) from public;
revoke all on function public.device_get_config()            from public;
revoke all on function public.device_claim_commands(integer) from public;
revoke all on function public.device_complete_command(uuid,boolean,jsonb) from public;
revoke all on function public.device_register_feeding(numeric,numeric,numeric,text,integer,uuid,uuid) from public;
revoke all on function public.device_save_calibration(numeric,numeric) from public;
revoke all on function public.device_set_stream_url(text)    from public;

grant execute on function public.device_heartbeat(text,numeric,integer) to anon, authenticated;
grant execute on function public.device_get_config()            to anon, authenticated;
grant execute on function public.device_claim_commands(integer) to anon, authenticated;
grant execute on function public.device_complete_command(uuid,boolean,jsonb) to anon, authenticated;
grant execute on function public.device_register_feeding(numeric,numeric,numeric,text,integer,uuid,uuid) to anon, authenticated;
grant execute on function public.device_save_calibration(numeric,numeric) to anon, authenticated;
grant execute on function public.device_set_stream_url(text)    to anon, authenticated;
