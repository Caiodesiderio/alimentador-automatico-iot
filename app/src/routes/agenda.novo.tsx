import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { createSchedule } from "@/lib/api";
import type { ScheduleFrequency } from "@/lib/types";

export const Route = createFileRoute("/agenda/novo")({
  head: () => ({
    meta: [
      { title: "Novo agendamento — PetFeeder" },
      {
        name: "description",
        content: "Defina horário, frequência e porção de uma nova refeição automática.",
      },
      { property: "og:title", content: "Novo agendamento — PetFeeder" },
      {
        property: "og:description",
        content: "Horário, dias da semana e porção em gramas da refeição.",
      },
    ],
  }),
  component: NovoAgendamento,
});

const WEEKDAYS = [
  { i: 1, l: "S" },
  { i: 2, l: "T" },
  { i: 3, l: "Q" },
  { i: 4, l: "Q" },
  { i: 5, l: "S" },
  { i: 6, l: "S" },
  { i: 0, l: "D" },
];

function NovoAgendamento() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [time, setTime] = useState("07:00");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("daily");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [date, setDate] = useState("");
  const [portion, setPortion] = useState(120);
  const [label, setLabel] = useState("");
  const [touched, setTouched] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const timeError = !time ? "Defina um horário." : null;
  const daysError =
    frequency === "weekly" && weekdays.length === 0 ? "Selecione ao menos um dia." : null;
  const dateError = frequency === "once" && !date ? "Escolha uma data." : null;
  const invalid = Boolean(timeError || daysError || dateError);

  const create = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["homeStats"] });
      const freq =
        frequency === "daily"
          ? "Todos os dias"
          : frequency === "weekly"
            ? "Dias selecionados"
            : `Em ${new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR")}`;
      setSummary(`${freq} às ${time} · ${portion} g`);
    },
  });

  useEffect(() => {
    if (!summary) return;
    const t = setTimeout(() => navigate({ to: "/" }), 1500);
    return () => clearTimeout(t);
  }, [summary, navigate]);

  function submit() {
    setTouched(true);
    if (invalid) return;
    create.mutate({
      label: label.trim(),
      time,
      frequency,
      weekdays: frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : frequency === "weekly" ? weekdays : [],
      date: frequency === "once" ? date : null,
      portionGrams: portion,
      enabled: true,
    });
  }

  if (summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8 text-center">
        <div className="animate-pop-check grid h-24 w-24 place-items-center rounded-full bg-success-soft">
          <Check className="h-12 w-12 text-success" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-foreground">Agendamento criado</h1>
        <p className="mt-2 text-base font-medium text-muted-foreground">{summary}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
        <header className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => navigate({ to: "/agenda" })}
            className="tap-feedback grid h-11 w-11 place-items-center rounded-full text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <h1 className="text-xl font-extrabold text-foreground">Novo agendamento</h1>
        </header>

        {/* Horário */}
        <section className="mt-5 rounded-2xl bg-card p-5 shadow-card">
          <Label htmlFor="horario" className="text-sm font-semibold text-muted-foreground">
            Horário
          </Label>
          <Input
            id="horario"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-2 h-20 rounded-2xl text-center text-4xl font-extrabold tracking-tight"
          />
          {touched && timeError && <p className="mt-2 text-xs text-danger">{timeError}</p>}
        </section>

        {/* Frequência */}
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-semibold text-muted-foreground">Frequência</p>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1" role="group">
            {(
              [
                ["daily", "Diariamente"],
                ["weekly", "Dias específicos"],
                ["once", "Uma vez"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                aria-pressed={frequency === value}
                onClick={() => setFrequency(value)}
                className={`tap-feedback min-h-[44px] rounded-xl px-1 text-xs font-bold ${
                  frequency === value
                    ? "bg-surface text-primary shadow-card"
                    : "text-muted-foreground"
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          {frequency === "weekly" && (
            <>
              <div className="mt-4 flex justify-between gap-1.5" role="group" aria-label="Dias da semana">
                {WEEKDAYS.map(({ i, l }) => {
                  const on = weekdays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Dia ${l}`}
                      onClick={() =>
                        setWeekdays((w) => (on ? w.filter((d) => d !== i) : [...w, i]))
                      }
                      className={`tap-feedback h-11 w-11 rounded-full text-sm font-bold ${
                        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
              {touched && daysError && <p className="mt-2 text-xs text-danger">{daysError}</p>}
            </>
          )}

          {frequency === "once" && (
            <div className="mt-4">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 h-12 rounded-2xl text-base"
              />
              {touched && dateError && <p className="mt-2 text-xs text-danger">{dateError}</p>}
            </div>
          )}
        </section>

        {/* Porção */}
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-muted-foreground">Porção</p>
            <p className="text-3xl font-extrabold text-primary">{portion} g</p>
          </div>
          <Slider
            aria-label="Porção em gramas"
            className="mt-4"
            min={20}
            max={300}
            step={5}
            value={[portion]}
            onValueChange={([v]) => setPortion(v ?? portion)}
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>20 g</span>
            <span>300 g</span>
          </div>
        </section>

        {/* Nome */}
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <Label htmlFor="nome">Nome (opcional)</Label>
          <Input
            id="nome"
            value={label}
            placeholder="Ex.: Café da manhã"
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1.5 h-12 rounded-2xl text-base"
          />
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            size="lg"
            onClick={submit}
            disabled={create.isPending}
            className="tap-feedback h-14 w-full rounded-2xl text-base font-bold"
          >
            {create.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                Agendando...
              </>
            ) : (
              "Agendar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
