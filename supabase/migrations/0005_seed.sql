-- =====================================================================
-- Migration 0005: dados iniciais (um alimentador e um pet)
-- =====================================================================
-- ATENÇÃO: o device_token é gerado aleatoriamente aqui dentro do banco.
-- Ele NÃO aparece neste arquivo e por isso o arquivo pode ir para o Git.
-- Depois de rodar, execute a última consulta, copie o token e cole em
-- secrets.h (que fica no .gitignore). Se perder, é só gerar outro:
--   update public.devices
--      set device_token = encode(gen_random_bytes(24), 'hex')
--    where id = 'esp32-01';
-- =====================================================================

insert into public.devices (
  id, name, device_token, firmware_version,
  stream_url, hopper_capacity_grams, hopper_grams
) values (
  'esp32-01',
  'Alimentador da cozinha',
  encode(gen_random_bytes(24), 'hex'),
  '0.0.0',
  '',                 -- preenchido pela ESP32-CAM no boot (device_set_stream_url)
  2000,               -- capacidade do reservatório em gramas — AJUSTAR ao real
  0
)
on conflict (id) do nothing;

insert into public.pets (device_id, name, avatar_url, weight_kg, daily_target_grams)
select 'esp32-01', 'Max', '', 8.4, 360
where not exists (select 1 from public.pets where device_id = 'esp32-01');

-- Agendamentos de exemplo (os mesmos três da tela de Agenda do protótipo).
insert into public.schedules (device_id, label, time_of_day, frequency, weekdays, portion_grams, enabled)
select * from (values
  ('esp32-01', 'Café da manhã', time '07:00', 'daily',  array[]::smallint[],            120, true),
  ('esp32-01', 'Almoço',        time '12:30', 'weekly', array[1,2,3,4,5]::smallint[],   100, true),
  ('esp32-01', 'Jantar',        time '19:00', 'daily',  array[]::smallint[],            140, false)
) as v(device_id, label, time_of_day, frequency, weekdays, portion_grams, enabled)
where not exists (select 1 from public.schedules where device_id = 'esp32-01');

-- Reservatório considerado cheio agora (o gatilho aplica em devices).
insert into public.hopper_refills (device_id, grams_after, note)
select 'esp32-01', 1800, 'carga inicial de bancada'
where not exists (select 1 from public.hopper_refills where device_id = 'esp32-01');

-- =====================================================================
-- >>> COPIE O TOKEN ABAIXO PARA O secrets.h DA ESP32 <<<
-- =====================================================================
select id as device_id, device_token from public.devices where id = 'esp32-01';
