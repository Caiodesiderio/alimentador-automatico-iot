# Como verificar este trabalho sem falar com os autores

## Verificação 1 — automática, sem instalar nada 

Este repositório roda a própria verificação na infraestrutura do GitHub a cada
envio de código. Abra a aba **Actions** do repositório: o log é público e
completo.

Ela confere quatro coisas:

1. os arquivos de dados publicados batem com os SHA-256 declarados;
2. regerar o conjunto do zero produz arquivos **idênticos, byte a byte**;
3. os números citados na documentação saem do pipeline, e não foram digitados
   à mão;
4. as oito migrations aplicam em um PostgreSQL limpo e deixam o banco com as
   contagens declaradas — **é esta a prova de que o banco fica populado**.

Se qualquer número divergir, a execução falha e fica vermelha. Uma execução
verde é uma afirmação testada, não uma promessa.

---

## Verificação 2 — na sua própria máquina 

```bash
git clone https://github.com/Caiodesiderio/alimentador-automatico-iot.git
cd alimentador-automatico-iot/analise
pip install -r requirements.txt
python verificar.py
```

Saída esperada, em resumo:

```
[1/4] Integridade dos arquivos publicados (SHA-256)          5 arquivos OK
[2/4] Reprodutibilidade — regerando o conjunto do zero       4 arquivos idênticos
[3/4] Números do conjunto conferem com o DATASET.md          10 conferências OK
[4/4] Resultados do K-means e do Z-score                     5 conferências OK

Tudo conferido.
```

O script sai com código 1 e diz exatamente o que divergiu, se divergir.

### Conferir os arquivos à mão, se preferir

```bash
cd analise
sha256sum -c CHECKSUMS.sha256          # integridade
wc -l dados/feeding_events_sintetico.csv   # 278 linhas = 277 registros + cabeçalho
wc -l dados/food_readings_sintetico.csv    # 2701 linhas = 2700 registros
cat dados/DATASET_INFO.json                # estatísticas geradas pelo script
```

---

## Verificação 3 — o banco populado, do zero 

### Com Docker

```bash
docker run --name verificacao -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
sleep 5

export PGPASSWORD=postgres
psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -f supabase/ci/stub_supabase.sql
for f in supabase/migrations/0*.sql; do
  psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -q -f "$f"
done
psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -f supabase/ci/verificar_banco.sql
```

Resultado esperado:

```
NOTICE:  Banco conferido: 277 eventos, 2700 leituras, 3 execuções, 11 grupos, 9 anomalias

       tabela       | registros
--------------------+-----------
 analysis_anomalies |         9
 analysis_clusters  |        11
 analysis_runs      |         3
 feeding_events     |       277
 food_readings      |      2700
 schedules          |         3
```

### Em uma conta gratuita do Supabase

Mesmo efeito, sem Docker: crie um projeto, abra o SQL Editor e cole as oito
migrations de `supabase/migrations/` na ordem. O `stub_supabase.sql` **não** é
necessário ali — ele só existe para Postgres comum, porque cria o que o Supabase
já traz de fábrica.

---

## O que cada arquivo prova

| Arquivo | Serve para provar |
|---|---|
| `analise/gerar_dataset.py` | como os dados foram produzidos — o método de coleta, auditável linha a linha |
| `analise/CHECKSUMS.sha256` | que os arquivos publicados são os descritos |
| `analise/pipeline_analise.py` | como os resultados de K-means e Z-score foram obtidos |
| `analise/verificar.py` | que os números da documentação saem do código |
| `analise/dados/DATASET_INFO.json` | as estatísticas, geradas e não digitadas |
| `supabase/migrations/0001` a `0005` | o esquema do banco, a RLS e as funções |
| `supabase/migrations/0006` a `0008` | a carga — o banco populado, de forma reprodutível |
| `supabase/ci/verificar_banco.sql` | as contagens esperadas, que falham se divergirem |
| `.github/workflows/verificacao.yml` | que tudo acima roda de fato, em máquina neutra |

---

## Os números declarados, em um lugar só

| Afirmação | Valor | Onde conferir |
|---|---|---|
| Registros de alimentação | 277 | `DATASET_INFO.json`, `verificar_banco.sql` |
| Leituras de peso | 2.700 | idem |
| Período | 2026-07-01 a 2026-09-28 (90 dias) | idem |
| Anomalias injetadas | 12 (5 low, 4 skipped, 3 high) | `ground_truth_anomalias.csv` |
| Origem dos dados | autoproduzido, sintético | `gerar_dataset.py` |
| Dados pessoais / de animal real / de terceiros | nenhum | `DATASET_INFO.json` |
| K-means, 90 dias | k = 4, silhueta 0,946 | `RESULTADO_ANALISE.json` |
| Z-score clássico, \|z\| > 2 | 5 de 12 (revocação 0,42) | idem |
| Z-score robusto (MAD), \|z\| > 3,5 | 12 de 12 (F1 0,92) | idem |
