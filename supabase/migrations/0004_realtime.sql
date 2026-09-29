-- =====================================================================
-- Migration 0004: gatilho de reabastecimento + Realtime
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reabastecer o reservatório.
-- A célula de carga está na tigela, então o sistema não tem como perceber
-- sozinho que alguém encheu o tanque: quem avisa é o tutor pelo app,
-- inserindo em hopper_refills. Este gatilho é o que aplica o valor.
-- ---------------------------------------------------------------------
create or replace function public.tg_aplica_refill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.devices
     set hopper_grams      = new.grams_after,
         hopper_updated_at = new.refilled_at
   where id = new.device_id;
  return new;
end;
$$;

drop trigger if exists hopper_refills_aplica on public.hopper_refills;
create trigger hopper_refills_aplica
  after insert on public.hopper_refills
  for each row execute function public.tg_aplica_refill();

-- ---------------------------------------------------------------------
-- REALTIME
-- O app assina estas tabelas para atualizar a tela sem ficar repetindo
-- requisição. Notar que a ESP32 NÃO usa Realtime (websocket em
-- microcontrolador é frágil): ela faz polling da fila de comandos.
--
--   devices        -> status online/offline e nível do reservatório
--   food_readings  -> peso da tigela ao vivo
--   feeding_events -> "acabou de liberar 120 g"
--   commands       -> app acompanha pending -> claimed -> done
--   schedules      -> agenda editada em outro aparelho
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'devices','food_readings','feeding_events','commands','schedules'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- REPLICA IDENTITY FULL: sem isso, um UPDATE chega no app só com a chave
-- primária, e a tela não consegue saber o que mudou.
alter table public.devices        replica identity full;
alter table public.commands       replica identity full;
alter table public.feeding_events replica identity full;
alter table public.schedules      replica identity full;
-- food_readings só recebe INSERT; a identidade padrão basta e economiza WAL.
