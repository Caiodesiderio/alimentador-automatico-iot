# Etapa D — App integrado ao Supabase

O app deixou de ser maquete. Toda a camada de dados falsa saiu e entrou o
cliente real do Supabase, mantendo as mesmas assinaturas de função — por isso
nenhuma tela precisou ser reescrita.

Entrega: `petfeeder-app-integrado.zip` (projeto inteiro, pronto para rodar) e a
pasta `app/`, com só os arquivos alterados, caso você prefira aplicar por cima
do seu repositório.

---

## 1. Primeiro, a correção mais importante: **não existe APK**

Você pediu um APK para instalar no celular. Isso não é possível com o app do
jeito que ele é hoje, e é melhor saber agora do que na véspera.

O que o Lovable gerou é uma **aplicação web** — React, TypeScript, TanStack
Start. Não é um aplicativo Android. APK é um formato de empacotamento do
Android, gerado a partir de um projeto Android; um site não vira APK só por ser
exportado.

Existem três caminhos, e eles não são equivalentes:

### Caminho 1 — PWA (é o que eu recomendo, e já está pronto)

O app **já é um PWA completo**: o `manifest.webmanifest` do projeto tem nome,
ícones de 192 e 512 px e `display: standalone`. Na prática, isso significa que
no celular você abre o endereço no Chrome, toca no menu → **"Instalar
aplicativo"** ou **"Adicionar à tela inicial"**, e a partir daí:

- aparece um ícone na tela inicial, igual a qualquer app;
- abre em tela cheia, **sem a barra de endereço do navegador**;
- aparece na lista de apps recentes do Android com nome e ícone próprios.

Para quem está assistindo a apresentação, é indistinguível de um app instalado.
Custo: zero. Requisito: o app precisa estar em **HTTPS** (a instalação de PWA
não funciona em HTTP puro).

### Caminho 2 — APK de verdade, via Capacitor

Dá para gerar um `.apk`. O Capacitor empacota exatamente este mesmo site dentro
de um WebView Android. O que exige:

- instalar Android Studio e o JDK na sua máquina (alguns GB);
- `npm i @capacitor/core @capacitor/android`, `npx cap init`, `npx cap add android`;
- ajustar o app para build estático — e aqui está o problema, porque o TanStack
  Start faz renderização no servidor, e um APK não tem servidor. Daria trabalho
  de configuração, não é um comando só;
- gerar e assinar o APK.

Resultado final: o **mesmo app**, dentro de uma casquinha. Nenhum recurso novo.
Se a banca exigir um arquivo `.apk` entregue, a gente faz — mas é uma sessão
inteira de trabalho para um ganho que o público não percebe.

### Caminho 3 — publicar na Play Store

Fora de escopo: exige conta de desenvolvedor paga e revisão da Google.

**Minha recomendação:** Caminho 1. Se em algum momento o regulamento do PIBIC
pedir o arquivo do aplicativo, me avise e eu faço o Caminho 2.

---

## 2. A outra correção: "conectado ao Wi-Fi" não se aplica ao app

O app não se conecta a rede nenhuma — quem conecta é o celular. E ele **nunca
fala direto com a ESP32 principal**, mesmo estando na mesma Wi-Fi: a ESP32 está
atrás de NAT e não aceita conexão de entrada.

```
celular  ──HTTPS──>  Supabase  <──HTTPS──  ESP32   (ela é que pergunta, de 3 em 3 s)
   │
   └── HTTP direto, só na rede local ──>  ESP32-CAM    ← só o vídeo passa aqui
```

"Alimentar agora" é uma linha inserida na tabela `commands`. A ESP32 busca essa
linha no polling dela, executa, pesa o que caiu e dá baixa. O app fica olhando o
status até virar `done`. Por isso o app funciona de qualquer lugar — inclusive
do 4G, longe de casa —, e por isso só o vídeo exige estar na mesma rede.

---

## 3. O que mudou, arquivo por arquivo

### Arquivos novos

| Arquivo | Para quê |
|---|---|
| `src/lib/supabase.ts` | cria o cliente a partir do `.env`; avisa se não foi configurado |
| `src/lib/api.ts` | **a camada de dados real** — substitui o `mockApi.ts` |
| `src/lib/realtime.ts` | assinatura Realtime; a tela se atualiza sozinha |
| `src/components/AvisoRede.tsx` | faixa de aviso para "sem internet" e "`.env` em branco" |
| `src/vite-env.d.ts` | declara as variáveis de ambiente para o TypeScript |
| `.env.example` | modelo das credenciais (versionado; o `.env` não é) |

### Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/lib/types.ts` | campos novos, todos opcionais: `FoodLevel.isEstimate`, `CameraStream.mode`/`snapshotUrl`, `Analysis.datasetKind`/`ranAt`, e o tipo `BowlWeight` |
| `src/routes/index.tsx` | rótulo "estimado", peso medido na tigela, botão de reabastecer, estado de erro no card |
| `src/routes/analise.tsx` | o aviso "Dados simulados" virou condicional |
| `src/components/FeedDialog.tsx` | mostra o erro real do dispositivo; aviso de que a dosagem pode demorar |
| `src/routes/__root.tsx` | liga o Realtime e a faixa de aviso |
| `agenda.index.tsx`, `agenda.novo.tsx`, `camera.tsx` | só o caminho do import |
| `package.json` | dependência `@supabase/supabase-js` |
| `.gitignore` | `.env` — não estava lá, e precisa estar |

### Arquivo removido

`src/lib/mockApi.ts`. Preferi apagar a deixar um arquivo chamado "mock" cheio de
código real: a banca vai ler esse repositório.

---

## 4. As mudanças que vieram da célula de carga estar na tigela

Esta decisão obrigou três mudanças de tela, e todas as três são defensáveis:

**1. O nível do reservatório aparece como estimado.** O card de "Nível de ração"
ganhou a legenda *"estimado por saldo — a balança fica na tigela"*. O número é o
saldo entre a última carga registrada e a soma das porções liberadas.

**2. Entrou o botão "Reabasteci o reservatório".** Sem ele a estimativa só cai e
nunca sobe — o sistema não tem como perceber sozinho que alguém encheu o tanque.
É o único dado do app que depende de o usuário avisar.

**3. Apareceu o peso medido, ao lado da estimativa.** Logo abaixo do nível, o app
mostra *"na tigela agora: 84 g (medido)"*. Ter os dois lado a lado deixa explícito
o que é medição e o que é cálculo. É exatamente o tipo de distinção que uma banca
cobra, e melhor você apresentar do que ser perguntado.

---

## 5. O aviso "Dados simulados" ficou honesto sozinho

Antes era um texto fixo dentro do componente. Agora ele sai do dado: cada linha
de `feeding_events` tem uma coluna `source` (`device` ou `synthetic`), e cada
execução do pipeline grava `dataset_kind` em `analysis_runs`.

- só registros sintéticos → *"Dados simulados — em validação técnica"*
- mistura dos dois → *"Dados parcialmente simulados"*, e o texto explica a mistura
- só dados reais → **o aviso some sozinho**

Ninguém precisa lembrar de apagar o aviso quando a coleta real começar — e
ninguém corre o risco de esquecer de colocá-lo de volta. Para um trabalho em que
a natureza sintética do conjunto foi declarada formalmente aos avaliadores, isso
vale mais que o aviso em si.

---

## 6. Como rodar

```bash
cd petfeeder-app
cp .env.example .env      # e preencha
bun install               # ou npm install
bun run dev               # ou npm run dev
```

No `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_DEVICE_ID=esp32-01
VITE_TUTOR_NOME=Caio
```

Sem isso o app sobe assim mesmo, mas mostra uma faixa vermelha *"App não
configurado"* em vez de ficar girando para sempre.

### Publicar em HTTPS (necessário para instalar como PWA)

No Lovable, o botão **Publish** dá um endereço `https://...`. As variáveis de
ambiente precisam ser cadastradas lá também — o `.env` da sua máquina não sobe
junto, e nem deve.

Depois: abra o endereço no celular → menu do Chrome → **Instalar aplicativo**.

---

## 7. O que ainda não funciona, e por quê

| Ainda não funciona | Motivo |
|---|---|
| Qualquer dado | O projeto no Supabase ainda não existe (Fase 0 do roteiro de bancada) |
| Status "online", peso, nível | Dependem da ESP32 gravada e conectada (Fases 1 a 4) |
| Alimentar agora | Precisa da ESP32 buscando a fila de comandos |
| Aba Câmera | Etapa C, ainda não feita. Enquanto isso a tela mostra "sem conexão com a câmera" e o resto do app funciona normalmente |
| Agrupamentos e anomalias | Etapa E — o pipeline Python ainda não gravou nenhuma execução. O gráfico de consumo por dia já funciona, porque é calculado do próprio histórico |

**Ordem para ver o app vivo:** Fase 0 do roteiro (Supabase) → preencher o `.env`
→ `bun run dev`. Já nesse ponto o app mostra o pet, a agenda e o status
`offline`. Quando a ESP32 subir, o status vira `online` sozinho, sem recarregar
a página — é o Realtime funcionando.

---

## 8. Validação feita

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` no projeto inteiro | sem erros |
| `bun run build` (produção, com SSR) | compila e gera o bundle |
| Renderização do servidor (SSR) | HTTP 200, título certo, sem página de erro |
| Comportamento com `.env` em branco | mostra a faixa "App não configurado", não quebra |
| **Toda consulta do `api.ts` rodada no banco real, como o papel `anon`** | todas funcionam; nomes de tabela e coluna conferem |
| `createSchedule` nas três frequências | aceitas, respeitando as restrições do schema |
| `refillHopper` | aceito, e o gatilho atualiza o nível do reservatório |
| `refillHopper` acima da capacidade | recusado pela RLS, como deveria |

O que **não** foi testado, porque exige o hardware: o ciclo completo de
"alimentar agora" com a ESP32 respondendo de verdade, e a assinatura Realtime
contra um projeto Supabase real.
