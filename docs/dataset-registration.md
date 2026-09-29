# Dataset Registration (SRBR) — respostas prontas para colar

Formulário: **Dataset Registration → New Dataset**
Preparado em 29/09/2026, com os números saídos de `analise/dados/DATASET_INFO.json`.

> **A resposta curta à pergunta "quais bancos de dados foram usados":**
> nenhum de terceiros. Nem base pública, nem base comprada, nem dado raspado da
> web. O conjunto foi produzido pelo próprio projeto, por script, e é
> integralmente sintético. No formulário isso é **Self Produced Data**.

---

## Submission Info

| Campo | Valor |
|---|---|
| **Contributed By** | `SRBR` *(já preenchido)* |
| **Sponsored By** | `SRBR` *(já preenchido)* |

## General

### Acquisition Route

☑ **Self Produced Data** ← marcar esta
☐ Open Data
☐ Purchased Data

### Dataset Name  *(limite 128)*

```
PetFeeder-Synthetic-FeedingLog
```

### Dataset Type

Selecionar **Tabular** / **CSV** se existir na lista. Se as únicas opções forem
as genéricas, deixar **Text** — os arquivos são CSV em UTF-8.

### Version  *(limite 256)*

```
1.0
```

### Dataset Tag

```
synthetic-data
iot
pet-feeder
time-series
anomaly-detection
clustering
esp32
```

### Task / 기술 분류

```
Clustering
Anomaly Detection
```

### Summary / 데이터셋 요약  *(limite 10.000)*

```
Fully synthetic dataset of automatic pet feeder events, produced by this project
for the technical validation of two classical machine learning algorithms:
K-means clustering of feeding routines and Z-score detection of consumption
anomalies. No neural networks are used.

The dataset contains 277 feeding events and 2,700 bowl weight readings covering
90 consecutive days (2026-07-01 to 2026-09-28) for one simulated medium-sized
dog (8.4 kg, 360 g/day target) and one device. It includes 12 days with
deliberately injected and labelled anomalies of three kinds: low consumption,
skipped meal and above-average consumption.

IMPORTANT — the data is synthetic and does not represent measurements from a
real animal. The prototype is still on the bench and no animal has been
monitored. This limitation was formally declared to the reviewers of the paper
published at CONEDU and is repeated in the dataset documentation and inside the
project's mobile application, which displays a "simulated data / under technical
validation" notice while the data source is synthetic.

Provenance: self-produced. No public, purchased, scraped or third-party data was
used. The dataset contains no personal data and no data from real animals.

Reproducibility: the generator script uses a fixed seed (59635), an absolute
date range rather than a relative window, deterministic UUIDv5 identifiers and
only the Python standard library. Running it twice produces byte-identical
files.
```

### Description / 데이터셋 설명  *(limite 10.000)*

```
CONTEXT
Undergraduate research project (PIBIC, SISPROJ 59635) at Universidade do Estado
do Amazonas, supervised by Prof. Dr. Almir Kimura Junior: an IoT automatic pet
feeder for medium-sized pets with remote control and monitoring. The hardware is
an ESP32 with a load cell (HX711) under the food bowl and a 28BYJ-48 stepper
motor for dispensing. Results were published at CONEDU and presented as a poster
at ENAEPE 2026.

WHY THE DATA IS SYNTHETIC
The prototype is on the bench and no animal has been monitored yet. The analysis
algorithms nevertheless had to be validated before real collection started, so
this dataset was generated to provide a statistically plausible workload with a
known ground truth.

COLLECTION METHOD
There was no collection. The data was generated programmatically by a script
included in this repository (analise/gerar_dataset.py). No sensor, no human
annotation, no external capture, no web scraping, no third-party licence.

The generative process simulates one medium-sized dog (8.4 kg, 360 g/day) with a
three-meal domestic routine over 90 consecutive days. Meal times follow a normal
distribution around 07:00, 12:30 and 19:00 with standard deviations of 9, 12 and
10 minutes. Dispensed portions follow a normal distribution around 120 g, 100 g
and 140 g with a 4 g standard deviation - the small spread reflects the feeder's
closed-loop dosing, which weighs the bowl between short motor bursts instead of
counting motor steps blindly. Consumption on a normal day is uniform between 90%
and 100% of the dispensed portion. Residual food between meals is normal with
mean 6 g. 8% of meals are flagged as manually triggered from the app; 7% of days
receive an extra 30-50 g snack between 15:00 and 17:00. The bowl weight series
samples every 20 minutes for 3 hours after each meal, following a non-linear
consumption curve. Twelve days receive injected anomalies at fixed indices, with
their type recorded separately as ground truth.

Tooling: Python 3, standard library only, Mersenne Twister PRNG, seed 59635.

VOLUME
2,989 records across three CSV files (277 feeding events, 2,700 bowl weight
readings, 12 anomaly labels), 13,871 cells, 13,888 whitespace-separated tokens,
180,229 characters, 178.9 KB. UTF-8, comma-separated. Labels in Brazilian
Portuguese.

This is a tabular numeric time-series dataset, not a text corpus, so word count
is not a meaningful metric here; the token figure above is the literal count a
generic word counter would report.

CONTENT
- feeding_events_sintetico.csv - 277 records, the primary dataset. One row per
  dispensed portion: timestamp, trigger (scheduled or manual), target portion,
  portion actually dispensed (weighed in the bowl), bowl weight after
  dispensing, grams consumed, and settlement time.
- food_readings_sintetico.csv - 2,700 records. Bowl weight time series sampled
  every 20 minutes for 3 hours after each meal.
- ground_truth_anomalias.csv - the 12 labelled anomalous days.
- DATASET_INFO.json - machine-readable statistics.

The CSV schema is identical to the production PostgreSQL/Supabase table, so the
same pipeline runs unchanged over synthetic and real data.

RESULTS OBTAINED
K-means over meal times, with k selected by silhouette score among k=2..6, chose
k=4 with silhouette 0.946: the three regular daily meals plus a small fourth
cluster of 7 occasional afternoon snacks.

Z-score over daily consumption exposed a limitation of the original formulation.
The classical Z-score at |z| > 2.0 detected only 5 of the 12 injected anomalies
(precision 1.00, recall 0.42, F1 0.59), missing every skipped meal and every
high-consumption day. Mean and standard deviation are computed over a series
that already contains the anomalies, which inflates the standard deviation to
57 g and masks the moderate deviations. Replacing mean and standard deviation
with median and MAD (modified Z-score, threshold 3.5) detected all 12 anomalies
with 2 false positives (precision 0.86, recall 1.00, F1 0.92). Both variants are
now computed and reported by the pipeline.

Exposing this limitation before real data collection began is the main practical
contribution of the synthetic dataset.

LIMITATIONS
1. The data is synthetic; no conclusion about real animal behaviour follows.
2. A single animal and a single device: no variability across individuals,
   breeds or environments.
3. Anomalies are injected and of three types only; real anomalies are more
   subtle and varied, so the measured performance is likely optimistic.
4. Noise is Gaussian and independent; thermal drift of the load cell, mechanical
   settling of the 3D-printed structure and stepper motor vibration are not
   modelled.
5. No seasonality or long-term trend: the simulated animal does not gain weight,
   fall ill or change routine over the 90 days.

PRIVACY AND PROVENANCE
No personal data. No data from real animals. No public, purchased, scraped or
third-party data. Entirely produced by the project's own generator script,
included in the repository.

LICENSE
CC BY 4.0.
```

### Data URL / 데이터셋 웹 주소  *(obrigatório)*

```
https://github.com/<seu-usuario>/<seu-repositorio>/blob/main/DATASET.md
```

### URL Of Raw Data

```
https://github.com/<seu-usuario>/<seu-repositorio>/tree/main/analise/dados
```

> Substitua `<seu-usuario>/<seu-repositorio>` depois de publicar. **Confira que
> o repositório está público antes de enviar o formulário** — um link privado
> aparece como erro 404 para quem revisar do outro lado, e a submissão volta.

---

## Volume — inclusive "quantidade de palavras"

Eles pediram contagem de palavras. **Este conjunto não é um corpus de texto**, é
tabular e numérico, então palavra não é métrica significativa. A resposta honesta
é dar as métricas equivalentes e, se o campo exigir um número, o token literal.

| Arquivo | Registros | Campos | Células | Tokens | Caracteres | Tamanho |
|---|---:|---:|---:|---:|---:|---:|
| `feeding_events_sintetico.csv` | 277 | 11 | 3.047 | 3.058 | 41.714 | 41,0 KB |
| `food_readings_sintetico.csv` | 2.700 | 4 | 10.800 | 10.804 | 138.306 | 137,7 KB |
| `ground_truth_anomalias.csv` | 12 | 2 | 24 | 26 | 209 | 0,2 KB |
| **Total** | **2.989** | — | **13.871** | **13.888** | **180.229** | **178,9 KB** |

Frase pronta, se perguntarem direto:

```
This is a tabular numeric time-series dataset, not a text corpus, so word count
is not a meaningful metric. Equivalent volume: 2,989 records across three CSV
files, 13,871 cells, 180,229 characters, 178.9 KB. A generic word counter reads
13,888 whitespace-separated tokens.
```

## Método de coleta — resposta curta

```
No collection took place. The dataset was generated programmatically by a script
published in the same repository (analise/gerar_dataset.py). No sensor, no human
annotation, no external source, no web scraping, no third-party licence. The
generator is deterministic: fixed seed (59635), absolute date range, UUIDv5
identifiers and Python standard library only, so two runs produce byte-identical
files.
```

A descrição completa do processo gerador — distribuições, parâmetros e
instrumentos — está na seção 2 do `DATASET.md`.

---

## Se perguntarem mais (provável, e vale ter pronto)

| Pergunta | Resposta |
|---|---|
| Foi usada alguma base pública (Kaggle, HuggingFace, UCI…)? | Não. |
| Foi comprada alguma base? | Não. |
| Houve raspagem de dados da web? | Não. |
| Contém dados pessoais ou identificáveis? | Não. |
| Contém dados de animais reais? | Não. Todo o conjunto é simulado. |
| Há licença de terceiros a respeitar? | Não. O conjunto é autoproduzido; distribuído sob CC BY 4.0. |
| Quem produziu? | A equipe do projeto, por script versionado no repositório. |
| É reprodutível? | Sim. Semente fixa, período absoluto, ids determinísticos e nenhuma dependência externa. Duas execuções geram arquivos idênticos. |
| Usa rede neural? | Não. K-means e Z-score, com scikit-learn. |
| Qual o tamanho? | 277 eventos de alimentação e 2.700 leituras de peso, em 90 dias. |
| Qual o método de coleta? | Não houve coleta: geração programática por script versionado. Sem sensor, sem anotador humano, sem fonte externa. |
| Quantidade de palavras? | Não se aplica — é conjunto tabular, não corpus de texto. Equivalente: 2.989 registros, 13.871 células, 180.229 caracteres. Token literal: 13.888. |
| Onde estão os dados? | No GitHub, em `analise/dados/`, junto com o script que os gera e o pipeline que os consome. |
| Qual o idioma? | Rótulos em português (pt-BR); documentação do formulário em inglês. |
| Qual o formato? | CSV, UTF-8, separador vírgula. Esquema idêntico ao da tabela PostgreSQL de produção. |
| Vai ser substituído por dado real? | Sim, assim que a coleta em bancada começar. O campo `source` de cada registro distingue `synthetic` de `device`, e o app troca o aviso sozinho. |

---

## Antes de clicar em OK

- [ ] Repositório publicado e **público** no GitHub
- [ ] `DATASET.md` na raiz do repositório
- [ ] Pasta `analise/dados/` com os quatro arquivos
- [ ] Os dois links do formulário abertos no navegador, conferindo que carregam
- [ ] Nenhum arquivo `.env` ou `secrets.h` subiu junto — confira com
      `git status` antes do commit, e com a busca do GitHub depois
- [ ] Orientador avisado do que está sendo submetido
