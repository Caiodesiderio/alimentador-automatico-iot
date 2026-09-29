# Roteiro de bancada — do zero até o alimentador funcionando

Ordem prática de execução. Cada fase depende da anterior.
Tempo total estimado: **3 a 4 horas**, sem contar imprevisto de montagem.

> **Atenção à ordem.** A fiação vem depois do Supabase, não antes. O firmware
> precisa da URL, da anon key e do device_token para compilar — sem o projeto
> criado, você monta tudo e trava na hora de gravar.

---

## Antes de começar — o que ter na mesa

- [ ] Notebook com Arduino IDE instalado
- [ ] Cabo USB que **transmite dados** (muitos cabos de carregador só têm energia — é a causa nº 1 de "a porta não aparece")
- [ ] Protoboard e jumpers macho-fêmea
- [ ] Fonte + conversor step-down já ajustado em **5,0 V** (confira com o multímetro **antes** de ligar em qualquer coisa)
- [ ] Um peso conhecido entre 100 e 300 g para a calibração — pacote fechado com peso impresso, ou uma garrafinha de 200 ml cheia de água (200 g)
- [ ] Ração
- [ ] Multímetro

---

# FASE 0 — Supabase (~30 min)

Sem esta fase, nada mais funciona.

- [ ] **0.1** Criar conta em `supabase.com` → **New project**
  - Name: `alimentador-pet`
  - Region: **South America (São Paulo)**
  - Database password: gere uma forte e guarde fora do repositório
- [ ] **0.2** Esperar o provisionamento terminar (~2 min)
- [ ] **0.3** SQL Editor → **New query** → colar e rodar, **um de cada vez, nesta ordem**:
  1. `supabase/migrations/0001_schema.sql`
  2. `supabase/migrations/0002_rls.sql`
  3. `supabase/migrations/0003_rpc_dispositivo.sql`
  4. `supabase/migrations/0004_realtime.sql`
  5. `supabase/migrations/0005_seed.sql`
- [ ] **0.4** A `0005` termina imprimindo o **device_token**. Copie agora — você vai precisar dele na Fase 2.
- [ ] **0.5** Project Settings → API → copiar **Project URL** e a chave **anon public**

  > A chave **service_role** não é usada em lugar nenhum deste projeto. Ignore.

- [ ] **0.6** Conferir que aplicou: SQL Editor →
  ```sql
  select id, name, status, hopper_grams from public.v_devices;
  ```
  Deve aparecer `esp32-01` com status `offline`. É o esperado — ninguém deu heartbeat ainda.

**Fase 0 concluída quando:** você tem em mãos a URL, a anon key e o device_token, e o `select` acima retorna uma linha.

---

# FASE 1 — Montagem física (~45 min)

**Tudo desligado da energia enquanto você monta.**

## 1.1 Alimentação — faça esta parte primeiro e confira com o multímetro

- [ ] Ajustar a saída do step-down em **5,0 V** e medir antes de conectar
- [ ] 5 V do step-down → trilho **+** da protoboard
- [ ] GND do step-down → trilho **−** da protoboard
- [ ] GND da ESP32 → trilho **−** (o GND precisa ser comum entre tudo)

> Um capacitor eletrolítico de 470 µF a 1000 µF entre + e − da protoboard, o
> mais perto possível do ULN2003, segura o tranco da partida do motor. Não é
> obrigatório, mas evita a ESP32 reiniciar sozinha no meio da dosagem.
> **Respeite a polaridade** — a perna curta vai no negativo.

## 1.2 HX711 (célula de carga)

| HX711 | Vai em |
|---|---|
| VCC | **3V3 da ESP32** |
| GND | trilho − |
| DT (DOUT) | **GPIO 18** |
| SCK | **GPIO 19** |

- [ ] Ligado

> **VCC em 3,3 V, nunca em 5 V.** O nível do pino DOUT acompanha a alimentação.
> Em 5 V, ele entrega 5 V no GPIO 18 e a ESP32 não tolera isso na entrada — pode
> funcionar por semanas e morrer depois, que é o pior tipo de defeito.

## 1.3 Célula de carga → HX711

| Fio | Terminal |
|---|---|
| vermelho | E+ |
| preto | E− |
| branco | A− |
| verde | A+ |

- [ ] Ligado

> Se depois o peso aparecer negativo ao apertar a tigela, troque branco e verde.
> Fabricante nenhum segue a mesma convenção de cor.

## 1.4 ULN2003 (motor)

| ULN2003 | Vai em |
|---|---|
| IN1 | **GPIO 32** |
| IN2 | **GPIO 33** |
| IN3 | **GPIO 25** |
| IN4 | **GPIO 26** |
| + (VCC) | **trilho + (5 V do step-down)** |
| − (GND) | trilho − |

- [ ] Ligado
- [ ] Conector branco do 28BYJ-48 encaixado na placa do ULN2003

> O `+` do ULN2003 vai no step-down, **não** no pino 5V da ESP32. O motor puxa
> até 300 mA nos picos e o regulador da placa não dá conta — a tensão cai e a
> ESP32 reinicia no meio da dosagem.

## 1.5 Conferência antes de energizar

- [ ] Nenhum fio de 5 V encostando em pino da ESP32 que não seja o VIN
- [ ] GND comum entre step-down, ESP32, HX711 e ULN2003
- [ ] Multímetro em continuidade: sem curto entre + e −
- [ ] Célula de carga fixada de forma **rígida** na estrutura, sem fio encostando nela

**Fase 1 concluída quando:** você energiza e nada esquenta, e a ESP32 acende o LED de energia.

---

# FASE 2 — Gravar o firmware (~30 min)

## 2.1 Preparar o Arduino IDE

- [ ] `Arquivo → Preferências → URLs adicionais de gerenciadores de placas`, adicionar:
  ```
  https://espressif.github.io/arduino-esp32/package_esp32_index.json
  ```
- [ ] `Ferramentas → Placa → Gerenciador de Placas` → instalar **esp32** (Espressif Systems)
- [ ] `Ferramentas → Gerenciar Bibliotecas` → instalar:
  - **ArduinoJson** (Benoit Blanchon) — versão **7.x**. A 6.x não compila este código.
  - **HX711 Arduino Library** (Bogdan Necula)

## 2.2 Preencher as credenciais

- [ ] Na pasta `firmware/alimentador_esp32/`, copiar `secrets.example.h` para `secrets.h`
- [ ] Preencher o `secrets.h`:
  - `WIFI_SSID` → `Fablab 2.0`
  - `WIFI_SENHA` → a senha da rede
  - `SUPABASE_URL` → o Project URL da Fase 0.5, **sem barra no final**
  - `SUPABASE_ANON` → a anon key
  - `DEVICE_TOKEN` → o token da Fase 0.4
  - `DEVICE_ID` → deixar `esp32-01`

> O `secrets.h` já está no `.gitignore`. Ele nunca vai para o Git.

## 2.3 Gravar

- [ ] `Ferramentas → Placa → ESP32 Dev Module`
- [ ] `Ferramentas → Porta` → selecionar a porta da ESP32
- [ ] Upload Speed: `921600` (se falhar, baixe para `115200`)
- [ ] Compilar e enviar
- [ ] Abrir o Monitor Serial em **115200 baud**

## 2.4 O que deve aparecer no Serial

```
============================================================
  ALIMENTADOR AUTOMÁTICO PARA PETS — ESP32
  ...
[Balança] Pronta e tarada.
[WiFi] Conectando à rede: Fablab 2.0
[WiFi] Conexão estabelecida com sucesso!
[WiFi] Endereço IP do ESP32: 192.168.1.141
[Relógio] Acertado: 21/09/2026 20:14:33 (Manaus)
[Config] 2 agendamento(s) ativo(s):
```

- [ ] Digitar `i` e conferir: Wi-Fi conectado, relógio sincronizado, agendamentos recebidos
- [ ] No Supabase, rodar de novo:
  ```sql
  select id, status, last_seen from public.v_devices;
  ```
  **O status precisa estar `online`.** Se estiver, a ESP32 está falando com o banco e a parte mais difícil acabou.

### Se der errado

| Sintoma | Causa provável |
|---|---|
| a porta não aparece | cabo USB só de energia, ou falta o driver CP210x / CH340 |
| trava em "Connecting…" | segurar o botão **BOOT** durante o upload |
| `[Balança] HX711 NÃO respondeu` | DT e SCK trocados, ou falta GND comum |
| `[WiFi] Falhou` | SSID ou senha errados. A ESP32 **não enxerga rede de 5 GHz** — só 2,4 GHz |
| erro 401/403 nas chamadas | device_token ou anon key errados no `secrets.h` |
| `[Relógio]` não acerta | a rede bloqueia NTP. Não é problema: o heartbeat acerta pelo servidor |

---

# FASE 3 — Calibrar a balança (~20 min)

Com o Monitor Serial aberto:

- [ ] **3.1** Tigela vazia, no lugar definitivo dela. Digitar `t` → tara
- [ ] **3.2** Digitar `p` → deve ler perto de 0 g
- [ ] **3.3** Digitar `c` e seguir as instruções:
  1. Enter com a tigela vazia (tara de novo)
  2. colocar o peso conhecido
  3. digitar quantos gramas ele tem e Enter
- [ ] **3.4** Conferir: o firmware lê o peso de volta e mostra. Precisa bater com o real
- [ ] **3.5** Digitar `s` → salva o fator no Supabase

  > A partir daqui, regravar o firmware não perde mais a calibração: no boot
  > o `device_get_config` traz o fator de volta do banco.

- [ ] **3.6** Testar com dois ou três pesos diferentes usando `p`. Erro abaixo de ~2 g em toda a faixa está bom

---

# FASE 4 — Primeiro teste de dosagem (~20 min)

- [ ] **4.1** Encher o reservatório com ração
- [ ] **4.2** Digitar `d` → dispensa 20 g de teste
- [ ] **4.3** Anotar a linha que aparece:
  ```
  [Dosagem] Rendimento medido: XX.X g/volta
  ```
  **Este número vai para o artigo.** É o rendimento real do seu dosador, medido, não estimado.
- [ ] **4.4** Abrir `alimentador_esp32.ino`, trocar
  `GRAMAS_POR_VOLTA_ESTIMADO = 18.0` pelo valor medido, e regravar
- [ ] **4.5** Digitar `d` de novo — agora a dosagem deve ficar mais direta

## 4.6 Testar a fila de comandos (é o que o botão "Alimentar agora" do app vai fazer)

No SQL Editor do Supabase:

```sql
insert into public.commands (device_id, type, payload)
values ('esp32-01', 'feed_now', '{"grams": 40}');
```

- [ ] Em até 3 segundos o motor gira
- [ ] Conferir o resultado:
  ```sql
  select type, status, result from public.commands order by created_at desc limit 1;
  ```
  `status` deve estar `done` e `result` traz os gramas realmente liberados

## 4.7 Testar o agendamento

```sql
-- troque 14:35 por dois ou três minutos à frente, no horário de Manaus
insert into public.schedules (device_id, label, time_of_day, frequency, portion_grams, enabled)
values ('esp32-01', 'Teste', '14:35', 'daily', 40, true);
```

- [ ] Reiniciar a ESP32 (ela recarrega os agendamentos a cada 5 min, ou no boot)
- [ ] Esperar a hora chegar e ver o motor girar sozinho
- [ ] **Teste que impressiona a banca:** desligue o Wi-Fi do roteador e repita. O agendamento executa mesmo assim, porque a ESP32 guarda tudo na memória e usa o relógio interno. Religue e veja o registro aparecer no banco.

## 4.8 Conferir o consumo (o dado que alimenta o Z-score)

- [ ] Depois de uma dosagem, tirar ração da tigela com a mão, simulando o pet comendo
- [ ] Esperar uns 30 s (um ciclo de heartbeat) e rodar:
  ```sql
  select grams, consumed_grams, consumed, settled_at
    from public.feeding_events order by occurred_at desc limit 1;
  ```
  `consumed_grams` deve ter subido sozinho. É o gatilho do banco fazendo a conta.

**Fase 4 concluída quando:** o item 4.6 funciona. Nesse ponto o backend e o firmware estão integrados de verdade.

---

# FASE 5 — Teste de rede (faça ainda hoje, leva 5 min)

Este teste não é sobre o alimentador. É sobre a **rede do Fablab**, e o resultado
dele decide se o plano da apresentação funciona.

O plano combinado é: notebook servindo o app em HTTP, celular na mesma rede
acessando pelo IP do notebook, e o stream da câmera entrando direto. Isso só
funciona se a rede **deixar um aparelho falar com o outro**. Muita rede
institucional tem isolamento de clientes ligado justamente para impedir isso.

- [ ] **5.1** No notebook, conectado na Fablab 2.0, descobrir o IP: `ipconfig` (Windows) ou `ip addr` (Linux)
- [ ] **5.2** Subir um servidor qualquer:
  ```bash
  python -m http.server 8080
  ```
- [ ] **5.3** No celular, na mesma rede, abrir `http://IP-DO-NOTEBOOK:8080`

**Se abrir:** o plano está de pé.

**Se não abrir:** a rede isola os clientes, e precisamos mudar a estratégia antes
da apresentação — as saídas são usar o roteador do laboratório em modo aberto,
levar um roteador próprio, usar o celular como roteador (Wi-Fi do celular
compartilhado, notebook e ESP32 conectados nele), ou passar para o plano de
snapshot pelo Supabase Storage. **Me avise o resultado**, porque isso muda o que
eu escrevo na Etapa C.

- [ ] **5.4** Aproveitar e reservar o IP da ESP32 no DHCP do roteador (`192.168.1.141`), se você tiver acesso à administração. Evita a surpresa de o IP mudar na véspera.

---

# E o app? — Etapa D, ainda não feita

**O app continua exatamente como veio do Lovable: 100% dados falsos.** Nada nele
mudou até agora. Ele lê tudo de `src/lib/mockApi.ts`, que inventa peso, inventa
histórico de 90 dias e simula o botão de alimentar com um `setTimeout`. Se você
abrir hoje, funciona bonito e não tem relação nenhuma com o hardware.

A Etapa D é o que liga os dois. O que ela faz:

- troca o conteúdo de `mockApi.ts` por chamadas reais ao Supabase, **mantendo os
  mesmos nomes e as mesmas assinaturas de função** — nenhum componente de tela
  precisa ser tocado;
- `feedNow()` deixa de ser simulação e passa a inserir na tabela `commands`,
  aguardando o comando virar `done`;
- o nível de ração passa a vir do banco, com o rótulo **estimado** (porque a
  célula de carga está na tigela, não no reservatório);
- entra um botão "reabasteci o reservatório", que hoje não existe e sem o qual a
  estimativa de nível só cai e nunca sobe;
- Realtime: peso e refeições aparecem na tela sozinhos, sem recarregar;
- estados de erro e offline de verdade;
- `.env` com `.env.example` versionado.

## Sugestão de ordem: fazer D antes de C

Combinamos A → F, mas acho que vale inverter as duas próximas, por três motivos:

1. A Etapa C está **travada** — ainda preciso saber o modelo da sua ESP32-CAM e
   se você tem adaptador USB-serial para gravá-la.
2. A Etapa D não depende em nada da câmera. A aba Câmera já trata falha de stream
   sozinha: sem a ESP32-CAM no ar, ela mostra "sem conexão com a câmera" e o
   resto do app funciona normalmente.
3. É o app que a banca vai olhar. Ter ele mexendo o hardware de verdade é o que
   muda a demonstração de "protótipo de bancada" para "sistema integrado" — a
   câmera é uma aba a mais.

Se concordar, depois da Fase 4 seguimos para a Etapa D e deixamos a câmera para
o final.
