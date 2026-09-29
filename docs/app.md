

### Caminho 2 — APK de verdade, via Capacitor

Dá para gerar um `.apk`. O Capacitor empacota exatamente este mesmo site dentro
de um WebView Android. O que exige:

- instalar Android Studio e o JDK na sua máquina (alguns GB);
- `npm i @capacitor/core @capacitor/android`, `npx cap init`, `npx cap add android`;
- ajustar o app para build estático — e aqui está o problema, porque o TanStack
  Start faz renderização no servidor, e um APK não tem servidor. Daria trabalho
  de configuração, não é um comando só;
- gerar e assinar o APK.


att hj

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
o que é medição e o que é cálculo. 

---

## 5. O aviso "Dados simulados" f

Antes era um texto fixo dentro do componente. Agora ele sai do dado: cada linha
de `feeding_events` tem uma coluna `source` (`device` ou `synthetic`), e cada
execução do pipeline grava `dataset_kind` em `analysis_runs`.

- só registros sintéticos → *"Dados simulados — em validação técnica"*
- mistura dos dois → *"Dados parcialmente simulados"*, e o texto explica a mistura
- só dados reais → **o aviso some sozinho**

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

