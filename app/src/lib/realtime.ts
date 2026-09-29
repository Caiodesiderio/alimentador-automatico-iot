/**
 * Realtime do Supabase.
 *
 * O banco avisa o app quando alguma coisa muda, em vez de o app ficar
 * perguntando. Na prática: a ESP32 manda o peso, o Postgres publica a
 * mudança, e a tela se atualiza sozinha — sem recarregar, sem botão.
 *
 * Só o app usa Realtime. A ESP32 não: websocket em microcontrolador cai
 * e trava com frequência, então ela faz polling, que é feio e funciona.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase, supabaseConfigurado, DEVICE_ID } from "./supabase";

export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    // Nada disso roda no servidor (SSR) nem com o .env em branco.
    if (typeof window === "undefined" || !supabaseConfigurado) return;

    const invalidar = (chaves: string[]) =>
      chaves.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    const canal = supabase
      .channel(`alimentador-${DEVICE_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices", filter: `id=eq.${DEVICE_ID}` },
        () => invalidar(["device", "foodLevel", "cameraStream"]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "food_readings" },
        () => invalidar(["bowlWeight", "foodLevel"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feeding_events" },
        () => invalidar(["homeStats", "analysis", "analysisHeadline", "foodLevel"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => invalidar(["schedules", "homeStats"]),
      )
      .subscribe();

    // Rede instável é a regra, não a exceção: quando o aparelho volta a
    // ficar online ou o usuário volta para a aba, recarrega tudo. Sem
    // isso a tela fica mostrando o estado de antes da queda.
    const recarregarTudo = () => qc.invalidateQueries();
    const aoVoltarParaAba = () => {
      if (document.visibilityState === "visible") recarregarTudo();
    };

    window.addEventListener("online", recarregarTudo);
    document.addEventListener("visibilitychange", aoVoltarParaAba);

    return () => {
      supabase.removeChannel(canal);
      window.removeEventListener("online", recarregarTudo);
      document.removeEventListener("visibilitychange", aoVoltarParaAba);
    };
  }, [qc]);
}
