import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MoreVertical, Plus, Trash2 } from "lucide-react";

import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { deleteSchedule, getSchedules, toggleSchedule } from "@/lib/api";
import type { Schedule } from "@/lib/types";

export const Route = createFileRoute("/agenda/")({
  head: () => ({
    meta: [
      { title: "Agenda — PetFeeder" },
      {
        name: "description",
        content: "Crie e gerencie os horários automáticos de alimentação do seu pet.",
      },
      { property: "og:title", content: "Agenda — PetFeeder" },
      {
        property: "og:description",
        content: "Horários, porções e dias da semana das refeições automáticas.",
      },
    ],
  }),
  component: AgendaScreen,
});

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function frequencyText(s: Schedule) {
  if (s.frequency === "daily") return "Todos os dias";
  if (s.frequency === "once")
    return s.date
      ? `Uma vez em ${new Date(`${s.date}T00:00:00`).toLocaleDateString("pt-BR")}`
      : "Uma única vez";
  return "Dias específicos";
}

function AgendaScreen() {
  const qc = useQueryClient();
  const schedules = useQuery({ queryKey: ["schedules"], queryFn: getSchedules });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleSchedule(id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["homeStats"] });
    },
  });

  const remove = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["homeStats"] });
    },
  });

  return (
    <AppScreen>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Agenda</h1>
      <p className="mt-1 text-sm text-muted-foreground">Refeições automáticas do alimentador.</p>

      {schedules.isPending && (
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      )}

      {schedules.isError && (
        <div className="mt-6 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          Não foi possível carregar os agendamentos.{" "}
          <button className="font-bold underline" onClick={() => schedules.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {schedules.data?.length === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-2xl bg-card p-8 text-center shadow-card">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-primary-soft">
            <CalendarClock className="h-9 w-9 text-primary" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">Nenhum agendamento ainda</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina horários fixos e o Max come sempre na hora certa.
          </p>
          <Button asChild size="lg" className="tap-feedback mt-5 h-12 w-full rounded-2xl font-bold">
            <Link to="/agenda/novo">Criar o primeiro agendamento</Link>
          </Button>
        </div>
      )}

      <ul className="mt-5 space-y-3">
        {schedules.data?.map((s) => (
          <li key={s.id} className="rounded-2xl bg-card p-4 shadow-card">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="text-3xl font-extrabold tracking-tight text-foreground">{s.time}</p>
                <p className="mt-0.5 truncate text-sm font-medium text-muted-foreground">
                  {s.label || "Refeição"} · {s.portionGrams} g
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={s.enabled}
                  aria-label={`Ativar agendamento das ${s.time}`}
                  onCheckedChange={(v) => toggle.mutate({ id: s.id, enabled: v })}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Opções do agendamento das ${s.time}`}
                    className="tap-feedback grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-danger"
                      onClick={() => remove.mutate(s.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <p className="mt-3 text-xs font-medium text-muted-foreground">{frequencyText(s)}</p>
            {s.frequency !== "once" && (
              <div className="mt-2 flex gap-1.5">
                {WEEKDAY_LABELS.map((d, i) => {
                  const on = s.frequency === "daily" || s.weekdays.includes(i);
                  return (
                    <span
                      key={i}
                      aria-hidden
                      className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${
                        on ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d}
                    </span>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Link
        to="/agenda/novo"
        aria-label="Novo agendamento"
        className="tap-feedback fixed bottom-24 left-1/2 z-40 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-float sm:left-auto sm:right-[max(1rem,calc(50%-14rem))] sm:translate-x-0"
      >
        <Plus className="h-7 w-7" aria-hidden />
      </Link>
    </AppScreen>
  );
}
