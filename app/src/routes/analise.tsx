import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";

import { AppScreen } from "@/components/AppScreen";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalysis } from "@/lib/api";
import type { AnalysisPeriod, Anomaly } from "@/lib/types";

export const Route = createFileRoute("/analise")({
  head: () => ({
    meta: [
      { title: "Análise de consumo — PetFeeder" },
      {
        name: "description",
        content: "Rotinas de alimentação, anomalias de consumo e resumo do período do seu pet.",
      },
      { property: "og:title", content: "Análise de consumo — PetFeeder" },
      {
        property: "og:description",
        content: "Gráficos de consumo, agrupamentos de horário e anomalias detectadas.",
      },
    ],
  }),
  component: AnaliseScreen,
});

const PERIODS: AnalysisPeriod[] = [7, 30, 90];

const SEVERITY: Record<Anomaly["severity"], { label: string; cls: string }> = {
  low: { label: "Baixa", cls: "bg-warning-soft text-warning-foreground" },
  medium: { label: "Média", cls: "bg-warning-soft text-warning-foreground" },
  high: { label: "Alta", cls: "bg-danger-soft text-danger" },
};

function AnaliseScreen() {
  const [period, setPeriod] = useState<AnalysisPeriod>(7);
  const analysis = useQuery({
    queryKey: ["analysis", period],
    queryFn: () => getAnalysis(period),
  });

  const data = analysis.data;

  return (
    <AppScreen>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Análise</h1>

      {/*
        O aviso agora é consequência do dado, e não um texto fixo: ele sai
        de analysis_runs.dataset_kind. Enquanto houver qualquer registro
        sintético no período, o aviso aparece. Quando a coleta real
        substituir o conjunto, ele some sozinho — ninguém precisa lembrar
        de apagar nada, que é justamente o risco de deixar isso no código.
      */}
      {data?.datasetKind !== "real" && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warning-soft p-3 text-xs font-medium text-warning-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {data?.datasetKind === "mixed"
              ? "Dados parcialmente simulados — em validação técnica. O período mistura registros sintéticos, gerados para validar os algoritmos, com medições reais do dispositivo."
              : "Dados simulados — em validação técnica. O conjunto atual é sintético, gerado para validar os algoritmos, e não representa medições reais do animal."}
          </span>
        </div>
      )}

      <div
        className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1"
        role="group"
        aria-label="Período de análise"
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={`tap-feedback min-h-[44px] rounded-xl text-sm font-bold ${
              period === p ? "bg-surface text-primary shadow-card" : "text-muted-foreground"
            }`}
          >
            {p} dias
          </button>
        ))}
      </div>

      {analysis.isError && (
        <div className="mt-4 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          Não foi possível carregar a análise.{" "}
          <button className="font-bold underline" onClick={() => analysis.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {analysis.isPending && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {data && (
        <>
          {/* Card 1 — consumo */}
          <section className="mt-4 rounded-2xl bg-card p-4 shadow-card">
            <h2 className="text-sm font-bold text-foreground">Consumo ao longo do tempo</h2>
            <p className="text-xs text-muted-foreground">Gramas consumidos por dia</p>
            {data.consumption.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sem registros no período.
              </p>
            ) : (
              <div className="mt-3 h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.consumption} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(8) + "/" + v.slice(5, 7)}
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                      minTickGap={18}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip
                      formatter={(v: number) => [`${v} g`, "Consumo"]}
                      labelFormatter={(l: string) =>
                        new Date(`${l}T00:00:00`).toLocaleDateString("pt-BR")
                      }
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="grams" radius={[4, 4, 0, 0]}>
                      {data.consumption.map((d) => (
                        <Cell
                          key={d.date}
                          fill={d.anomaly ? "var(--color-danger)" : "var(--color-primary)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden /> Normal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-danger" aria-hidden /> Com anomalia
              </span>
            </div>
          </section>

          {/* Card 2 — clusters */}
          <section className="mt-3 rounded-2xl bg-card p-4 shadow-card">
            <h2 className="text-sm font-bold text-foreground">Rotinas identificadas</h2>
            <p className="text-xs text-muted-foreground">Agrupamento de horários (K-means)</p>
            {data.clusters.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ainda não há registros suficientes para identificar rotinas.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.clusters.map((c) => (
                  <li key={c.id} className="rounded-2xl bg-background p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-bold text-foreground">
                        {c.label} — {c.startTime} às {c.endTime}
                      </p>
                      <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
                        {c.eventCount} registros
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Porção média: <span className="font-semibold">{c.avgPortionGrams} g</span>
                    </p>
                    <div className="relative mt-2 h-6 rounded-full bg-muted" aria-hidden>
                      {c.timesInMinutes.map((m, i) => (
                        <span
                          key={i}
                          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40"
                          style={{ left: `${(m / 1440) * 100}%` }}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>00h</span>
                      <span>12h</span>
                      <span>24h</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Card 3 — anomalias */}
          <section className="mt-3 rounded-2xl bg-card p-4 shadow-card">
            <h2 className="text-sm font-bold text-foreground">Anomalias detectadas</h2>
            <p className="text-xs text-muted-foreground">Desvios de consumo (Z-score)</p>
            {data.anomalies.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-9 w-9 text-success" aria-hidden />
                <p className="text-sm font-bold text-foreground">Nenhuma anomalia no período</p>
                <p className="text-xs text-muted-foreground">
                  O consumo do Max seguiu o padrão esperado.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.anomalies.map((a) => (
                  <li key={a.id} className="flex gap-3 rounded-2xl bg-background p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <p className="truncate text-sm font-bold text-foreground">
                          {new Date(`${a.date}T00:00:00`).toLocaleDateString("pt-BR")}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${SEVERITY[a.severity].cls}`}
                        >
                          {SEVERITY[a.severity].label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                        z-score {a.zScore.toFixed(1)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Card 4 — resumo */}
          <section className="mt-3 rounded-2xl bg-card p-4 shadow-card">
            <h2 className="text-sm font-bold text-foreground">Resumo do período</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["Média diária", `${data.summary.avgDailyGrams} g`],
                ["Regularidade", `${data.summary.regularityPercent}%`],
                ["Anomalias", `${data.summary.anomalyCount}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-background p-3 text-center">
                  <p className="text-xl font-extrabold text-foreground">{value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AppScreen>
  );
}
