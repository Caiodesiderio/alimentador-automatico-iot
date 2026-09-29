import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarPlus,
  ChevronRight,
  RefreshCw,
  UtensilsCrossed,
  Video,
} from "lucide-react";

import { AppScreen } from "@/components/AppScreen";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { FeedDialog } from "@/components/FeedDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAnalysisHeadline,
  getBowlWeight,
  getDevice,
  getFoodLevel,
  getHomeStats,
  getPet,
  getTutor,
  refillHopper,
  refreshFoodLevel,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — PetFeeder" },
      {
        name: "description",
        content: "Nível de ração, próxima refeição e liberação manual do alimentador do seu pet.",
      },
      { property: "og:title", content: "Início — PetFeeder" },
      {
        property: "og:description",
        content: "Acompanhe o nível de ração e alimente seu pet a qualquer hora.",
      },
    ],
  }),
  component: HomeScreen,
});

function levelTone(pct: number) {
  if (pct < 15) return { bar: "bg-danger", text: "text-danger" };
  if (pct <= 40) return { bar: "bg-warning", text: "text-warning-foreground" };
  return { bar: "bg-success", text: "text-success" };
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  return `há ${Math.round(mins / 60)} h`;
}

function HomeScreen() {
  const qc = useQueryClient();
  const [feedOpen, setFeedOpen] = useState(false);

  const tutor = useQuery({ queryKey: ["tutor"], queryFn: getTutor });
  const pet = useQuery({ queryKey: ["pet"], queryFn: getPet });
  const device = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const food = useQuery({ queryKey: ["foodLevel"], queryFn: getFoodLevel });
  const stats = useQuery({ queryKey: ["homeStats"], queryFn: getHomeStats });
  const headline = useQuery({ queryKey: ["analysisHeadline"], queryFn: getAnalysisHeadline });
  // Peso na tigela: este é o valor MEDIDO pela célula de carga.
  const bowl = useQuery({ queryKey: ["bowlWeight"], queryFn: getBowlWeight });

  const refresh = useMutation({
    mutationFn: refreshFoodLevel,
    onSuccess: (data) => qc.setQueryData(["foodLevel"], data),
  });

  // A célula de carga está na tigela e não tem como perceber que alguém
  // encheu o tanque. Quem avisa é o tutor, por este botão — sem ele a
  // estimativa do reservatório só cai e nunca sobe.
  const refill = useMutation({
    mutationFn: () => refillHopper(),
    onSuccess: (data) => qc.setQueryData(["foodLevel"], data),
  });

  const online = device.data?.status === "online";
  const tone = levelTone(food.data?.percentage ?? 100);

  return (
    <AppScreen>
      {/* Cabeçalho */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {pet.isPending ? (
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          ) : (
            <img
              src={pet.data!.avatarUrl}
              alt={`Foto de ${pet.data!.name}`}
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          )}
          <div className="min-w-0">
            {tutor.isPending ? (
              <Skeleton className="h-4 w-28" />
            ) : (
              <p className="truncate text-sm text-muted-foreground">Olá, {tutor.data!.name}</p>
            )}
            {pet.isPending ? (
              <Skeleton className="mt-1.5 h-5 w-20" />
            ) : (
              <p className="truncate text-lg font-bold text-foreground">{pet.data!.name}</p>
            )}
          </div>
        </div>
        {device.isPending ? (
          <Skeleton className="h-7 w-20 rounded-full" />
        ) : (
          <DeviceStatusBadge status={device.data!.status} />
        )}
      </header>

      {/* Nível de ração */}
      <section className="mt-5 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-muted-foreground">Nível de ração</h2>
            <p className="text-[11px] text-muted-foreground">
              estimado por saldo — a balança fica na tigela
            </p>
          </div>
          <button
            type="button"
            aria-label="Atualizar leitura do nível de ração"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="tap-feedback grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
          >
            <RefreshCw className={`h-5 w-5 ${refresh.isPending ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>

        {food.isPending ? (
          <div className="mt-2 space-y-3">
            <Skeleton className="h-12 w-28" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : food.isError || !food.data ? (
          <p className="mt-3 rounded-2xl bg-danger-soft p-3 text-sm text-danger">
            Não foi possível ler o nível agora. Puxe para atualizar ou verifique a conexão.
          </p>
        ) : (
          <>
            <p className={`text-5xl font-extrabold tracking-tight ${tone.text}`}>
              {food.data!.percentage}%
            </p>
            <div
              className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={food.data!.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Nível do reservatório"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
                style={{ width: `${food.data!.percentage}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {food.data!.currentGrams.toLocaleString("pt-BR")} g de{" "}
              {food.data!.capacityGrams.toLocaleString("pt-BR")} g
            </p>
            {food.data!.percentage < 15 && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-danger-soft p-3 text-sm font-medium text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                Reservatório baixo — reabasteça
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              atualizado {timeAgo(food.data!.readAt)}
            </p>

            {/* Ao lado da estimativa do reservatório, o valor que a célula
                de carga realmente mede. Deixa visível o que é medição e o
                que é cálculo — a banca vai perguntar. */}
            {bowl.data && (
              <p className="mt-1 text-xs text-muted-foreground">
                na tigela agora:{" "}
                <span className="font-semibold text-foreground">
                  {Math.round(bowl.data.grams)} g
                </span>{" "}
                (medido)
              </p>
            )}

            <Button
              variant="outline"
              onClick={() => refill.mutate()}
              disabled={refill.isPending}
              className="tap-feedback mt-3 h-11 w-full rounded-2xl text-sm font-semibold"
            >
              {refill.isPending ? "Registrando..." : "Reabasteci o reservatório"}
            </Button>
          </>
        )}
      </section>

      {/* Estatísticas */}
      <section className="mt-3 grid grid-cols-3 gap-2" aria-label="Resumo do dia">
        {(
          [
            ["Próxima", stats.data?.nextMealTime ?? "—"],
            [
              "Última",
              stats.data?.lastMeal ? `${stats.data.lastMeal.time}` : "—",
              stats.data?.lastMeal ? `${stats.data.lastMeal.grams} g` : undefined,
            ],
            ["Hoje", stats.data ? `${stats.data.todayGrams} g` : "—"],
          ] as const
        ).map(([label, value, sub], i) =>
          stats.isPending ? (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ) : (
            <div key={i} className="rounded-2xl bg-card p-3 text-center shadow-card">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
              <p className="text-[11px] text-muted-foreground">{sub ?? "\u00A0"}</p>
            </div>
          ),
        )}
      </section>

      {/* Alimentar agora */}
      <div className="mt-4">
        <Button
          size="lg"
          disabled={device.isPending || !online}
          onClick={() => setFeedOpen(true)}
          className="tap-feedback h-16 w-full rounded-2xl text-lg font-bold"
        >
          <UtensilsCrossed className="mr-2 h-5 w-5" aria-hidden />
          Alimentar agora
        </Button>
        {!device.isPending && !online && (
          <p className="mt-2 text-center text-xs text-danger">
            Dispositivo offline — reconecte o alimentador à rede para liberar ração.
          </p>
        )}
      </div>

      {/* Atalhos */}
      <section className="mt-5 space-y-2" aria-label="Atalhos">
        <Shortcut
          to="/agenda/novo"
          icon={<CalendarPlus className="h-5 w-5 text-primary" aria-hidden />}
          title="Agendar refeição"
          subtitle="Crie um novo horário automático"
        />
        <Shortcut
          to="/camera"
          icon={<Video className="h-5 w-5 text-primary" aria-hidden />}
          title="Ver ao vivo"
          subtitle="Câmera da ESP32-CAM"
        />
        <Shortcut
          to="/analise"
          icon={<BarChart3 className="h-5 w-5 text-primary" aria-hidden />}
          title="Análise de consumo"
          subtitle={headline.isPending ? "carregando resumo..." : headline.data!}
        />
      </section>

      <FeedDialog
        open={feedOpen}
        onOpenChange={setFeedOpen}
        deviceOnline={!!online}
        onFed={() => {
          qc.invalidateQueries({ queryKey: ["foodLevel"] });
          qc.invalidateQueries({ queryKey: ["homeStats"] });
        }}
      />
    </AppScreen>
  );
}

function Shortcut({
  to,
  icon,
  title,
  subtitle,
}: {
  to: "/agenda/novo" | "/camera" | "/analise";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="tap-feedback flex min-h-[64px] items-center gap-3 rounded-2xl bg-card p-4 shadow-card"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
