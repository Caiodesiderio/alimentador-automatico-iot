# Entrega até as 14h — passo a passo

Ignora a parte física. Só o que a Samsung precisa receber: banco de dados,
dataset, explicação e GitHub.

Estado atual: **migrations 0001 a 0005 já rodadas no Supabase.**

Tempo estimado do que falta: **35 a 50 minutos.** O resto é folga.

---

## PASSO 1 — Popular o banco (10 min)

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

## PASSO 2 — Publicar no GitHub (15 min)

Descompacte o `repositorio-github.zip`. Dentro dele já está tudo: banco,
firmware, aplicativo completo, análise e documentação.

1. No GitHub: **New repository**
   - Nome sugerido: `alimentador-automatico-iot`
   - Visibilidade: **Public** — se ficar privado, quem revisar do lado da
     Samsung vê 404 e a submissão volta
   - **Não** marque "Add a README" (já existe um)

2. No terminal, dentro da pasta descompactada:

```bash
cd alimentador-automatico-iot
git init
git add .
git status          # PARE e leia a lista antes de continuar
```

3. **Confira o `git status` antes de commitar.** Não pode aparecer nenhum
   `.env`, nenhum `secrets.h`, nenhuma chave. O `.gitignore` já cobre os dois,
   mas conferir custa dez segundos e um vazamento de chave em repositório
   público é irreversível — mesmo apagando depois, fica no histórico.

```bash
git commit -m "Alimentador automático IoT: banco, firmware, app e análise"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/alimentador-automatico-iot.git
git push -u origin main
```

4. Abra o repositório no navegador e confirme que aparecem:
   - `DATASET.md` na raiz, renderizado
   - a pasta `analise/dados/` com os quatro arquivos
   - `README.md` na página inicial

---

## PASSO 3 — Preencher o formulário (15 min)

Abra `docs/samsung-dataset-registration.md`. Ele tem cada campo do
**Dataset Registration** com o texto pronto para copiar, já dentro dos limites
de caracteres.

Três pontos de atenção:

1. **Acquisition Route → Self Produced Data.** Esta é a resposta à pergunta
   "quais bancos de dados foram usados": nenhum de terceiros. Sem base pública,
   sem base comprada, sem raspagem da web.

2. **Data URL** e **URL Of Raw Data** — troque `<seu-usuario>/<seu-repositorio>`
   pelos valores reais e **abra os dois links no navegador** antes de enviar.

3. **Dataset Type** — se a lista tiver `Tabular` ou `CSV`, escolha essa. Se só
   houver as genéricas, `Text` serve (os arquivos são CSV em UTF-8).

---

## PASSO 4 — Opcional, se sobrar tempo (10 min)

Com o banco populado, o aplicativo mostra os dados de verdade. Se quiser ter
uma tela para mostrar junto da submissão:

```bash
cd app
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
bun install              # ou npm install
bun run dev
```

Abra `http://localhost:5173`. A aba **Análise** mostra os agrupamentos, as
anomalias e o gráfico de consumo dos 90 dias, com o aviso *"Dados simulados —
em validação técnica"* no topo — que é exatamente o que você quer que a banca e
a Samsung vejam.

O status do dispositivo vai aparecer como `offline`, e está certo: nenhuma ESP32
foi gravada ainda.

---

## O que dizer, em uma frase, se perguntarem

> O projeto não usou nenhuma base de dados de terceiros. O conjunto é
> autoproduzido e integralmente sintético, gerado por script com semente fixa e
> período absoluto, publicado junto com o código que o gera e com o pipeline que
> o consome. Serviu para validar dois algoritmos clássicos — K-means e Z-score —
> antes de existir coleta real, e nessa validação expôs uma limitação do
> Z-score clássico que motivou adotar a variante robusta.

---

## Ordem de prioridade, se o tempo apertar

1. **Passo 2** (GitHub público) — sem ele o formulário não pode ser enviado.
2. **Passo 3** (formulário).
3. **Passo 1** (carga no banco) — enriquece a resposta, mas o formulário não
   depende dela.
4. **Passo 4** — dispensável hoje.
