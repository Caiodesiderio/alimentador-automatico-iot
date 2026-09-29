-- =====================================================================
-- Conferência do banco depois de aplicar as migrations 0001 a 0008
-- =====================================================================
-- Levanta exceção se qualquer contagem divergir do que a documentação
-- declara. Rodado com `psql -v ON_ERROR_STOP=1`, derruba a verificação
-- automática — que é a intenção: número errado tem que quebrar, não
-- passar despercebido.
--
-- Serve tanto para a automação do repositório quanto para quem quiser
-- conferir no próprio Supabase depois de colar as oito migrations.
-- =====================================================================

do $$
declare
  v_eventos     integer;
  v_leituras    integer;
  v_execucoes   integer;
  v_grupos      integer;
  v_anomalias   integer;
  v_inicio      date;
  v_fim         date;
  v_liberado    numeric;
  v_consumido   numeric;
  v_nao_sintetico integer;
begin
  select count(*), min(occurred_at)::date, max(occurred_at)::date,
         round(sum(grams),2), round(sum(consumed_grams),2),
         count(*) filter (where source <> 'synthetic')
    into v_eventos, v_inicio, v_fim, v_liberado, v_consumido, v_nao_sintetico
    from public.feeding_events;

  select count(*) into v_leituras   from public.food_readings;
  select count(*) into v_execucoes  from public.analysis_runs;
  select count(*) into v_grupos     from public.analysis_clusters;
  select count(*) into v_anomalias  from public.analysis_anomalies;

  if v_eventos <> 277 then
    raise exception 'feeding_events: esperado 277, encontrado %', v_eventos;
  end if;
  if v_leituras <> 2700 then
    raise exception 'food_readings: esperado 2700, encontrado %', v_leituras;
  end if;
  if v_inicio <> date '2026-07-01' or v_fim <> date '2026-09-28' then
    raise exception 'período: esperado 2026-07-01 a 2026-09-28, encontrado % a %', v_inicio, v_fim;
  end if;
  if v_nao_sintetico <> 0 then
    raise exception '% registro(s) sem source = synthetic', v_nao_sintetico;
  end if;

  -- Confere que o gatilho de consumo não alterou os valores carregados.
  if v_liberado <> 32851.96 then
    raise exception 'ração liberada: esperado 32851.96, encontrado %', v_liberado;
  end if;
  if v_consumido <> 29814.95 then
    raise exception 'ração consumida: esperado 29814.95, encontrado %', v_consumido;
  end if;

  if v_execucoes <> 3 then
    raise exception 'analysis_runs: esperado 3 (7, 30 e 90 dias), encontrado %', v_execucoes;
  end if;
  if v_grupos <> 11 then
    raise exception 'analysis_clusters: esperado 11, encontrado %', v_grupos;
  end if;
  if v_anomalias <> 9 then
    raise exception 'analysis_anomalies: esperado 9, encontrado %', v_anomalias;
  end if;

  if exists (select 1 from public.analysis_runs where dataset_kind <> 'synthetic') then
    raise exception 'há execução de análise sem dataset_kind = synthetic';
  end if;

  raise notice 'Banco conferido: % eventos, % leituras, % execuções, % grupos, % anomalias',
    v_eventos, v_leituras, v_execucoes, v_grupos, v_anomalias;
end $$;

-- Resumo legível
select 'feeding_events'     as tabela, count(*) as registros from public.feeding_events
union all select 'food_readings',      count(*) from public.food_readings
union all select 'schedules',          count(*) from public.schedules
union all select 'analysis_runs',      count(*) from public.analysis_runs
union all select 'analysis_clusters',  count(*) from public.analysis_clusters
union all select 'analysis_anomalies', count(*) from public.analysis_anomalies
order by 1;
