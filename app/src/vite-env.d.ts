/// <reference types="vite/client" />

/**
 * Variáveis de ambiente do app, declaradas para o TypeScript.
 * O modelo preenchido está em .env.example.
 */
interface ImportMetaEnv {
  /** URL do projeto no Supabase. */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave anon (pública). A service_role não entra aqui. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Id do alimentador na tabela devices. */
  readonly VITE_DEVICE_ID?: string;
  /** Nome mostrado na saudação da tela de Início. */
  readonly VITE_TUTOR_NOME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
