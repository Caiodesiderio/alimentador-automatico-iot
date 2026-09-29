# Pet Feeder Hub

Crie um aplicativo web mobile-first (PWA instalável) para controle de um

alimentador automático de pets IoT. O dispositivo físico é baseado em ESP32,

com célula de carga (HX711) medindo o nível de ração, motor de passo

28BYJ-48 para liberar o alimento, e uma ESP32-CAM para vídeo ao vivo.

STACK E ABORDAGEM

- React + TypeScript + Tailwind + shadcn/ui.

- Mobile-first. Projete para 390x844px. O app será usado no celular.

- Configure como PWA instalável: manifest, ícones, display standalone,

  tema azul. Deve abrir em tela cheia quando adicionado à tela inicial.

- NÃO implemente backend nesta etapa. Todos os dados vêm de uma camada mock

  centralizada em um único arquivo `src/lib/mockApi.ts`, exportando funções

  async com delay simulado (300-800ms). Nenhum componente deve conter dados

  hardcoded — tudo passa pelo mockApi. Isso é obrigatório: na etapa seguinte

  vou substituir esse arquivo por Supabase e por chamadas HTTP diretas à ESP32.

- Defina os tipos em `src/lib/types.ts`.

IDENTIDADE VISUAL

- Limpo, claro, com bastante respiro. Fundo off-white/cinza muito claro.

- Cor primária: azul (#2563EB). Verde para estados OK, âmbar para atenção,

  vermelho para crítico/offline.

- Cards com cantos bem arredondados (rounded-2xl) e sombra sutil.

- Tipografia: Inter. Números de destaque grandes e em peso bold.

- Ícones: lucide-react.

NAVEGAÇÃO

Barra inferior fixa com 4 abas: Início, Agenda, Câmera, Análise.

--- TELA 1: INÍCIO ---

Cabeçalho: saudação com nome do tutor e nome do pet ("Max"), avatar do pet,

e um badge de status de conexão do dispositivo (Online / Offline /

Conectando) com ponto colorido.

Card principal — NÍVEL DE RAÇÃO:

- Percentual grande (ex: 72%) e barra de progresso.

- Peso absoluto em gramas abaixo (ex: "1.440 g de 2.000 g").

- Cor da barra muda conforme faixa: verde >40%, âmbar 15-40%, vermelho <15%.

- Quando abaixo de 15%, mostrar alerta "Reservatório baixo — reabasteça".

- Timestamp da última leitura ("atualizado há 2 min") e botão de refresh

  com estado de loading.

Linha de três estatísticas compactas: Próxima refeição (horário),

Última refeição (horário + gramas), Consumo hoje (gramas).

BOTÃO PRINCIPAL — ALIMENTAR AGORA:

- Botão grande, primário, largura total.

- Ao tocar, abre um modal de confirmação com um seletor de porção

  (50g / 100g / 150g / personalizado em gramas).

- Ao confirmar: estado de carregamento ("Liberando ração..."), depois

  animação de sucesso com check verde e mensagem "120 g liberados".

- Trate o caso de dispositivo offline: botão desabilitado com explicação.

Três atalhos em cards horizontais logo abaixo:

- "Agendar refeição" → leva ao fluxo de agendamento (TELA 2)

- "Ver ao vivo" → leva à aba Câmera

- "Análise de consumo" → leva à aba Análise, mostrando no card um resumo

  de uma linha (ex: "Padrão regular — nenhuma anomalia nos últimos 7 dias"

  ou "1 anomalia detectada ontem")

--- TELA 2: AGENDAMENTO (fluxo principal do app) ---

Na aba Agenda, liste os agendamentos existentes como cards, cada um com:

horário em destaque, porção em gramas, dias da semana ativos (chips),

e um switch para ativar/desativar. Swipe ou menu de contexto para excluir.

Se não houver nenhum, mostre um estado vazio amigável com ilustração

e botão de criar o primeiro.

Botão flutuante (FAB) "+" para novo agendamento, que abre uma página

dedicada (não um modal) com os seguintes campos:

1. HORÁRIO — seletor de hora grande e fácil de usar com o polegar.

2. FREQUÊNCIA — três opções em segmented control:

   - Diariamente

   - Dias específicos (revela chips de S T Q Q S S D, multi-seleção)

   - Uma única vez (revela seletor de data)

3. PORÇÃO — slider de gramas (20 a 300 g) com valor numérico em destaque.

4. NOME OPCIONAL do agendamento (ex: "Café da manhã").

Rodapé fixo com botão "Agendar". Ao tocar:

- Estado de carregamento.

- Tela cheia de confirmação com animação de check verde e o resumo do

  agendamento em texto ("Todos os dias às 07:00 · 120 g").

- Após ~1,5s, volta automaticamente para a tela Início, e o card de

  "Próxima refeição" já reflete o novo horário.

Validação: impedir salvar sem horário definido, ou sem nenhum dia

selecionado quando a frequência for "dias específicos".

--- TELA 3: CÂMERA ---

- Área de vídeo em destaque, proporção 4:3, cantos arredondados.

  O stream é MJPEG servido pela ESP32-CAM na rede local e deve ser exibido

  em uma tag <img> cujo src vem do mockApi como `streamUrl`.

- Overlay com indicador "AO VIVO" pulsante e qualidade do sinal.

- Estados obrigatórios: conectando (skeleton animado), stream ativo,

  e falha de conexão (com botão "Tentar novamente" e mensagem explicando

  que a câmera precisa estar na mesma rede local).

- Abaixo do vídeo, botões: capturar foto, alternar tela cheia, e

  "Alimentar agora" (mesmo modal da tela Início — a pessoa vê o pet e

  libera a ração na hora).

--- TELA 4: ANÁLISE ---

Esta tela apresenta os resultados de um pipeline de análise que roda no

backend em Python (K-means para agrupar rotinas de alimentação e Z-score

para detectar anomalias de consumo). O app apenas consome e exibe os

resultados já calculados — não implemente os algoritmos no front-end.

Seletor de período no topo: 7 dias / 30 dias / 90 dias.

Card 1 — CONSUMO AO LONGO DO TEMPO:

Gráfico de barras (recharts) com gramas consumidos por dia. Barras de dias

com anomalia detectada em vermelho, as demais em azul.

Card 2 — ROTINAS IDENTIFICADAS (K-means):

Mostre os clusters de horário encontrados como cards, cada um com o rótulo

do agrupamento (ex: "Manhã — 06:40 às 07:30"), a porção média em gramas,

e quantos registros pertencem ao grupo. Inclua uma visualização simples da

distribuição dos horários ao longo do dia.

Card 3 — ANOMALIAS DETECTADAS (Z-score):

Lista de eventos atípicos, cada um com data, descrição legível

(ex: "Consumo 62% abaixo da média", "Refeição não consumida"),

o valor de z-score, e um badge de severidade. Estado vazio positivo

quando não houver nenhuma.

Card 4 — RESUMO: três métricas — consumo médio diário, regularidade

de horário, e total de anomalias no período.

IMPORTANTE: inclua no topo desta tela um aviso discreto porém visível:

"Dados simulados — em validação técnica". O conjunto de dados atual é

sintético, gerado para validar o funcionamento dos algoritmos, e não

representa medições reais do animal.

--- ESTRUTURA DOS DADOS MOCK ---

Em `src/lib/types.ts`, defina ao menos:

Device: { id, name, status: 'online'|'offline'|'connecting', firmwareVersion,

  lastSeen, streamUrl }

Pet: { id, name, avatarUrl, weightKg, dailyTargetGrams }

FoodLevel: { percentage, currentGrams, capacityGrams, readAt }

FeedingEvent: { id, timestamp, grams, trigger: 'scheduled'|'manual',

  consumedGrams, consumed: boolean }

Schedule: { id, label, time, frequency: 'daily'|'weekly'|'once',

  weekdays: number[], date, portionGrams, enabled }

Cluster: { id, label, startTime, endTime, avgPortionGrams, eventCount }

Anomaly: { id, date, type, description, zScore, severity: 'low'|'medium'|'high' }

Popule o mock com ~90 dias de histórico de alimentação plausível: três

refeições diárias com pequena variação de horário e porção, e 4 ou 5

anomalias distribuídas (refeições omitidas, consumo muito abaixo da média,

consumo anormalmente alto).

--- REQUISITOS GERAIS ---

- Todo estado de carregamento deve usar skeleton, nunca spinner em tela cheia.

- Todo estado vazio e todo estado de erro devem estar implementados, nunca

  uma tela em branco.

- Feedback tátil visual em todos os botões de ação.

- Acessibilidade: alvos de toque de no mínimo 44px, contraste adequado,

  labels em todos os controles.

- Toda a interface em português do Brasil.

- Não crie tela de login nem cadastro nesta etapa.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eb409856-cda6-4e79-a6b1-76ceff8c492c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
