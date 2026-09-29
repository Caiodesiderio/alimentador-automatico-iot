// =====================================================================
// secrets.example.h  —  MODELO. Este arquivo VAI para o Git.
// =====================================================================
// Copie para "secrets.h" na mesma pasta e preencha com os valores reais.
// O arquivo secrets.h NUNCA pode ser versionado (já está no .gitignore).
//
//   cp secrets.example.h secrets.h
//
// Onde achar cada valor:
//   SUPABASE_URL  -> Supabase > Project Settings > API > Project URL
//   SUPABASE_ANON -> Supabase > Project Settings > API > anon public
//   DEVICE_TOKEN  -> resultado da última consulta da migration 0005_seed.sql
// =====================================================================

#pragma once

// ------------------------------------------------------------- Wi-Fi
#define WIFI_SSID   "NOME_DA_REDE"
#define WIFI_SENHA  "SENHA_DA_REDE"

// ---------------------------------------------------------- Supabase
// Sem barra no final.
#define SUPABASE_URL   "https://xxxxxxxxxxxxxxxx.supabase.co"

// Chave pública (anon). NÃO use a service_role aqui de jeito nenhum:
// ela ignora o RLS e pode ser lida de volta da flash por qualquer um
// com acesso físico à placa.
#define SUPABASE_ANON  "eyJhbGciOi...COLE_A_ANON_KEY_AQUI"

// Segredo deste alimentador, gerado pela migration 0005.
#define DEVICE_TOKEN   "COLE_O_DEVICE_TOKEN_AQUI"

// Precisa bater com o id da linha em public.devices.
#define DEVICE_ID      "esp32-01"
