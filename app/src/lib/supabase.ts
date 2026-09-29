/**
 * Cliente do Supabase.
 *
 * As credenciais vêm de variáveis de ambiente (arquivo .env, que NÃO é
 * versionado). O modelo está em .env.example.
 *
 * A anon key é pública por natureza: ela vai embutida no bundle que o
 * navegador baixa. Quem protege os dados é a RLS do banco, não o sigilo
 * dessa chave. A service_role, essa sim secreta, não aparece em lugar
 * nenhum deste projeto.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Id do alimentador. Um só, por enquanto. */
export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID ?? "esp32-01";

/** Nome mostrado na saudação da tela de Início. */
export const TUTOR_NOME = import.meta.env.VITE_TUTOR_NOME ?? "Tutor";

/** Falso quando o .env não foi preenchido — o app avisa em vez de quebrar. */
export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = createClient(
  url ?? "https://nao-configurado.supabase.co",
  anonKey ?? "nao-configurado",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

/** Erro de configuração, com mensagem que o usuário entende. */
export class ErroConfiguracao extends Error {
  constructor() {
    super(
      "App não configurado: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.",
    );
    this.name = "ErroConfiguracao";
  }
}

export function exigirConfiguracao() {
  if (!supabaseConfigurado) throw new ErroConfiguracao();
}
