# Etapa A — Backend (Supabase)

Alimentador automático IoT para pets de médio porte
PIBIC SISPROJ 59635 · UEA · Eng. de Controle e Automação
Orientação: Prof. Dr. Almir Kimura Júnior

--

## .Aplicar as migrations

**SQL Editor → New query**, cole e rode **um arquivo por vez, nesta ordem**:

| Arquivo | O que faz |
|---|---|
| `0001_schema.sql` | Tabelas, índices, gatilho de consumo, view `v_devices` |
| `0002_rls.sql` | RLS, privilégios coluna a coluna, bucket `snapshots` do Storage |
| `0003_rpc_dispositivo.sql` | Funções que o firmware chama (RPC) |
| `0004_realtime.sql` | Gatilho de reabastecimento e publicação Realtime |
| `0005_seed.sql` | Cria `esp32-01`, o pet e três agendamentos de exemplo |

A última linha da `0005` imprime o **device_token**. Copie e guarde: ele vai para o `secrets.h` (Etapa B) e **não está escrito em nenhum arquivo versionado**.

Se precisar gerar outro:

```sql
update public.devices
   set device_token = encode(gen_random_bytes(24), 'hex')
 where id = 'esp32-01'
returning device_token;
```

### Conferir que aplicou

```sql
select table_name from information_schema.tables
 where table_schema = 'public' order by 1;
-- devices, pets, hopper_refills, schedules, food_readings, feeding_events,
-- commands, analysis_runs, analysis_clusters, analysis_anomalies

select * from public.v_devices;   -- status deve vir 'offline' (ninguém deu heartbeat ainda)
```

---

## 3. Mapa do schema

```
devices ──┬── pets
          ├── schedules ─────┐
          ├── hopper_refills │
          ├── food_readings  │        (leituras da balança da TIGELA)
          ├── feeding_events ┘        (uma linha por porção liberada)
          ├── commands                (fila app → ESP32)
          └── analysis_runs ──┬── analysis_clusters   (K-means)
                              └── analysis_anomalies  (Z-score)
```

### O que é medido e o que é estimado

Como a célula de carga ficou **no comedouro**:

| Grandeza | Origem | Confiabilidade |
|---|---|---|
| Peso na tigela (`food_readings.bowl_grams`) | célula de carga | **medido** |
| Porção realmente liberada (`feeding_events.grams`) | diferença de peso na tigela | **medido** |
| Quanto o pet comeu (`feeding_events.consumed_grams`) | queda do peso na tigela desde a liberação | **medido** |
| Nível do reservatório (`devices.hopper_grams`) | capacidade − soma das porções desde o último reabastecimento | **estimado** |

O nível do reservatório só volta ao valor certo quando o tutor registra o reabastecimento pelo app (`insert into hopper_refills`). Na tela de Início esse número precisa aparecer rotulado como **estimado** 

### Como o consumo é calculado

O gatilho `tg_atualiza_consumo` roda a cada leitura de peso:

```
consumed_grams = bowl_grams_after (no momento da liberação) − bowl_grams (agora)
```

limitado entre 0 e a porção liberada. O evento é encerrado (`settled_at`) quando o pet consome ≥ 80 % da porção ou depois de 4 h — o que vier primeiro. Uma nova liberação também encerra o evento anterior.

Consequência prática: **é o Z-score que fica com dado real**, porque ele opera sobre consumo. 

---

## 4. Contrato HTTP usado pelo firmware (Etapa B)

Todas as chamadas do firmware são `POST` em `/rest/v1/rpc/<função>` com três cabeçalhos fixos:

```
apikey: <ANON_KEY>
Authorization: Bearer <ANON_KEY>
X-Device-Token: <DEVICE_TOKEN>
Content-Type: application/json
```

| Quando | Função | Corpo | Resposta |
|---|---|---|---|
| a cada ~30 s | `device_heartbeat` | `{"p_firmware":"1.0.0","p_bowl_grams":12.4,"p_rssi":-58}` | hora do servidor, nível do reservatório, nº de comandos pendentes |
| boot e a cada ~5 min | `device_get_config` | `{}` | agendamentos ativos + calibração salva |
| a cada ~3 s | `device_claim_commands` | `{"p_limit":3}` | lista de comandos, já marcados como `claimed` |
| ao terminar um comando | `device_complete_command` | `{"p_id":"<uuid>","p_ok":true,"p_result":{}}` | — |
| após girar o motor | `device_register_feeding` | `{"p_grams_target":120,"p_grams":118.4,"p_bowl_grams_after":130.8,"p_trigger":"manual","p_steps":2048,"p_command_id":"<uuid>"}` | uuid do evento |
| ao calibrar | `device_save_calibration` | `{"p_scale_factor":419.5,"p_scale_offset":-12345}` | — |
| ESP32-CAM, no boot | `device_set_stream_url` | `{"p_url":"http://192.168.0.87:81/stream"}` | — |

Teste rápido pelo terminal, antes de gravar qualquer firmware:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/device_heartbeat" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "X-Device-Token: $DEVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"p_firmware":"0.0.1","p_bowl_grams":0}'
```

Se voltar `{"device_id":"esp32-01", ...}`, o backend está pronto e a Etapa B pode começar. Se voltar erro de dispositivo não identificado, o token está errado.

### Por que fila de comandos e não requisição direta

A ESP32 está atrás de NAT: ninguém de fora abre conexão com ela. O app **insere** uma linha em `commands`; a ESP32 **pergunta** se há algo para ela. Três cuidados que o schema já resolve:

- **`claim` atômico** — o comando muda para `claimed` na mesma transação em que é entregue. Se a resposta se perder no Wi-Fi, ele não é entregue de novo e o pet não recebe porção dobrada.
- **Validade de 2 minutos** — comando vencido vira `expired` e nunca executa. Sem isso, uma queda de rede de 40 min faria o alimentador despejar tudo de uma vez quando voltasse.
- **O app não dá baixa** — a RLS só deixa o app inserir com `status='pending'`. Quem marca `done` é o firmware, pela função que exige o token.

---

## 5. Realtime

Assinatura ativa em `devices`, `food_readings`, `feeding_events`, `commands` e `schedules`. O app usa isso na Etapa D para atualizar a tela sem ficar repetindo requisição.

A ESP32 **não** usa Realtime: websocket em microcontrolador cai e trava com frequência. Ela faz polling, que é feio e funciona.

---

## 8. Validação feita

As cinco migrations foram aplicadas em um PostgreSQL 16 limpo e o fluxo completo foi exercitado, com os papéis `anon`/`authenticated` e o header simulados como o PostgREST faz:

| Verificação | Resultado |
|---|---|
| `anon` sem token chamando `device_heartbeat` | recusado (`42501`) |
| `anon` tentando ler `devices.device_token` | `permission denied` |
| App enfileirando `feed_now` | aceito, `pending`, validade 2 min |
| App tentando inserir comando já `done` | recusado pela RLS |
| Firmware com token: heartbeat, config, claim | OK |
| Segundo `claim` do mesmo comando | fila vazia — sem entrega dupla |
| 118,4 g liberados, tigela em 130,8 g → 60,0 g | `consumed_grams = 70,8`, evento aberto |
| tigela em 18,0 g | `consumed_grams = 112,8`, `consumed = true`, evento fechado |
| Nível estimado do reservatório | 1800 → 1681,6 g |
| Comando vencido | vira `expired`, não é entregue |
| `v_devices.status` após heartbeat | `online` |
