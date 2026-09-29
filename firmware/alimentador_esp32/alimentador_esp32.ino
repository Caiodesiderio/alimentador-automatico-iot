// =====================================================================
//  ALIMENTADOR AUTOMÁTICO PARA PETS — FIRMWARE DA ESP32 PRINCIPAL
// =====================================================================
//  PIBIC SISPROJ 59635 — Universidade do Estado do Amazonas
//  Eng. de Controle e Automação
//  Orientação: Prof. Dr. Almir Kimura Júnior
//
//  Hardware controlado por este firmware:
//    - Célula de carga + HX711 ....... peso NA TIGELA (comedouro)
//    - Motor de passo 28BYJ-48 + ULN2003 ... liberação da ração
//    - Wi-Fi ......................... comunicação com o Supabase
//
//  O QUE ESTE FIRMWARE FAZ, EM UMA FRASE:
//  mantém o relógio certo, guarda os agendamentos na memória, libera a
//  porção certa pesando o que cai na tigela, e conversa com o Supabase
//  por HTTPS — perguntando de tempos em tempos se o app mandou alguma
//  ordem, já que a ESP32 está atrás de NAT e ninguém a alcança de fora.
//
//  DUAS DECISÕES DE PROJETO QUE APARECEM O TEMPO TODO NO CÓDIGO:
//
//  1) DOSAGEM EM MALHA FECHADA.
//     A célula de carga está na tigela, então dá para PESAR o que caiu
//     em vez de confiar na conta de passos. O motor gira em blocos
//     curtos e, entre um bloco e outro, o firmware lê a balança e
//     decide se continua. Isso corrige variação de densidade da ração e
//     detecta entupimento da rosca — coisas que a malha aberta não vê.
//     A conta de passos continua existindo, como estimativa inicial e
//     como teto de segurança.
//
//  2) RELÓGIO SEM RTC EXTERNO.
//     Não há DS3231 na montagem. O relógio é o interno da ESP32,
//     acertado por NTP no boot e ressincronizado de hora em hora. Se o
//     NTP estiver bloqueado na rede (acontece em rede institucional,
//     que costuma fechar a porta UDP 123), o próprio heartbeat do
//     Supabase devolve a hora do servidor e ela é usada como segunda
//     fonte. Enquanto o relógio não estiver acertado, NENHUM agendamento
//     é executado — é melhor pular uma refeição do que liberar ração na
//     hora errada.
// =====================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>   // Biblioteca "ArduinoJson" (Benoit Blanchon), v7
#include <HX711.h>         // Biblioteca "HX711 Arduino Library" (Bogdan Necula)
#include <time.h>

#include "secrets.h"       // não versionado — ver secrets.example.h

// =====================================================================
//  1. PINAGEM
// =====================================================================
//  Pinos escolhidos para não esbarrar em nada da ESP32:
//    - GPIO 6..11 são a memória flash, não podem ser usados;
//    - GPIO 34..39 são só de entrada, não servem para o motor;
//    - GPIO 0, 2, 12 e 15 são pinos de "strapping": o nível deles no
//      instante do boot muda o modo de inicialização, então nada que
//      puxe corrente fica neles;
//    - GPIO 1 e 3 são o Serial (USB), ficam livres para depuração.
//  Os pinos abaixo estão todos fora dessas armadilhas.
// ---------------------------------------------------------------------

// HX711 (célula de carga da tigela)
#define PINO_HX711_DT   18   // DOUT do HX711 -> entrada da ESP32
#define PINO_HX711_SCK  19   // SCK  do HX711 <- saída da ESP32

// ULN2003 (motor de passo 28BYJ-48)
#define PINO_MOTOR_IN1  32
#define PINO_MOTOR_IN2  33
#define PINO_MOTOR_IN3  25
#define PINO_MOTOR_IN4  26

// LED de status (o LED azul embutido da maioria das DevKit está no GPIO 2)
#define PINO_LED         2

// =====================================================================
//  2. PARÂMETROS AJUSTÁVEIS
// =====================================================================

// ---- Motor -----------------------------------------------------------
// 28BYJ-48 em meio-passo: 8 passos por ciclo x 512 ciclos = 4096 passos
// por volta do eixo de saída (o datasheet dá 4075,7 — a diferença não
// importa aqui porque a dosagem é fechada pela balança).
const int      PASSOS_POR_VOLTA   = 4096;

// Intervalo entre passos. Menor = mais rápido e com menos torque.
// Abaixo de ~1000 us o 28BYJ-48 começa a perder passos.
const uint16_t INTERVALO_PASSO_US = 1300;

// Chute inicial de quanto sai por volta do dosador. NÃO precisa estar
// certo: serve só para estimar o tamanho do bloco e o teto de passos.
// A primeira alimentação real já mostra o valor verdadeiro no Serial.
const float    GRAMAS_POR_VOLTA_ESTIMADO = 18.0;

// ---- Dosagem ---------------------------------------------------------
const float    TOLERANCIA_GRAMAS   = 3.0;    // erro aceito na porção
const float    PORCAO_MAXIMA_G     = 500.0;  // trava de segurança
const float    GANHO_MINIMO_BLOCO  = 0.5;    // abaixo disso o bloco "não rendeu"
const int      BLOCOS_SEM_GANHO    = 4;      // tantos seguidos => entupimento

// Tamanho dos blocos de giro. Bloco grande = dosagem mais rápida;
// bloco pequeno = menos chance de passar do ponto. A solução é usar os
// dois: blocos de 5 g enquanto está longe do alvo e de 1,5 g na
// aproximação final.
const float    BLOCO_GRANDE_G      = 5.0;
const float    BLOCO_FINO_G        = 1.5;
const float    DISTANCIA_FINA_G    = 8.0;    // a partir daqui, blocos finos

// Teto de tempo. É a última linha de defesa: quem pega rosca travada de
// verdade é o detector de entupimento acima, em uns 8 segundos. Este
// valor é folgado de propósito porque o 28BYJ-48 é lento — uma porção de
// 120 g leva perto de um minuto.
const uint32_t TIMEOUT_DOSAGEM_MS  = 180000;

// ---- Balança ---------------------------------------------------------
const uint8_t  AMOSTRAS_LEITURA    = 10;     // amostras por leitura do HX711
const uint8_t  TAMANHO_MEDIA_MOVEL = 8;      // janela da média móvel
// Fator de calibração inicial. É sobrescrito pelo valor salvo no banco
// (device_get_config) assim que a primeira configuração chega.
float          fatorCalibracao     = 420.0;

// ---- Tempos de rede --------------------------------------------------
const uint32_t PERIODO_HEARTBEAT_MS = 30000;   // presença + peso
const uint32_t PERIODO_COMANDOS_MS  = 3000;    // fila de comandos
const uint32_t PERIODO_CONFIG_MS    = 300000;  // agendamentos (5 min)
const uint32_t PERIODO_NTP_MS       = 3600000; // ressincroniza de hora em hora
const uint16_t TIMEOUT_HTTP_MS      = 8000;

// ---- Relógio ---------------------------------------------------------
// Manaus é UTC-4 o ano inteiro (não há horário de verão). Em formato
// POSIX isso se escreve "<-04>4".
const char*    FUSO_HORARIO = "<-04>4";
const char*    NTP_1 = "a.st1.ntp.br";   // servidor do NIC.br, mais perto
const char*    NTP_2 = "pool.ntp.org";
const char*    NTP_3 = "time.google.com";

// Janela de tolerância do agendamento: se a ESP32 ficar sem energia e
// voltar 3 minutos depois da hora marcada, ela ainda alimenta. Se voltar
// 40 minutos depois, não alimenta — já passou da hora.
const int      JANELA_AGENDAMENTO_MIN = 5;

const int      MAX_AGENDAMENTOS = 12;

// =====================================================================
//  3. ESTADO GLOBAL
// =====================================================================

HX711 balanca;

struct Agendamento {
  char     id[40];
  char     rotulo[40];
  int      hora;
  int      minuto;
  char     frequencia[10];   // "daily" | "weekly" | "once"
  bool     diasSemana[7];    // índice 0 = domingo
  char     data[11];         // "AAAA-MM-DD", usado quando frequencia = "once"
  int      porcaoGramas;
  int      diaUltimaExecucao; // tm_yday da última vez que rodou (-1 = nunca)
};

Agendamento agendamentos[MAX_AGENDAMENTOS];
int  totalAgendamentos = 0;

bool relogioSincronizado = false;
bool configRecebida      = false;

float mediaMovel[TAMANHO_MEDIA_MOVEL];
int   indiceMediaMovel   = 0;
int   amostrasNaMedia    = 0;

uint32_t ultimoHeartbeat = 0;
uint32_t ultimoComandos  = 0;
uint32_t ultimoConfig    = 0;
uint32_t ultimoNTP       = 0;
uint32_t ultimoLed       = 0;

const char* VERSAO_FIRMWARE = "2.0.0";

// =====================================================================
//  4. WI-FI
// =====================================================================

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("\n[WiFi] Conectando à rede: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);            // sem economia de energia: o polling fica mais confiável
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  uint32_t inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(400);
    Serial.print(".");
    digitalWrite(PINO_LED, !digitalRead(PINO_LED));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Conexão estabelecida com sucesso!");
    Serial.printf("[WiFi] Endereço IP do ESP32: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] Sinal (RSSI): %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] Falhou. Tento de novo no próximo ciclo.");
  }
}

// Chamada a cada volta do loop. Se a rede caiu, tenta de novo sem
// travar o resto do firmware — os agendamentos continuam rodando
// offline, que é o ponto principal de executá-los localmente.
void manterWiFi() {
  static uint32_t ultimaTentativa = 0;
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - ultimaTentativa < 10000) return;
  ultimaTentativa = millis();
  Serial.println("[WiFi] Caiu. Reconectando...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
}

// =====================================================================
//  5. RELÓGIO
// =====================================================================

bool horaValida() {
  // Qualquer coisa antes de 2024 significa que o relógio nunca foi
  // acertado (a ESP32 começa em 1970).
  time_t agora = time(nullptr);
  return agora > 1700000000;
}

void sincronizarNTP() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.println("[Relógio] Sincronizando por NTP...");
  configTzTime(FUSO_HORARIO, NTP_1, NTP_2, NTP_3);

  uint32_t inicio = millis();
  while (!horaValida() && millis() - inicio < 8000) delay(200);

  relogioSincronizado = horaValida();
  if (relogioSincronizado) {
    struct tm t;
    getLocalTime(&t);
    Serial.printf("[Relógio] Acertado: %02d/%02d/%04d %02d:%02d:%02d (Manaus)\n",
                  t.tm_mday, t.tm_mon + 1, t.tm_year + 1900,
                  t.tm_hour, t.tm_min, t.tm_sec);
  } else {
    Serial.println("[Relógio] NTP não respondeu. Vou usar a hora que o Supabase devolve no heartbeat.");
  }
  ultimoNTP = millis();
}

// Segunda fonte de hora: o heartbeat devolve o epoch do servidor. Serve
// para rede que bloqueia NTP e para o caso de o NTP demorar a responder.
void ajustarRelogioPeloServidor(long epochServidor) {
  if (epochServidor < 1700000000) return;

  time_t agora = time(nullptr);
  long   erro  = (long)agora - epochServidor;

  // Só mexe no relógio se estiver errado de verdade (mais de 30 s) ou
  // se nunca tiver sido acertado. Evita ficar corrigindo por causa da
  // latência da rede.
  if (relogioSincronizado && erro > -30 && erro < 30) return;

  struct timeval tv = { .tv_sec = (time_t)epochServidor, .tv_usec = 0 };
  settimeofday(&tv, nullptr);
  setenv("TZ", FUSO_HORARIO, 1);
  tzset();

  relogioSincronizado = true;
  Serial.printf("[Relógio] Acertado pelo servidor (erro anterior: %ld s)\n", erro);
}

// =====================================================================
//  6. BALANÇA (HX711)
// =====================================================================

void iniciarBalanca() {
  balanca.begin(PINO_HX711_DT, PINO_HX711_SCK);

  Serial.println("[Balança] Aguardando o HX711...");
  uint32_t inicio = millis();
  while (!balanca.is_ready() && millis() - inicio < 5000) delay(100);

  if (!balanca.is_ready()) {
    Serial.println("[Balança] HX711 NÃO respondeu. Confira DT no GPIO 18, SCK no GPIO 19 e o GND comum.");
    return;
  }

  balanca.set_scale(fatorCalibracao);
  balanca.tare(20);                 // tigela vazia no boot = zero
  Serial.println("[Balança] Pronta e tarada.");
}

// Leitura crua, já convertida em gramas pelo fator de calibração.
float lerPesoInstantaneo() {
  if (!balanca.is_ready()) return NAN;
  return balanca.get_units(AMOSTRAS_LEITURA);
}

// Leitura filtrada por média móvel. Usada no envio periódico, onde o que
// importa é a tendência e não o valor de um instante.
float lerPesoFiltrado() {
  float leitura = lerPesoInstantaneo();
  if (isnan(leitura)) return NAN;

  mediaMovel[indiceMediaMovel] = leitura;
  indiceMediaMovel = (indiceMediaMovel + 1) % TAMANHO_MEDIA_MOVEL;
  if (amostrasNaMedia < TAMANHO_MEDIA_MOVEL) amostrasNaMedia++;

  float soma = 0;
  for (int i = 0; i < amostrasNaMedia; i++) soma += mediaMovel[i];
  return soma / amostrasNaMedia;
}

// Leitura "estável": espera a ração parar de balançar na tigela antes de
// devolver o valor. Usada antes e depois de cada dosagem, onde um erro
// de leitura vira erro de porção.
float lerPesoEstavel(uint16_t tempoMaximoMs = 3000) {
  float anterior = lerPesoInstantaneo();
  uint32_t inicio = millis();

  while (millis() - inicio < tempoMaximoMs) {
    delay(120);
    float atual = lerPesoInstantaneo();
    if (isnan(atual)) return anterior;
    if (fabs(atual - anterior) < 0.8) return atual;   // variou menos de 0,8 g: assentou
    anterior = atual;
  }
  return anterior;
}

void zerarMediaMovel() {
  indiceMediaMovel = 0;
  amostrasNaMedia  = 0;
}

// =====================================================================
//  7. MOTOR DE PASSO 28BYJ-48
// =====================================================================

// Sequência de meio-passo. Oito estados, mais torque e mais suavidade do
// que passo inteiro — e o dosador agradece, porque ração compactada
// costuma exigir torque de arranque.
const uint8_t SEQUENCIA[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

void aplicarPasso(int indice) {
  digitalWrite(PINO_MOTOR_IN1, SEQUENCIA[indice][0]);
  digitalWrite(PINO_MOTOR_IN2, SEQUENCIA[indice][1]);
  digitalWrite(PINO_MOTOR_IN3, SEQUENCIA[indice][2]);
  digitalWrite(PINO_MOTOR_IN4, SEQUENCIA[indice][3]);
}

// IMPORTANTE: desligar as bobinas ao terminar.
// O 28BYJ-48 parado com bobina energizada continua puxando corrente e
// esquenta — e, pior para este projeto, a vibração residual suja a
// leitura da célula de carga. Toda leitura de peso é feita com o motor
// desligado.
void desligarMotor() {
  digitalWrite(PINO_MOTOR_IN1, LOW);
  digitalWrite(PINO_MOTOR_IN2, LOW);
  digitalWrite(PINO_MOTOR_IN3, LOW);
  digitalWrite(PINO_MOTOR_IN4, LOW);
}

void girarPassos(int passos) {
  static int indice = 0;
  for (int i = 0; i < passos; i++) {
    aplicarPasso(indice);
    indice = (indice + 1) % 8;
    delayMicroseconds(INTERVALO_PASSO_US);
  }
  desligarMotor();
}

// ---------------------------------------------------------------------
//  DOSAGEM EM MALHA FECHADA
// ---------------------------------------------------------------------
//  Gira em blocos de aproximadamente 2 g, pesa entre um bloco e outro e
//  para quando alcança o alvo. Três saídas possíveis:
//    - alcançou o alvo dentro da tolerância  -> sucesso
//    - bateu no teto de passos ou no timeout -> devolve o que conseguiu
//    - vários blocos seguidos sem ganho      -> entupimento, aborta
//
//  Devolve quantos gramas realmente caíram na tigela.
//  Preenche passosDados, pesoDepois e motivo para o registro no banco.
// ---------------------------------------------------------------------
float dispensar(float alvoGramas, int& passosDados, float& pesoDepois, String& motivo) {
  passosDados = 0;
  motivo = "ok";

  if (alvoGramas <= 0 || alvoGramas > PORCAO_MAXIMA_G) {
    motivo = "porcao_invalida";
    pesoDepois = lerPesoEstavel();
    return 0;
  }

  float pesoAntes = lerPesoEstavel();
  if (isnan(pesoAntes)) {
    motivo = "balanca_indisponivel";
    pesoDepois = NAN;
    return 0;
  }

  Serial.printf("[Dosagem] Alvo: %.1f g | tigela antes: %.1f g\n", alvoGramas, pesoAntes);

  float passosPorGrama = PASSOS_POR_VOLTA / GRAMAS_POR_VOLTA_ESTIMADO;
  int   passosBloco    = max(64, (int)(passosPorGrama * BLOCO_GRANDE_G));
  int   passosFinos    = max(32, (int)(passosPorGrama * BLOCO_FINO_G));
  // Teto de segurança: 2,5x o que a estimativa prevê. Se a estimativa
  // estiver muito errada para menos, o teto ainda dá folga; se a rosca
  // girar em falso, o teto impede o motor de rodar para sempre.
  int   tetoPassos     = (int)(passosPorGrama * alvoGramas * 2.5);

  float pesoAtual      = pesoAntes;
  int   blocosSemGanho = 0;
  uint32_t inicio      = millis();

  while (true) {
    float faltando = (pesoAntes + alvoGramas) - pesoAtual;
    if (faltando <= TOLERANCIA_GRAMAS) break;

    if (passosDados >= tetoPassos)             { motivo = "teto_de_passos"; break; }
    if (millis() - inicio > TIMEOUT_DOSAGEM_MS) { motivo = "timeout";        break; }

    // Perto do alvo, blocos menores para não passar do ponto.
    int passos = (faltando < DISTANCIA_FINA_G) ? passosFinos : passosBloco;
    girarPassos(passos);
    passosDados += passos;

    delay(350);                       // deixa a ração assentar na tigela
    float novoPeso = lerPesoEstavel(1500);
    if (isnan(novoPeso)) { motivo = "balanca_indisponivel"; break; }

    float ganho = novoPeso - pesoAtual;
    pesoAtual = novoPeso;

    if (ganho < GANHO_MINIMO_BLOCO) {
      blocosSemGanho++;
      if (blocosSemGanho >= BLOCOS_SEM_GANHO) { motivo = "entupimento"; break; }
    } else {
      blocosSemGanho = 0;
    }
  }

  desligarMotor();
  delay(500);
  pesoDepois = lerPesoEstavel();
  zerarMediaMovel();                  // a média antiga não vale mais nada

  float liberado = pesoDepois - pesoAntes;
  if (liberado < 0) liberado = 0;

  Serial.printf("[Dosagem] Liberado: %.1f g em %d passos (%s)\n",
                liberado, passosDados, motivo.c_str());

  // Informação útil para a calibração mecânica e para o artigo:
  // quantos gramas este dosador realmente entrega por volta.
  if (liberado > 5 && passosDados > 0) {
    float gramasPorVolta = liberado / ((float)passosDados / PASSOS_POR_VOLTA);
    Serial.printf("[Dosagem] Rendimento medido: %.1f g/volta "
                  "(estimativa em uso: %.1f g/volta)\n",
                  gramasPorVolta, GRAMAS_POR_VOLTA_ESTIMADO);
  }

  return liberado;
}

// =====================================================================
//  8. SUPABASE (HTTPS + RPC)
// =====================================================================

// Chama uma função do Postgres pelo PostgREST.
//   POST {SUPABASE_URL}/rest/v1/rpc/<funcao>
// Devolve true quando o servidor respondeu 2xx; nesse caso "resposta"
// recebe o JSON devolvido (quando houver corpo).
bool chamarRPC(const char* funcao, JsonDocument& corpo, JsonDocument& resposta) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure cliente;
  // NOTA HONESTA SOBRE SEGURANÇA:
  // setInsecure() aceita o certificado do servidor sem validar a cadeia.
  // A conexão continua criptografada, mas fica teoricamente sujeita a um
  // ataque de intermediário dentro da rede local. A alternativa é fixar
  // o certificado raiz da Supabase no firmware — que é mais correto e
  // quebra sozinho no dia em que esse certificado for renovado, tipo na
  // véspera da apresentação. Para bancada e demonstração, insecure.
  // Para produção, trocar por cliente.setCACert(<raiz>).
  cliente.setInsecure();
  cliente.setTimeout(TIMEOUT_HTTP_MS / 1000);

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/" + funcao;

  if (!http.begin(cliente, url)) {
    Serial.printf("[HTTP] Não consegui abrir %s\n", funcao);
    return false;
  }

  http.setTimeout(TIMEOUT_HTTP_MS);
  http.setConnectTimeout(TIMEOUT_HTTP_MS);
  http.addHeader("apikey",         SUPABASE_ANON);
  http.addHeader("Authorization",  String("Bearer ") + SUPABASE_ANON);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);   // é isto que a RLS confere
  http.addHeader("Content-Type",   "application/json");

  // Um JsonDocument vazio serializa como "null", e o PostgREST recusa
  // isso. Funções sem argumento precisam receber um objeto vazio.
  String json;
  if (corpo.isNull()) json = "{}";
  else                serializeJson(corpo, json);

  int codigo = http.POST(json);
  bool ok = (codigo >= 200 && codigo < 300);

  if (ok) {
    String texto = http.getString();
    if (texto.length() > 0 && texto != "null") {
      DeserializationError erro = deserializeJson(resposta, texto);
      if (erro) {
        Serial.printf("[HTTP] %s devolveu JSON inválido: %s\n", funcao, erro.c_str());
        ok = false;
      }
    }
  } else {
    Serial.printf("[HTTP] %s falhou (código %d): %s\n",
                  funcao, codigo, http.getString().c_str());
    if (codigo == 401 || codigo == 403) {
      Serial.println("       -> Confira o DEVICE_TOKEN e a ANON KEY no secrets.h.");
    }
  }

  http.end();
  return ok;
}

// ---------------------------------------------------------------------
//  HEARTBEAT: avisa que está viva, manda o peso da tigela e recebe de
//  volta a hora do servidor e quantos comandos estão na fila.
// ---------------------------------------------------------------------
void enviarHeartbeat() {
  JsonDocument corpo, resposta;
  corpo["p_firmware"] = VERSAO_FIRMWARE;
  corpo["p_rssi"]     = WiFi.RSSI();

  // Se a balança não respondeu, o campo simplesmente não é enviado: o
  // padrão da função no banco é NULL e só a presença fica registrada.
  float peso = lerPesoFiltrado();
  if (!isnan(peso)) corpo["p_bowl_grams"] = round(peso * 100) / 100.0;

  if (!chamarRPC("device_heartbeat", corpo, resposta)) return;

  if (!resposta["server_epoch"].isNull()) {
    ajustarRelogioPeloServidor(resposta["server_epoch"].as<long>());
  }

  int pendentes = resposta["pending_commands"] | 0;
  Serial.printf("[Heartbeat] tigela: %.1f g | reservatório estimado: %.0f g | comandos na fila: %d\n",
                peso, resposta["hopper_grams"] | 0.0f, pendentes);
}

// ---------------------------------------------------------------------
//  CONFIGURAÇÃO: baixa os agendamentos ativos e a calibração salva.
//  A partir daqui a ESP32 executa tudo sozinha, sem rede.
// ---------------------------------------------------------------------
void baixarConfiguracao() {
  JsonDocument corpo, resposta;
  if (!chamarRPC("device_get_config", corpo, resposta)) return;

  if (!resposta["server_epoch"].isNull())
    ajustarRelogioPeloServidor(resposta["server_epoch"].as<long>());

  // Calibração salva no banco tem prioridade sobre a constante do código:
  // assim, regravar o firmware não faz perder a calibração da bancada.
  if (!resposta["scale_factor"].isNull()) {
    float fator = resposta["scale_factor"].as<float>();
    if (fator > 1 && fabs(fator - fatorCalibracao) > 0.001) {
      fatorCalibracao = fator;
      balanca.set_scale(fatorCalibracao);
      Serial.printf("[Balança] Fator de calibração recuperado do banco: %.3f\n", fatorCalibracao);
    }
  }

  JsonArray lista = resposta["schedules"].as<JsonArray>();

  // Guarda o histórico de execução do dia para não repetir uma refeição
  // só porque a configuração foi recarregada.
  int  execAnterior[MAX_AGENDAMENTOS];
  char idAnterior[MAX_AGENDAMENTOS][40];
  int  totalAnterior = totalAgendamentos;
  for (int i = 0; i < totalAnterior; i++) {
    execAnterior[i] = agendamentos[i].diaUltimaExecucao;
    strncpy(idAnterior[i], agendamentos[i].id, sizeof(idAnterior[i]));
  }

  totalAgendamentos = 0;
  for (JsonObject item : lista) {
    if (totalAgendamentos >= MAX_AGENDAMENTOS) break;
    Agendamento& a = agendamentos[totalAgendamentos];

    strncpy(a.id,     item["id"]    | "", sizeof(a.id) - 1);
    strncpy(a.rotulo, item["label"] | "", sizeof(a.rotulo) - 1);
    a.id[sizeof(a.id) - 1] = '\0';
    a.rotulo[sizeof(a.rotulo) - 1] = '\0';

    const char* hhmm = item["time"] | "00:00";
    a.hora   = atoi(hhmm);
    a.minuto = atoi(hhmm + 3);

    strncpy(a.frequencia, item["frequency"] | "daily", sizeof(a.frequencia) - 1);
    a.frequencia[sizeof(a.frequencia) - 1] = '\0';

    for (int d = 0; d < 7; d++) a.diasSemana[d] = false;
    for (int dia : item["weekdays"].as<JsonArray>())
      if (dia >= 0 && dia <= 6) a.diasSemana[dia] = true;

    strncpy(a.data, item["date"] | "", sizeof(a.data) - 1);
    a.data[sizeof(a.data) - 1] = '\0';

    a.porcaoGramas = item["portion_grams"] | 0;

    a.diaUltimaExecucao = -1;
    for (int i = 0; i < totalAnterior; i++)
      if (strcmp(idAnterior[i], a.id) == 0) a.diaUltimaExecucao = execAnterior[i];

    totalAgendamentos++;
  }

  configRecebida = true;
  Serial.printf("[Config] %d agendamento(s) ativo(s):\n", totalAgendamentos);
  for (int i = 0; i < totalAgendamentos; i++)
    Serial.printf("         %02d:%02d  %-16s %3d g  (%s)\n",
                  agendamentos[i].hora, agendamentos[i].minuto,
                  agendamentos[i].rotulo, agendamentos[i].porcaoGramas,
                  agendamentos[i].frequencia);
}

// ---------------------------------------------------------------------
//  REGISTRO DA ALIMENTAÇÃO
// ---------------------------------------------------------------------
void registrarAlimentacao(float alvo, float liberado, float pesoDepois,
                          const char* gatilho, int passos,
                          const char* idAgendamento, const char* idComando) {
  JsonDocument corpo, resposta;
  corpo["p_grams_target"]     = alvo;
  corpo["p_grams"]            = round(liberado * 100) / 100.0;
  corpo["p_bowl_grams_after"] = round(pesoDepois * 100) / 100.0;
  corpo["p_trigger"]          = gatilho;
  corpo["p_steps"]            = passos;
  if (idAgendamento && strlen(idAgendamento) > 0) corpo["p_schedule_id"] = idAgendamento;
  if (idComando     && strlen(idComando)     > 0) corpo["p_command_id"]  = idComando;

  if (chamarRPC("device_register_feeding", corpo, resposta))
    Serial.println("[Supabase] Alimentação registrada.");
  else
    Serial.println("[Supabase] Não consegui registrar agora. A ração já foi liberada — "
                   "o registro desta refeição se perde, mas o pet comeu.");
}

// Marca um comando como executado (ou falhado) lá no banco.
void darBaixa(const char* idComando, bool ok, const char* erro) {
  JsonDocument corpo, resposta;
  corpo["p_id"] = idComando;
  corpo["p_ok"] = ok;
  if (erro) corpo["p_result"]["erro"] = erro;
  else      corpo["p_result"].to<JsonObject>();
  chamarRPC("device_complete_command", corpo, resposta);
}

// ---------------------------------------------------------------------
//  FILA DE COMANDOS
//  A ESP32 está atrás de NAT: quem pergunta é ela.
// ---------------------------------------------------------------------
void processarComandos() {
  JsonDocument corpo, resposta;
  corpo["p_limit"] = 3;

  if (!chamarRPC("device_claim_commands", corpo, resposta)) return;

  JsonArray comandos = resposta.as<JsonArray>();
  for (JsonObject cmd : comandos) {
    const char* id   = cmd["id"]   | "";
    const char* tipo = cmd["type"] | "";
    Serial.printf("[Comando] Recebido: %s (%s)\n", tipo, id);

    if (strcmp(tipo, "feed_now") == 0) {
      float alvo = cmd["payload"]["grams"] | 0.0f;
      int   passos; float pesoDepois; String motivo;
      float liberado = dispensar(alvo, passos, pesoDepois, motivo);

      if (liberado > 0) {
        // device_register_feeding já dá baixa no comando quando recebe
        // o p_command_id, então não é preciso chamar complete depois.
        registrarAlimentacao(alvo, liberado, pesoDepois, "manual", passos, "", id);
      } else {
        darBaixa(id, false, motivo.c_str());
      }

    } else if (strcmp(tipo, "tare") == 0) {
      balanca.tare(20);
      zerarMediaMovel();
      Serial.println("[Comando] Balança tarada.");
      darBaixa(id, true, nullptr);

    } else if (strcmp(tipo, "sync_time") == 0) {
      sincronizarNTP();
      darBaixa(id, relogioSincronizado, relogioSincronizado ? nullptr : "ntp_indisponivel");

    } else if (strcmp(tipo, "reboot") == 0) {
      darBaixa(id, true, nullptr);
      Serial.println("[Comando] Reiniciando...");
      delay(500);
      ESP.restart();

    } else {
      // 'calibrate' e 'snapshot' não são tratados aqui: calibração é
      // presencial (menu do Serial) e snapshot é da ESP32-CAM.
      darBaixa(id, false, "tipo nao suportado por este firmware");
    }
  }
}

// =====================================================================
//  9. AGENDAMENTOS (execução local, sem depender do app nem da rede)
// =====================================================================

bool agendamentoValeHoje(const Agendamento& a, const struct tm& t) {
  if (strcmp(a.frequencia, "daily") == 0) return true;

  if (strcmp(a.frequencia, "weekly") == 0) return a.diasSemana[t.tm_wday];

  if (strcmp(a.frequencia, "once") == 0) {
    int ano, mes, dia;
    if (sscanf(a.data, "%d-%d-%d", &ano, &mes, &dia) != 3) return false;
    return ano == t.tm_year + 1900 && mes == t.tm_mon + 1 && dia == t.tm_mday;
  }
  return false;
}

void verificarAgendamentos() {
  // Sem relógio confiável, não se alimenta. Liberar ração na hora errada
  // é pior do que não liberar.
  if (!relogioSincronizado || !configRecebida) return;

  struct tm t;
  if (!getLocalTime(&t)) return;

  int minutosAgora = t.tm_hour * 60 + t.tm_min;

  for (int i = 0; i < totalAgendamentos; i++) {
    Agendamento& a = agendamentos[i];

    if (a.diaUltimaExecucao == t.tm_yday) continue;   // já rodou hoje
    if (!agendamentoValeHoje(a, t)) continue;

    int minutosAlvo = a.hora * 60 + a.minuto;
    int atraso      = minutosAgora - minutosAlvo;

    // Só dentro da janela. Assim, uma queda de energia curta não faz
    // perder a refeição, e uma queda longa não faz o alimentador
    // despejar ração fora de hora quando a energia volta.
    if (atraso < 0 || atraso > JANELA_AGENDAMENTO_MIN) continue;

    Serial.printf("\n[Agenda] Executando \"%s\" — %d g (atraso de %d min)\n",
                  a.rotulo, a.porcaoGramas, atraso);

    int passos; float pesoDepois; String motivo;
    float liberado = dispensar(a.porcaoGramas, passos, pesoDepois, motivo);

    a.diaUltimaExecucao = t.tm_yday;   // marca antes de registrar: se a
                                       // rede falhar, não repete a porção

    if (liberado > 0)
      registrarAlimentacao(a.porcaoGramas, liberado, pesoDepois,
                           "scheduled", passos, a.id, "");
    else
      Serial.printf("[Agenda] Nada foi liberado (%s).\n", motivo.c_str());
  }
}

// =====================================================================
//  10. MENU DE CALIBRAÇÃO PELO SERIAL
// =====================================================================
//  O procedimento completo está em docs/etapa-B-pinagem-e-firmware.md.
//  Resumo: 't' com a tigela vazia, depois 'c' com um peso conhecido em
//  cima, depois 's' para salvar no banco.
// ---------------------------------------------------------------------

void mostrarMenu() {
  Serial.println(F("\n================ MENU (digite a letra e Enter) ================"));
  Serial.println(F("  p  Ler o peso agora"));
  Serial.println(F("  t  Tarar (zerar) com a tigela vazia"));
  Serial.println(F("  c  Calibrar com um peso conhecido"));
  Serial.println(F("  s  Salvar a calibração no Supabase"));
  Serial.println(F("  d  Dispensar 20 g (teste do dosador)"));
  Serial.println(F("  i  Informações do sistema"));
  Serial.println(F("  h  Mostrar este menu"));
  Serial.println(F("==============================================================="));
}

void calibrarComPesoConhecido() {
  Serial.println(F("\n--- CALIBRAÇÃO ---"));
  Serial.println(F("1) Deixe a tigela VAZIA e posicionada. Enter para tarar."));
  while (!Serial.available()) delay(50);
  while (Serial.available()) Serial.read();

  balanca.tare(20);
  Serial.println(F("   Tarado."));

  Serial.println(F("2) Coloque um peso CONHECIDO na tigela."));
  Serial.println(F("   Digite quantos gramas ele tem (ex.: 200) e Enter:"));
  while (!Serial.available()) delay(50);
  float pesoReal = Serial.parseFloat();
  while (Serial.available()) Serial.read();

  if (pesoReal <= 0) { Serial.println(F("   Valor inválido. Cancelado.")); return; }

  // O fator é "contagens do HX711 por grama": leitura crua dividida
  // pelo peso real. Aplicando esse fator, get_units() passa a devolver
  // gramas de verdade.
  balanca.set_scale();                       // fator 1: leitura crua
  long  leituraCrua = balanca.get_units(30);
  float novoFator   = leituraCrua / pesoReal;

  balanca.set_scale(novoFator);
  fatorCalibracao = novoFator;

  Serial.printf("   Leitura crua: %ld\n", leituraCrua);
  Serial.printf("   NOVO FATOR DE CALIBRAÇÃO: %.3f\n", novoFator);
  Serial.printf("   Conferência: a balança está lendo %.1f g (deveria ser %.1f g)\n",
                balanca.get_units(10), pesoReal);
  Serial.println(F("   Digite 's' para salvar este fator no Supabase."));
}

void salvarCalibracao() {
  JsonDocument corpo, resposta;
  corpo["p_scale_factor"] = fatorCalibracao;
  corpo["p_scale_offset"] = (double)balanca.get_offset();

  if (chamarRPC("device_save_calibration", corpo, resposta))
    Serial.println(F("[Balança] Calibração salva no Supabase. Regravar o firmware não perde mais o valor."));
  else
    Serial.println(F("[Balança] Não consegui salvar. Anote o fator e coloque em fatorCalibracao no código."));
}

void tratarSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  while (Serial.available() && Serial.peek() == '\n') Serial.read();

  switch (c) {
    case 'p': Serial.printf("[Balança] %.1f g\n", lerPesoEstavel()); break;
    case 't': balanca.tare(20); zerarMediaMovel(); Serial.println(F("[Balança] Tarado.")); break;
    case 'c': calibrarComPesoConhecido(); break;
    case 's': salvarCalibracao(); break;
    case 'd': {
      int passos; float depois; String motivo;
      float g = dispensar(20.0, passos, depois, motivo);
      Serial.printf("[Teste] Liberou %.1f g (%s)\n", g, motivo.c_str());
      break;
    }
    case 'i': {
      struct tm t;
      Serial.println(F("\n--- INFORMAÇÕES ---"));
      Serial.printf("Firmware .......... %s\n", VERSAO_FIRMWARE);
      Serial.printf("Dispositivo ....... %s\n", DEVICE_ID);
      Serial.printf("Wi-Fi ............. %s (%d dBm)\n",
                    WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "desconectado",
                    WiFi.RSSI());
      Serial.printf("Relógio ........... %s\n", relogioSincronizado ? "sincronizado" : "NÃO sincronizado");
      if (getLocalTime(&t))
        Serial.printf("Hora local ........ %02d/%02d/%04d %02d:%02d:%02d\n",
                      t.tm_mday, t.tm_mon + 1, t.tm_year + 1900, t.tm_hour, t.tm_min, t.tm_sec);
      Serial.printf("Fator de calib. ... %.3f\n", fatorCalibracao);
      Serial.printf("Peso na tigela .... %.1f g\n", lerPesoEstavel());
      Serial.printf("Agendamentos ...... %d\n", totalAgendamentos);
      Serial.printf("Memória livre ..... %d bytes\n", ESP.getFreeHeap());
      break;
    }
    case 'h': mostrarMenu(); break;
    default: break;
  }
}

// =====================================================================
//  11. SETUP E LOOP
// =====================================================================

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println(F("\n\n============================================================"));
  Serial.println(F("  ALIMENTADOR AUTOMÁTICO PARA PETS — ESP32"));
  Serial.println(F("  PIBIC SISPROJ 59635 — UEA"));
  Serial.printf ("  Firmware %s | Dispositivo %s\n", VERSAO_FIRMWARE, DEVICE_ID);
  Serial.println(F("============================================================"));

  pinMode(PINO_LED, OUTPUT);
  pinMode(PINO_MOTOR_IN1, OUTPUT);
  pinMode(PINO_MOTOR_IN2, OUTPUT);
  pinMode(PINO_MOTOR_IN3, OUTPUT);
  pinMode(PINO_MOTOR_IN4, OUTPUT);
  desligarMotor();

  iniciarBalanca();
  conectarWiFi();
  sincronizarNTP();

  if (WiFi.status() == WL_CONNECTED) {
    enviarHeartbeat();        // também serve para acertar o relógio se o NTP falhou
    baixarConfiguracao();
  }

  mostrarMenu();
}

void loop() {
  uint32_t agora = millis();

  manterWiFi();
  tratarSerial();

  // O que mais importa: os agendamentos rodam a cada volta do loop e não
  // dependem de rede nenhuma.
  verificarAgendamentos();

  if (WiFi.status() == WL_CONNECTED) {
    if (agora - ultimoComandos >= PERIODO_COMANDOS_MS) {
      ultimoComandos = agora;
      processarComandos();
    }
    if (agora - ultimoHeartbeat >= PERIODO_HEARTBEAT_MS) {
      ultimoHeartbeat = agora;
      enviarHeartbeat();
    }
    if (agora - ultimoConfig >= PERIODO_CONFIG_MS) {
      ultimoConfig = agora;
      baixarConfiguracao();
    }
    if (agora - ultimoNTP >= PERIODO_NTP_MS) {
      sincronizarNTP();
    }
  }

  // LED: aceso = tudo certo; piscando = falta rede ou relógio.
  if (WiFi.status() == WL_CONNECTED && relogioSincronizado) {
    digitalWrite(PINO_LED, HIGH);
  } else if (agora - ultimoLed >= 500) {
    ultimoLed = agora;
    digitalWrite(PINO_LED, !digitalRead(PINO_LED));
  }

  delay(50);
}
