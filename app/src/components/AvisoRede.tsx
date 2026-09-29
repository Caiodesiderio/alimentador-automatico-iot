/**
 * Faixa de aviso no topo da tela.
 *
 * Dois casos, e os dois acontecem de verdade numa apresentação:
 *  - o .env não foi preenchido: o app não tem para onde falar;
 *  - o celular ficou sem internet: nada vai carregar até voltar.
 *
 * Melhor dizer isso em uma linha do que deixar a tela girando para sempre.
 */
import { useEffect, useState } from "react";
import { WifiOff, AlertTriangle } from "lucide-react";

import { supabaseConfigurado } from "@/lib/supabase";

export function AvisoRede() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const atualizar = () => setOffline(!navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  if (!supabaseConfigurado) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-2 bg-danger px-4 py-2 text-xs font-semibold text-danger-foreground"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span>App não configurado — preencha o arquivo .env</span>
      </div>
    );
  }

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-xs font-semibold text-warning-foreground"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>Sem internet — mostrando os últimos dados recebidos</span>
    </div>
  );
}
