
## Popular o banco 

Três arquivos novos, no **SQL Editor**, na ordem. Mesmo procedimento dos cinco
anteriores: colar, rodar, conferir.

| Arquivo | O que carrega | Obrigatório? |
|---|---|---|
| `supabase/migrations/0006_carga_dataset_sintetico.sql` | 277 eventos de alimentação | **sim** |
| `supabase/migrations/0007_carga_leituras_peso.sql` | 2.700 pesagens da tigela | não |
| `supabase/migrations/0008_carga_resultados_analise.sql` | resultados do K-means e do Z-score | **sim** |

Sobre o **0007**: é o maior (140 KB) e nada depende dele. O K-means e o Z-score
trabalham sobre os eventos, não sobre a série de peso. Ele só existe para as
telas do aplicativo terem uma curva para mostrar. Se o editor engasgar, pule e
siga em frente — dá para rodar depois.

O **0006 pode ser rodado duas vezes sem duplicar nada** (os ids são
determinísticos e há `on conflict do nothing`). O **0008 apaga as execuções
anteriores antes de inserir**, então também pode repetir à vontade.

### Conferência

Cada arquivo já termina com a consulta de conferência. Os valores esperados:

```
0006 →  277 eventos, de 2026-07-01 a 2026-09-28
0007 →  2700 leituras
0008 →  3 execuções (7, 30 e 90 dias), com 3, 4 e 4 grupos
```

Se quiser conferir tudo de uma vez:

```sql
select
  (select count(*) from public.feeding_events)   as eventos,
  (select count(*) from public.food_readings)    as leituras,
  (select count(*) from public.analysis_runs)    as execucoes,
  (select count(*) from public.analysis_clusters) as grupos,
  (select count(*) from public.analysis_anomalies) as anomalias;
-- esperado: 277 | 2700 | 3 | 11 | 9
```

> As oito migrations foram aplicadas em um PostgreSQL 16 limpo, na ordem, antes
> de chegarem até você. Os números acima são os que saíram desse teste.
---

