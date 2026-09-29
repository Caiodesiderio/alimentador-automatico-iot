-- =====================================================================
-- Migration 0008: resultados do K-means e do Z-score
-- =====================================================================
-- Saída de analise/pipeline_analise.py sobre o conjunto sintético,
-- para os períodos de 7, 30 e 90 dias — os três que o aplicativo
-- oferece na aba Análise.
--
-- Sem esta carga a aba Análise mostra o gráfico de consumo (que é
-- calculado do próprio histórico) mas nenhum agrupamento e nenhuma
-- anomalia, porque essas duas coisas vêm do pipeline.
--
-- dataset_kind = 'synthetic' em toda execução: é o que mantém o aviso
-- de dados simulados aceso na tela.
--
-- Gerado por analise/gerar_sql_carga.py. Não editar à mão.
-- =====================================================================

-- limpa execuções anteriores deste dispositivo (clusters e anomalias
-- saem junto, por causa do on delete cascade)
delete from public.analysis_runs where device_id = 'esp32-01';

-- ---------- período de 7 dias ----------
with execucao as (
  insert into public.analysis_runs
    (device_id, period_days, events_count, dataset_kind, k_clusters, z_threshold, notes)
  values ('esp32-01', 7, 21, 'synthetic', 3, 2.0, 'pipeline_analise.py; k escolhido por silhueta (0.9687); semente 59635')
  returning id
)
, grupos as (
  insert into public.analysis_clusters
    (run_id, device_id, label, start_time, end_time, avg_portion_grams,
     event_count, times_in_minutes)
  select execucao.id, 'esp32-01', v.label, v.inicio::time, v.fim::time,
         v.porcao, v.eventos, v.minutos::integer[]
    from execucao,
         (values
    ('Manhã', '06:34', '07:10', 122.89, 7, '{423,418,394,410,430,424,426}'),
    ('Tarde', '12:15', '12:38', 102.51, 7, '{743,748,758,735,756,746,748}'),
    ('Noite', '18:42', '19:07', 140.09, 7, '{1133,1132,1122,1139,1140,1147,1132}')
         ) as v(label, inicio, fim, porcao, eventos, minutos)
  returning 1
),
desvios as (
  insert into public.analysis_anomalies
    (run_id, device_id, event_date, type, description, z_score, severity)
  select execucao.id, 'esp32-01', v.data::date, v.tipo, v.descricao,
         v.z, v.severidade
    from execucao,
         (values
    ('2026-09-25', 'Consumo abaixo da média', 'Consumo 59% abaixo da média diária do período', -2.439, 'low')
         ) as v(data, tipo, descricao, z, severidade)
  returning 1
)
select 'periodo 7 dias carregado' as status;

-- ---------- período de 30 dias ----------
with execucao as (
  insert into public.analysis_runs
    (device_id, period_days, events_count, dataset_kind, k_clusters, z_threshold, notes)
  values ('esp32-01', 30, 93, 'synthetic', 4, 2.0, 'pipeline_analise.py; k escolhido por silhueta (0.949); semente 59635')
  returning id
)
, grupos as (
  insert into public.analysis_clusters
    (run_id, device_id, label, start_time, end_time, avg_portion_grams,
     event_count, times_in_minutes)
  select execucao.id, 'esp32-01', v.label, v.inicio::time, v.fim::time,
         v.porcao, v.eventos, v.minutos::integer[]
    from execucao,
         (values
    ('Manhã', '06:34', '07:20', 119.92, 30, '{422,420,440,406,418,413,406,426,397,405,420,419,421,415,428,429,421,418,422,420,434,420,413,423,418,394,410,430,424,426}'),
    ('Tarde', '12:15', '12:55', 100.76, 30, '{754,775,750,750,754,758,762,767,755,751,737,764,750,739,741,741,751,764,742,739,743,749,748,743,748,758,735,756,746,748}'),
    ('Tarde 2', '15:30', '15:36', 34.8, 2, '{936,930}'),
    ('Noite', '18:37', '19:22', 142.07, 31, '{1150,1133,1139,1158,1138,1148,1157,1135,1138,1158,1135,1129,1138,1150,1147,1128,1139,1148,1147,1134,1162,1117,1128,1132,1133,1132,1122,1139,1140,1147,1132}')
         ) as v(label, inicio, fim, porcao, eventos, minutos)
  returning 1
),
desvios as (
  insert into public.analysis_anomalies
    (run_id, device_id, event_date, type, description, z_score, severity)
  select execucao.id, 'esp32-01', v.data::date, v.tipo, v.descricao,
         v.z, v.severidade
    from execucao,
         (values
    ('2026-08-29', 'Consumo abaixo da média', 'Consumo 61% abaixo da média diária do período', -2.819, 'medium'),
    ('2026-09-10', 'Consumo abaixo da média', 'Consumo 65% abaixo da média diária do período', -3.031, 'high'),
    ('2026-09-25', 'Consumo abaixo da média', 'Consumo 59% abaixo da média diária do período', -2.747, 'medium')
         ) as v(data, tipo, descricao, z, severidade)
  returning 1
)
select 'periodo 30 dias carregado' as status;

-- ---------- período de 90 dias ----------
with execucao as (
  insert into public.analysis_runs
    (device_id, period_days, events_count, dataset_kind, k_clusters, z_threshold, notes)
  values ('esp32-01', 90, 277, 'synthetic', 4, 2.0, 'pipeline_analise.py; k escolhido por silhueta (0.9455); semente 59635')
  returning id
)
, grupos as (
  insert into public.analysis_clusters
    (run_id, device_id, label, start_time, end_time, avg_portion_grams,
     event_count, times_in_minutes)
  select execucao.id, 'esp32-01', v.label, v.inicio::time, v.fim::time,
         v.porcao, v.eventos, v.minutos::integer[]
    from execucao,
         (values
    ('Manhã', '06:34', '07:28', 119.89, 90, '{419,428,416,395,404,427,422,430,423,417,416,430,415,443,433,420,412,420,426,421,431,416,423,426,419,423,420,419,409,429,426,430,410,408,431,427,435,427,417,432,427,417,407,430,417,421,424,426,416,411,412,448,426,422,421,413,423,420,418,407,422,420,440,406,418,413,406,426,397,405,420,419,421,415,428,429,421,418,422,420,434,420,413,423,418,394,410,430,424,426}'),
    ('Tarde', '12:14', '13:07', 100.15, 90, '{744,753,757,765,747,754,751,741,742,773,746,746,763,742,750,760,746,752,753,752,748,746,747,749,754,772,738,736,751,750,758,766,770,772,752,741,759,742,744,757,746,758,734,759,734,751,744,763,742,767,743,775,742,755,747,761,752,750,787,745,754,775,750,750,754,758,762,767,755,751,737,764,750,739,741,741,751,764,742,739,743,749,748,743,748,758,735,756,746,748}'),
    ('Tarde 2', '15:29', '16:42', 40.07, 7, '{980,929,959,930,1002,936,930}'),
    ('Noite', '18:37', '19:23', 141.87, 90, '{1140,1149,1138,1150,1140,1151,1135,1156,1122,1126,1130,1138,1127,1136,1144,1148,1130,1153,1147,1146,1153,1132,1134,1139,1137,1145,1141,1145,1140,1130,1147,1145,1135,1152,1153,1148,1132,1141,1132,1145,1159,1140,1122,1163,1136,1121,1140,1126,1143,1139,1144,1148,1143,1127,1139,1122,1150,1128,1138,1150,1133,1139,1158,1138,1148,1157,1135,1138,1158,1135,1129,1138,1150,1147,1128,1139,1148,1147,1134,1162,1117,1128,1132,1133,1132,1122,1139,1140,1147,1132}')
         ) as v(label, inicio, fim, porcao, eventos, minutos)
  returning 1
),
desvios as (
  insert into public.analysis_anomalies
    (run_id, device_id, event_date, type, description, z_score, severity)
  select execucao.id, 'esp32-01', v.data::date, v.tipo, v.descricao,
         v.z, v.severidade
    from execucao,
         (values
    ('2026-07-10', 'Consumo abaixo da média', 'Consumo 65% abaixo da média diária do período', -3.76, 'high'),
    ('2026-08-01', 'Consumo abaixo da média', 'Consumo 56% abaixo da média diária do período', -3.259, 'high'),
    ('2026-08-22', 'Consumo abaixo da média', 'Consumo 64% abaixo da média diária do período', -3.724, 'high'),
    ('2026-09-10', 'Consumo abaixo da média', 'Consumo 66% abaixo da média diária do período', -3.817, 'high'),
    ('2026-09-25', 'Consumo abaixo da média', 'Consumo 60% abaixo da média diária do período', -3.472, 'high')
         ) as v(data, tipo, descricao, z, severidade)
  returning 1
)
select 'periodo 90 dias carregado' as status;

-- conferência
select r.period_days, r.events_count, r.k_clusters, r.dataset_kind,
       (select count(*) from public.analysis_clusters c where c.run_id = r.id) as grupos,
       (select count(*) from public.analysis_anomalies a where a.run_id = r.id) as anomalias
  from public.analysis_runs r
 where r.device_id = 'esp32-01'
 order by r.period_days;
