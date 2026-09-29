# Etapa B — Pinagem, montagem, gravação e calibração

Firmware da ESP32 principal · `firmware/alimentador_esp32/alimentador_esp32.ino`

---

## 1. Tabela de pinagem

| Componente | Pino do componente | GPIO da ESP32 | Observação |
|---|---|---|---|
| HX711 | DT (DOUT) | **GPIO 18** | saída do HX711, entrada na ESP32 |
| HX711 | SCK | **GPIO 19** | clock, saída da ESP32 |
| HX711 | VCC | **3V3** | **não ligar em 5 V** — ver seção 3 |
| HX711 | GND | GND | |
| ULN2003 | IN1 | **GPIO 32** | |
| ULN2003 | IN2 | **GPIO 33** | |
| ULN2003 | IN3 | **GPIO 25** | |
| ULN2003 | IN4 | **GPIO 26** | |
| ULN2003 | VCC (+) | **5 V do step-down** | não tirar do pino 5V da ESP32 |
| ULN2003 | GND (−) | GND comum | |
| LED de status | — | **GPIO 2** | LED azul já embutido na DevKit |

### Célula de carga → HX711

| Fio | Terminal do HX711 |
|---|---|
| vermelho | E+ |
| preto | E− |
| branco | A− |
| verde | A+ |


**Bibliotecas** — `Ferramentas → Gerenciar Bibliotecas`:

| Biblioteca | Autor | Versão |
|---|---|---|
| ArduinoJson | Benoit Blanchon | **7.x** (a 6.x não compila este código) |
| HX711 Arduino Library | Bogdan Necula | 0.7.5 ou mais nova |

**Antes de compilar**, dentro da pasta `alimentador_esp32/`:

```
cp secrets.example.h secrets.h
```

e preencha `secrets.h` com o SSID, a senha, a URL do Supabase, a anon key e o device_token que a migration `0005_seed.sql` imprimiu. O `secrets.h` não vai para o Git.

---

## 4. Como o firmware funciona

### Dosagem em malha fechada

O motor não gira uma quantidade calculada de passos e pronto. Ele gira em blocos, e entre um bloco e outro o firmware desliga as bobinas, espera a ração assentar e pesa a tigela:

```
peso alvo = peso antes + porção pedida
enquanto faltar mais que 3 g:
    gira um bloco  (5 g de cada vez; 1,5 g na reta final)
    desliga as bobinas, espera 350 ms
    lê a balança
    se o bloco não rendeu nada, conta uma falha
    quatro falhas seguidas => entupimento, aborta
```

Três coisas saem de graça daí:

- a porção fica certa mesmo com ração mais densa ou mais fofa;
- rosca travada é detectada em uns 8 segundos, em vez de o motor girar em falso até o timeout;
- o firmware imprime no Serial **quantos gramas o dosador rende por volta** a cada alimentação — o número que faltava para o artigo, medido em vez de estimado.

### Quanto tempo leva uma porção

O 28BYJ-48 é um motor lento: com o intervalo de 1300 µs por meio-passo, uma volta leva 5,3 s.

| Rendimento do dosador | Porção de 40 g | Porção de 120 g |
|---|---|---|
| 12 g/volta | ~28 s | ~77 s |
| 18 g/volta | ~22 s | ~59 s |
| 25 g/volta | ~19 s | ~49 s |

### Relógio sem RTC

Sem DS3231, o relógio é o interno da ESP32, e ele zera a cada queda de energia. O firmware trata isso em três camadas:

1. **NTP no boot** e ressincronização de hora em hora (`a.st1.ntp.br`, do NIC.br, mais o pool internacional).
2. **Hora do servidor como reserva**: o heartbeat do Supabase devolve o epoch, e ele é usado se o NTP não responder. Isso cobre o caso de a rede do laboratório bloquear a porta UDP 123, que é comum em rede institucional.
3. **Trava de segurança**: enquanto o relógio não estiver acertado, nenhum agendamento roda. Pular uma refeição é melhor do que liberar ração de madrugada porque a placa achava que era 1970.

Há ainda uma janela de 5 minutos: se a energia voltar 3 minutos depois da hora marcada, a refeição acontece; se voltar 40 minutos depois, não acontece. Sem essa janela, uma queda longa faria o alimentador despejar todas as refeições atrasadas de uma vez quando voltasse.


## 5. Procedimento de calibração da célula de carga

Com a placa gravada e o monitor serial aberto em 115200:

**Passo 1 — tara.** Tigela vazia e no lugar definitivo dela. Digite `t` e Enter. A balança zera.

**Passo 2 — peso conhecido.** Digite `c` e Enter, e siga as instruções:

1. o firmware tara de novo — confirme com Enter, tigela ainda vazia;
2. coloque um peso conhecido na tigela. Serve qualquer coisa que você saiba quanto pesa: um pacote fechado de 500 g, uma garrafa de água cheia (1 L = 1000 g), pesos de cozinha. **Use algo próximo da faixa de trabalho** (100 a 300 g), não 5 kg;
3. digite quantos gramas ele tem e Enter.

O firmware imprime o **fator de calibração** e já confere, lendo o peso de volta. Se a conferência bater com o peso real, deu certo.

**Passo 3 — salvar.** Digite `s`. O fator vai para o Supabase, na linha do dispositivo. A partir daí, regravar o firmware não perde mais a calibração: no boot, o `device_get_config` traz o valor de volta.


## 6. Teste de bancada, na ordem

1. **Gravar e abrir o monitor.** Deve aparecer o cabeçalho, a conexão Wi-Fi com o IP, e o relógio acertado.
2. **Digitar `i`.** Confere tudo de uma vez: Wi-Fi, relógio, fator de calibração, peso e quantos agendamentos chegaram.
3. **Digitar `p`** com e sem peso na tigela.
4. **Digitar `d`** — dispensa 20 g de teste. Olhe o rendimento em g/volta que aparece.
5. **Ajustar** `GRAMAS_POR_VOLTA_ESTIMADO` com o valor medido e regravar.
6. **Conferir no Supabase** (Table Editor): `food_readings` recebendo linhas, `v_devices.status` em `online`, `feeding_events` com a dosagem de teste.
7. **Testar a fila de comandos** sem o app ainda:

```sql
insert into public.commands (device_id, type, payload)
values ('esp32-01', 'feed_now', '{"grams": 40}');
```

Em até 3 segundos o motor gira. Depois:

```sql
select type, status, result from public.commands order by created_at desc limit 1;
-- status deve estar 'done' e result traz os gramas realmente liberados
```

8. **Testar agendamento**: crie um agendamento para dois minutos à frente e espere. Pela tabela, ou direto no SQL:

```sql
insert into public.schedules (device_id, label, time_of_day, frequency, portion_grams, enabled)
values ('esp32-01', 'Teste', '14:35', 'daily', 40, true);
```

Lembre que a ESP32 recarrega os agendamentos a cada 5 minutos — ou reinicie a placa para pegar na hora.

---

## 7. Resumo do menu do Serial

| Tecla | O que faz |
|---|---|
| `p` | lê o peso agora |
| `t` | tara (zera) com a tigela vazia |
| `c` | calibra com um peso conhecido |
| `s` | salva a calibração no Supabase |
| `d` | dispensa 20 g de teste |
| `i` | mostra o estado do sistema |
| `h` | mostra o menu de novo |