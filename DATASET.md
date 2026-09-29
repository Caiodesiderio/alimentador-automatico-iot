# PetFeeder-Synthetic-FeedingLog v1.0

Conjunto de dados **sintético e autoproduzido** de eventos de alimentação de um
alimentador automático IoT para pets de porte médio.

| | |
|---|---|
| **Origem** | Autoproduzido (*self-produced*). Nenhuma base pública, comprada ou de terceiros foi usada. |
| **Método de coleta** | Geração programática por script. Não houve sensor, não houve anotador humano, não houve captura externa. |
| **Natureza** | 100% sintético. Não contém medições de animal real. |
| **Dados pessoais** | Nenhum. |
| **Licença** | CC BY 4.0 |
| **Gerador** | [`analise/gerar_dataset.py`](analise/gerar_dataset.py) |

---

## Resumo

- **O que é:** 277 registros de refeições de um alimentador automático para pets,
  cobrindo 90 dias, mais 2.700 pesagens da tigela. Dados tabulares, em CSV.
- **De onde veio:** de um script deste próprio repositório. Nenhuma base externa,
  pública ou comprada. Nenhum dado real de animal ou de pessoa.
- **Por que existe:** para validar dois algoritmos clássicos — K-means e Z-score —
  antes de o protótipo sair da bancada e começar a coletar dados reais.
- **O que se descobriu:** o Z-score clássico só detectou 5 das 12 anomalias
  injetadas. A variante robusta (mediana/MAD) detectou 12 de 12. Esse é o
  resultado principal da validação, e ele foi obtido antes da coleta real.
- **Limite declarado:** por ser sintético, o conjunto não sustenta nenhuma
  conclusão sobre comportamento animal. Isso foi declarado formalmente aos
  avaliadores do artigo e é sinalizado no próprio aplicativo do projeto.

---

## 1. Por que este conjunto é sintético

O protótipo está em bancada e **nenhum animal foi monitorado até o momento**. Os
algoritmos de análise, porém, precisavam ser validados antes de existir coleta
real. Este conjunto foi criado para essa validação técnica.

Ele **não representa o comportamento de um animal real** e não sustenta nenhuma
conclusão sobre nutrição ou comportamento animal. 

O aplicativo do projeto também exibe o aviso *"Dados simulados — em validação
técnica"* enquanto a origem dos dados for sintética, e o aviso é acionado por
uma coluna do próprio banco (`feeding_events.source`), não por texto fixo na
tela. Quando a coleta real substituir este conjunto, o aviso desaparece sozinho.

---

## 2. Método de coleta

**Não houve coleta.** Os dados foram **gerados programaticamente**. Não há sensor
envolvido, não há anotação humana, não há captura de fonte externa, não há
raspagem de web, não há licença de terceiros a respeitar.

O processo gerador está inteiramente em
[`analise/gerar_dataset.py`](analise/gerar_dataset.py) e pode ser auditado linha
a linha. Em resumo:

### Modelo simulado

Um cão de porte médio, 8,4 kg, meta nutricional de 360 g por dia, com rotina
doméstica de três refeições diárias.

### Processo dia a dia

Para cada um dos 90 dias do período:

| Grandeza | Como é gerada |
|---|---|
| Horário de cada refeição | Distribuição normal em torno de 07:00, 12:30 e 19:00, com desvio-padrão de 9, 12 e 10 minutos |
| Porção liberada | Normal em torno de 120 g, 100 g e 140 g, desvio-padrão de 4 g |
| Consumo em dia normal | Uniforme entre 90% e 100% da porção liberada |
| Sobra na tigela entre refeições | Normal com média 6 g e desvio 2 g |
| Origem do disparo | 8% das refeições marcadas como manuais (pelo app), o restante como agendadas |
| Petisco fora de hora | 7% dos dias recebem uma liberação extra entre 15h e 17h, de 30, 40 ou 50 g |
| Série de peso da tigela | 10 amostras por refeição, uma a cada 20 minutos ao longo de 3 h, com curva de consumo não linear (o animal come mais no começo) |

O desvio-padrão pequeno da porção (4 g) não é arbitrário: reflete o fato de o
alimentador dosar em **malha fechada**, girando o motor em blocos e pesando a
tigela entre um bloco e outro, em vez de contar passos às cegas.

### Anomalias

Doze dias recebem anomalias injetadas, em índices fixos do período, de três
tipos (detalhe na seção 6). O tipo de cada uma é salvo à parte, o que permite
**medir** o acerto do detector em vez de avaliá-lo visualmente.

### Instrumentos e ambiente

Python 3, apenas a biblioteca padrão. Gerador de números pseudoaleatórios
Mersenne Twister (`random.Random`), semente 59635. Nenhuma dependência externa,
de propósito: assim nenhuma atualização de biblioteca altera o resultado.

---

## 3. Volume

> **Sobre "quantidade de palavras":** este não é um corpus de texto. É um
> conjunto **tabular** de séries temporais numéricas, então contagem de palavras
> não é uma métrica significativa aqui — o equivalente correto é número de
> registros, de campos e de células. Ainda assim, se o formulário exigir um
> número, a contagem literal de tokens está na tabela abaixo.

| Arquivo | Registros | Campos | Células | Tokens | Caracteres | Tamanho |
|---|---:|---:|---:|---:|---:|---:|
| `feeding_events_sintetico.csv` | 277 | 11 | 3.047 | 3.058 | 41.714 | 41,0 KB |
| `food_readings_sintetico.csv` | 2.700 | 4 | 10.800 | 10.804 | 138.306 | 137,7 KB |
| `ground_truth_anomalias.csv` | 12 | 2 | 24 | 26 | 209 | 0,2 KB |
| **Total** | **2.989** | — | **13.871** | **13.888** | **180.229** | **178,9 KB** |

Números conferidos em [`analise/dados/VOLUME.json`](analise/dados/VOLUME.json).
Token = sequência contínua sem espaço nem vírgula, que é como um contador
genérico de palavras leria o arquivo.

### Cobertura

| Métrica | Valor |
|---|---|
| Período coberto | **2026-07-01 a 2026-09-28** |
| Dias | **90** |
| Refeições agendadas | 249 |
| Refeições manuais | 28 |
| Dias com anomalia injetada e rotulada | **12** |
| Ração liberada no período | 32.851,96 g |
| Ração consumida no período | 29.814,95 g |
| Consumo médio diário | 331,28 g |
| Animais representados | 1 |
| Dispositivos representados | 1 |
| Idioma dos rótulos | português (pt-BR) |
| Formato | CSV, UTF-8, separador vírgula |

Os números acima não são digitados à mão: saem de
[`analise/dados/DATASET_INFO.json`](analise/dados/DATASET_INFO.json), gerado
pelo próprio script.

---

## 4. Arquivos e dicionário de dados

| Arquivo | Conteúdo |
|---|---|
| `analise/dados/feeding_events_sintetico.csv` | 277 eventos de alimentação — **o conjunto principal** |
| `analise/dados/food_readings_sintetico.csv` | 2.700 leituras da balança da tigela |
| `analise/dados/ground_truth_anomalias.csv` | rótulo das 12 anomalias injetadas |
| `analise/dados/DATASET_INFO.json` | estatísticas, em formato legível por máquina |
| `analise/dados/VOLUME.json` | métricas de volume |
| `supabase/migrations/0006_carga_dataset_sintetico.sql` | carga dos 277 eventos no banco |
| `supabase/migrations/0007_carga_leituras_peso.sql` | carga das 2.700 pesagens (opcional) |
| `supabase/migrations/0008_carga_resultados_analise.sql` | resultados do K-means e do Z-score |

As três migrations de carga são geradas por
[`analise/gerar_sql_carga.py`](analise/gerar_sql_carga.py) a partir dos próprios
CSVs — o banco de dados é populado de forma reprodutível, sem importação manual,
e qualquer pessoa que clone o repositório chega ao mesmo estado.

### `feeding_events_sintetico.csv`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | identificador determinístico do evento |
| `device_id` | text | alimentador de origem |
| `occurred_at` | timestamp | instante da liberação (UTC-4, America/Manaus) |
| `trigger` | enum | `scheduled` (agendamento) ou `manual` (pelo app) |
| `grams_target` | numeric | porção solicitada |
| `grams` | numeric | porção realmente liberada, pesada na tigela |
| `bowl_grams_after` | numeric | peso total da tigela logo após a liberação |
| `consumed_grams` | numeric | quanto saiu da tigela até o evento ser encerrado |
| `consumed` | boolean | verdadeiro quando o consumo chega a 80% da porção |
| `settled_at` | timestamp | quando a contagem de consumo foi encerrada |
| `source` | enum | sempre `synthetic` neste conjunto |

### `food_readings_sintetico.csv`

| Coluna | Tipo | Descrição |
|---|---|---|
| `device_id` | text | alimentador de origem |
| `bowl_grams` | numeric | peso na tigela naquele instante |
| `read_at` | timestamp | instante da leitura |
| `source` | enum | sempre `synthetic` |

### `ground_truth_anomalias.csv`

| Coluna | Tipo | Descrição |
|---|---|---|
| `data` | date | dia com anomalia injetada |
| `tipo` | enum | `low`, `skipped` ou `high` |

O esquema é idêntico ao da tabela `feeding_events` do banco de produção
(PostgreSQL/Supabase, ver `supabase/migrations/0001_schema.sql`), de propósito:
o mesmo pipeline roda sobre o conjunto sintético e sobre o dado real, sem
adaptação.

---

## 5. Reprodutibilidade

Rodar o gerador duas vezes produz arquivos **byte a byte idênticos**. Quatro
decisões garantem isso:

1. **Semente fixa** (`SEMENTE = 59635`, o número do SISPROJ).
2. **Período fixo** — datas absolutas, e não "os últimos 90 dias". Se fosse
   relativo, o conjunto mudaria a cada execução e o número citado no artigo
   deixaria de bater com o arquivo publicado.
3. **Identificadores determinísticos** — UUIDv5 sobre um namespace fixo, então
   a mesma linha recebe sempre o mesmo `id`.
4. **Zero dependências** — o gerador usa apenas a biblioteca padrão do Python.

```bash
cd analise
python gerar_dataset.py --saida dados
```

---

## 6. Anomalias com rótulo conhecido

As anomalias não foram sorteadas nem descobertas depois: são **injetadas em dias
escolhidos, com o tipo registrado à parte**. Isso permite medir a taxa de acerto
do detector, em vez de olhar o gráfico e concluir que ficou bom.

| Tipo | Dias | O que representa | Consumo médio no dia |
|---|---|---|---|
| `low` | 5 | animal comeu muito pouco | 124,9 g |
| `skipped` | 4 | uma refeição liberada e não retirada | 243,6 g |
| `high` | 3 | porção extra liberada pelo tutor e consumida | 407,3 g |
| — | 78 | dias normais | 346,1 g |

---

## 7. Para que serve — e o resultado obtido

O conjunto foi usado para validar dois algoritmos clássicos de aprendizado de
máquina. **Não há rede neural no projeto**, por escolha: o problema é de
agrupamento e detecção de desvio em uma série pequena e interpretável, e um
modelo profundo aqui só acrescentaria opacidade.

### K-means — descoberta da rotina alimentar

Agrupa os horários das refeições (minuto do dia). O número de grupos não é
arbitrado: o pipeline testa k de 2 a 6 e escolhe pelo maior coeficiente de
silhueta.

Resultado sobre os 90 dias: **k = 4, silhueta 0,946** — os três horários fixos
de refeição, mais um quarto grupo pequeno (7 eventos) correspondente aos
petiscos da tarde. O algoritmo separou o padrão regular do eventual sem nenhuma
informação prévia sobre os horários.

| Grupo | Janela | Refeições | Porção média | Dispersão |
|---|---|---|---|---|
| Manhã | 06:34–07:28 | 90 | 120 g | ±10 min |
| Tarde | 12:14–13:07 | 90 | 100 g | ±10 min |
| Tarde (petisco) | 15:29–16:42 | 7 | 40 g | ±27 min |
| Noite | 18:37–19:23 | 90 | 142 g | ±10 min |

### Z-score — detecção de anomalias de consumo

Aqui está o achado mais relevante da validação, e ele é desfavorável à
formulação original:

| Detector | VP | FP | FN | Precisão | Revocação | F1 |
|---|---|---|---|---|---|---|
| Z-score clássico, \|z\| > 2,0 | 5 | 0 | 7 | **1,00** | **0,42** | 0,59 |
| Z-score robusto (mediana/MAD), \|z\| > 3,5 | 12 | 2 | 0 | 0,86 | **1,00** | **0,92** |

Por tipo de anomalia:

| Tipo | Clássico | Robusto |
|---|---|---|
| `low` | 5/5 | 5/5 |
| `skipped` | **0/4** | 4/4 |
| `high` | **0/3** | 3/3 |

**Por que o clássico falha.** Média e desvio-padrão são calculados sobre a série
inteira — incluindo as próprias anomalias que se quer detectar. Com 12 dias
anômalos em 90, o desvio-padrão sobe para 57 g, bem acima da dispersão real dos
dias normais. O limiar de 2σ fica largo demais e só as anomalias extremas
(`low`, que derruba o consumo a cerca de um terço) ultrapassam. As anomalias
moderadas ficam escondidas dentro do próprio desvio que ajudaram a inflar. É o
efeito de mascaramento, conhecido na literatura.

**Por que o robusto funciona.** Trocando média por mediana e desvio-padrão por
MAD (*median absolute deviation*), a estatística de referência praticamente não
se move com uma minoria de valores extremos. O limiar de 3,5 é o usual para o
escore modificado de Iglewicz e Hoaglin. As 12 anomalias passam a ser
detectadas, ao custo de 2 falsos positivos.

**Consequência para o projeto:** manter as duas variantes calculadas e relatadas.
O conjunto sintético serviu exatamente para isso — expor uma limitação do método
antes de a coleta real começar, quando ainda é barato corrigir.

---

## 8. Limitações declaradas

1. **Os dados são sintéticos.** Nenhuma conclusão sobre comportamento animal
   real pode ser extraída daqui.
2. **Um único animal e um único dispositivo.** Não há variabilidade entre
   indivíduos, entre raças ou entre ambientes.
3. **As anomalias são injetadas**, com três tipos apenas. Anomalias reais tendem
   a ser mais sutis e mais variadas, e o desempenho medido aqui é provavelmente
   otimista.
4. **O ruído é gaussiano e independente.** Sensores reais apresentam deriva
   térmica, acomodação mecânica da estrutura impressa em 3D e vibração do motor
   de passo, nada disso modelado.
5. **Não há sazonalidade nem tendência de longo prazo** — o animal simulado não
   engorda, não adoece e não muda de rotina ao longo dos 90 dias.
6. **O volume é pequeno** para padrões de aprendizado de máquina: 277 eventos.
   É adequado aos métodos escolhidos (K-means e Z-score sobre uma série
   univariada) e seria insuficiente para qualquer modelo de maior capacidade.

---

## 9. Como reproduzir a análise

```bash
cd analise
pip install -r requirements.txt
python gerar_dataset.py --saida dados
python pipeline_analise.py --dados dados --saida resultados
```

Saída em `analise/resultados/`: `analysis_clusters.csv`,
`analysis_anomalies.csv`, `consumo_diario.csv` e `RESULTADO_ANALISE.json`, este
último com todos os números citados acima.

---
