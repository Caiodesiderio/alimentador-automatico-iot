/**
 * Camada de dados REAL — substitui a antiga mockApi.ts.
 *
 * Todas as funções mantêm exatamente a mesma assinatura da versão mock,
 * de propósito: nenhum componente de tela precisou ser reescrito por
 * causa da troca. O que mudou foi só a origem dos dados.
 *
 * Quem fala com o quê:
 *   app  --HTTPS-->  Supabase  <--HTTPS--  ESP32 (ela é que pergunta)
 * O celular NUNCA fala direto com a ESP32 principal: ela está atrás de
 * NAT e não aceita conexão de entrada. Por isso "alimentar agora" é uma
 * linha inserida na tabela `commands`, que a ESP32 busca no polling dela.
 * A única conexão direta é o vídeo da ESP32-CAM, na rede local.
 */
import { supabase, DEVICE_ID, TUTOR_NOME, exigirConfiguracao } from "./supabase";
import type {
  Analysis,
  AnalysisPeriod,
  Anomaly,
  BowlWeight,
  CameraStream,
  Cluster,
  DailyConsumption,
  Device,
  DeviceStatus,
  FeedResult,
  FeedingEvent,
  FoodLevel,
  HomeStats,
  Pet,
  Schedule,
  Tutor,
} from "./types";

// ==================================================================
//  utilidades
// ==================================================================

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Erro com mensagem que pode ser mostrada na tela sem constranger ninguém. */
export class ErroApp extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroApp";
  }
}

/**
 * Converte o erro do supabase-js em algo legível. A distinção importa:
 * "sem internet" pede uma ação do usuário, "falha no servidor" não.
 */
function tratarErro(erro: unknown, contexto: string): never {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ErroApp("Sem conexão com a internet.");
  }
  const msg = (erro as { message?: string } | null)?.message ?? "";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    throw new ErroApp("Não foi possível falar com o servidor. Verifique sua conexão.");
  }
  console.error(`[api] ${contexto}:`, erro);
  throw new ErroApp(`Falha ao ${contexto}.`);
}

/** Meia-noite de hoje, no fuso do aparelho. */
function inicioDoDia(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ==================================================================
//  dispositivo, pet e tutor
// ==================================================================

export async function getTutor(): Promise<Tutor> {
  return { id: "tutor", name: TUTOR_NOME };
}

export async function getPet(): Promise<Pet> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("pets")
    .select("id, name, avatar_url, weight_kg, daily_target_grams")
    .eq("device_id", DEVICE_ID)
    .limit(1)
    .maybeSingle();

  if (error) tratarErro(error, "carregar o pet");
  if (!data) throw new ErroApp("Nenhum pet cadastrado para este alimentador.");

  return {
    id: data.id,
    name: data.name,
    avatarUrl: data.avatar_url ?? "",
    weightKg: Number(data.weight_kg),
    dailyTargetGrams: Number(data.daily_target_grams),
  };
}

export async function getDevice(): Promise<Device> {
  exigirConfiguracao();
  // v_devices deriva o status de last_seen e não expõe o device_token.
  const { data, error } = await supabase
    .from("v_devices")
    .select("id, name, status, firmware_version, last_seen, stream_url")
    .eq("id", DEVICE_ID)
    .maybeSingle();

  if (error) tratarErro(error, "consultar o alimentador");
  if (!data) throw new ErroApp(`Alimentador "${DEVICE_ID}" não encontrado no banco.`);

  return {
    id: data.id,
    name: data.name,
    status: data.status as DeviceStatus,
    firmwareVersion: data.firmware_version ?? "—",
    lastSeen: data.last_seen ?? new Date(0).toISOString(),
    streamUrl: data.stream_url ?? "",
  };
}

// ==================================================================
//  nível de ração
// ==================================================================

/**
 * ATENÇÃO — este número é ESTIMADO, não medido.
 * A célula de carga está na tigela. O nível do reservatório é o saldo
 * entre a última carga registrada e a soma das porções liberadas. Quem
 * atualiza para cima é o tutor, com o botão "reabasteci o reservatório".
 */
export async function getFoodLevel(): Promise<FoodLevel> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("v_devices")
    .select("hopper_grams, hopper_capacity_grams, hopper_updated_at")
    .eq("id", DEVICE_ID)
    .maybeSingle();

  if (error) tratarErro(error, "ler o nível de ração");
  if (!data) throw new ErroApp("Alimentador não encontrado.");

  const capacity = Number(data.hopper_capacity_grams) || 1;
  const current = Number(data.hopper_grams) || 0;

  return {
    currentGrams: Math.round(current),
    capacityGrams: Math.round(capacity),
    percentage: Math.max(0, Math.min(100, Math.round((current / capacity) * 100))),
    readAt: data.hopper_updated_at ?? new Date().toISOString(),
    isEstimate: true,
  };
}

export async function refreshFoodLevel(): Promise<FoodLevel> {
  return getFoodLevel();
}

/** Peso que está na tigela AGORA. Este sim é medido pela célula de carga. */
export async function getBowlWeight(): Promise<BowlWeight | null> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("food_readings")
    .select("bowl_grams, read_at")
    .eq("device_id", DEVICE_ID)
    .order("read_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) tratarErro(error, "ler o peso da tigela");
  if (!data) return null;
  return { grams: Number(data.bowl_grams), readAt: data.read_at };
}

/** Registra que o reservatório foi reabastecido. Sem isso a estimativa só cai. */
export async function refillHopper(gramsAfter?: number): Promise<FoodLevel> {
  exigirConfiguracao();

  let alvo = gramsAfter;
  if (alvo == null) {
    const { data } = await supabase
      .from("v_devices")
      .select("hopper_capacity_grams")
      .eq("id", DEVICE_ID)
      .maybeSingle();
    alvo = Number(data?.hopper_capacity_grams ?? 2000);
  }

  const { error } = await supabase
    .from("hopper_refills")
    .insert({ device_id: DEVICE_ID, grams_after: alvo, note: "registrado pelo app" });

  if (error) tratarErro(error, "registrar o reabastecimento");
  return getFoodLevel();
}

// ==================================================================
//  tela de início
// ==================================================================

function mapearEvento(linha: {
  id: string;
  occurred_at: string;
  grams: number | string;
  trigger: string;
  consumed_grams: number | string;
  consumed: boolean;
}): FeedingEvent {
  return {
    id: linha.id,
    timestamp: linha.occurred_at,
    grams: Math.round(Number(linha.grams)),
    trigger: linha.trigger as "scheduled" | "manual",
    consumedGrams: Math.round(Number(linha.consumed_grams)),
    consumed: linha.consumed,
  };
}

export async function getHomeStats(): Promise<HomeStats> {
  exigirConfiguracao();

  const [agendas, ultimo, hoje] = await Promise.all([
    supabase
      .from("schedules")
      .select("time_of_day")
      .eq("device_id", DEVICE_ID)
      .eq("enabled", true)
      .order("time_of_day"),
    supabase
      .from("feeding_events")
      .select("occurred_at, grams")
      .eq("device_id", DEVICE_ID)
      .order("occurred_at", { ascending: false })
      .limit(1),
    supabase
      .from("feeding_events")
      .select("grams")
      .eq("device_id", DEVICE_ID)
      .gte("occurred_at", inicioDoDia().toISOString()),
  ]);

  if (agendas.error) tratarErro(agendas.error, "carregar a agenda");
  if (ultimo.error) tratarErro(ultimo.error, "carregar a última refeição");
  if (hoje.error) tratarErro(hoje.error, "somar o total de hoje");

  const horarios = (agendas.data ?? []).map((s) => String(s.time_of_day).slice(0, 5)).sort();
  const agora = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const nextMealTime = horarios.find((h) => h > agora) ?? horarios[0] ?? null;

  const ult = ultimo.data?.[0];
  const todayGrams = (hoje.data ?? []).reduce((s, e) => s + Number(e.grams), 0);

  return {
    nextMealTime,
    lastMeal: ult
      ? {
          time: new Date(ult.occurred_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          grams: Math.round(Number(ult.grams)),
        }
      : null,
    todayGrams: Math.round(todayGrams),
  };
}

// ==================================================================
//  alimentar agora — fila de comandos
// ==================================================================

/** Quanto o app espera pelo alimentador. O 28BYJ-48 é lento: 120 g levam perto de 1 min. */
const ESPERA_MAXIMA_MS = 150_000;
const INTERVALO_CONSULTA_MS = 1_200;

/**
 * Insere um comando e espera a ESP32 executar.
 *
 * O caminho completo: o app insere em `commands` com status 'pending';
 * a ESP32 busca a cada 3 s e marca 'claimed' na mesma transação (por
 * isso não existe risco de porção dobrada); pesa o que caiu na tigela;
 * e dá baixa como 'done' junto com o registro da alimentação.
 *
 * Se ninguém buscar em 2 minutos, o próprio banco marca 'expired' — é a
 * trava que impede o alimentador de despejar ração atrasada quando o
 * Wi-Fi volta depois de uma queda longa.
 */
export async function feedNow(grams: number): Promise<FeedResult> {
  exigirConfiguracao();

  const { data: comando, error } = await supabase
    .from("commands")
    .insert({ device_id: DEVICE_ID, type: "feed_now", payload: { grams } })
    .select("id")
    .single();

  if (error) tratarErro(error, "enviar o comando de alimentar");

  const inicio = Date.now();
  while (Date.now() - inicio < ESPERA_MAXIMA_MS) {
    await new Promise((r) => setTimeout(r, INTERVALO_CONSULTA_MS));

    const { data, error: erroConsulta } = await supabase
      .from("commands")
      .select("status, result")
      .eq("id", comando.id)
      .maybeSingle();

    if (erroConsulta) continue; // falha momentânea de rede: tenta de novo
    if (!data) continue;

    if (data.status === "done") {
      const resultado = (data.result ?? {}) as { grams?: number; feeding_event_id?: string };
      const liberado = Math.round(Number(resultado.grams ?? grams));

      let evento: FeedingEvent | null = null;
      if (resultado.feeding_event_id) {
        const { data: ev } = await supabase
          .from("feeding_events")
          .select("id, occurred_at, grams, trigger, consumed_grams, consumed")
          .eq("id", resultado.feeding_event_id)
          .maybeSingle();
        if (ev) evento = mapearEvento(ev);
      }

      return {
        grams: liberado,
        event:
          evento ?? {
            id: comando.id,
            timestamp: new Date().toISOString(),
            grams: liberado,
            trigger: "manual",
            consumedGrams: 0,
            consumed: false,
          },
      };
    }

    if (data.status === "failed") {
      const motivo = ((data.result ?? {}) as { erro?: string }).erro;
      throw new ErroApp(
        motivo === "entupimento"
          ? "O dosador travou. Verifique se há ração presa na rosca."
          : motivo === "balanca_indisponivel"
            ? "A balança não respondeu. Verifique a ligação do HX711."
            : "O alimentador não conseguiu liberar a ração.",
      );
    }

    if (data.status === "expired") {
      throw new ErroApp("O alimentador não respondeu. Verifique se ele está conectado ao Wi-Fi.");
    }
  }

  throw new ErroApp("O alimentador demorou demais para responder. Confira o dispositivo.");
}

// ==================================================================
//  agendamentos
// ==================================================================

function mapearAgendamento(linha: {
  id: string;
  label: string;
  time_of_day: string;
  frequency: string;
  weekdays: number[] | null;
  run_date: string | null;
  portion_grams: number;
  enabled: boolean;
}): Schedule {
  return {
    id: linha.id,
    label: linha.label,
    time: String(linha.time_of_day).slice(0, 5),
    frequency: linha.frequency as Schedule["frequency"],
    weekdays: linha.weekdays ?? [],
    date: linha.run_date,
    portionGrams: linha.portion_grams,
    enabled: linha.enabled,
  };
}

const CAMPOS_AGENDA =
  "id, label, time_of_day, frequency, weekdays, run_date, portion_grams, enabled";

export async function getSchedules(): Promise<Schedule[]> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("schedules")
    .select(CAMPOS_AGENDA)
    .eq("device_id", DEVICE_ID)
    .order("time_of_day");

  if (error) tratarErro(error, "carregar os agendamentos");
  return (data ?? []).map(mapearAgendamento);
}

export async function createSchedule(input: Omit<Schedule, "id">): Promise<Schedule> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("schedules")
    .insert({
      device_id: DEVICE_ID,
      label: input.label,
      time_of_day: `${input.time}:00`,
      frequency: input.frequency,
      // 'daily' não precisa de dias; o banco recusaria 'weekly' sem nenhum.
      weekdays: input.frequency === "weekly" ? input.weekdays : [],
      run_date: input.frequency === "once" ? input.date : null,
      portion_grams: input.portionGrams,
      enabled: input.enabled,
    })
    .select(CAMPOS_AGENDA)
    .single();

  if (error) tratarErro(error, "criar o agendamento");
  return mapearAgendamento(data);
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<Schedule> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("schedules")
    .update({ enabled })
    .eq("id", id)
    .select(CAMPOS_AGENDA)
    .single();

  if (error) tratarErro(error, "ligar ou desligar o agendamento");
  return mapearAgendamento(data);
}

export async function deleteSchedule(id: string): Promise<void> {
  exigirConfiguracao();
  const { error } = await supabase.from("schedules").delete().eq("id", id);
  if (error) tratarErro(error, "apagar o agendamento");
}

// ==================================================================
//  câmera
// ==================================================================

/**
 * Duas formas de ver a câmera, e o app escolhe sozinho:
 *
 *  - "live": <img src="http://192.168.x.x:81/stream">, vídeo contínuo.
 *    Só funciona se o próprio app estiver sendo servido em HTTP e o
 *    celular estiver na mesma rede. Um app em HTTPS não consegue exibir
 *    conteúdo HTTP — o navegador bloqueia (mixed content) e não há
 *    contorno do lado do código.
 *
 *  - "snapshot": foto que a ESP32-CAM manda de tempos em tempos para o
 *    Supabase Storage. Chega por HTTPS, funciona de qualquer lugar,
 *    inclusive no 4G. Não é vídeo: é um quadro a cada poucos segundos.
 */
export async function getCameraStream(): Promise<CameraStream> {
  exigirConfiguracao();
  const { data, error } = await supabase
    .from("v_devices")
    .select("stream_url, snapshot_path, status")
    .eq("id", DEVICE_ID)
    .maybeSingle();

  if (error) tratarErro(error, "consultar a câmera");
  if (!data) throw new ErroApp("Alimentador não encontrado.");

  const streamUrl = data.stream_url ?? "";

  let snapshotUrl: string | null = null;
  if (data.snapshot_path) {
    const { data: pub } = supabase.storage.from("snapshots").getPublicUrl(data.snapshot_path);
    // O parâmetro de tempo evita o navegador servir a foto antiga do cache.
    snapshotUrl = `${pub.publicUrl}?t=${Date.now()}`;
  }

  const paginaEmHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const streamBloqueado = paginaEmHttps && streamUrl.startsWith("http://");
  const podeAoVivo = Boolean(streamUrl) && !streamBloqueado;

  // Sem RSSI guardado no banco, a qualidade é derivada da presença do
  // dispositivo. É uma aproximação honesta, não uma medida de sinal.
  const signalQuality =
    data.status === "online" ? "boa" : data.status === "connecting" ? "média" : "fraca";

  return {
    streamUrl: podeAoVivo ? streamUrl : (snapshotUrl ?? ""),
    signalQuality,
    mode: podeAoVivo ? "live" : "snapshot",
    snapshotUrl,
  };
}

// ==================================================================
//  análise (K-means e Z-score vêm do pipeline Python — Etapa E)
// ==================================================================

export async function getAnalysis(period: AnalysisPeriod): Promise<Analysis> {
  exigirConfiguracao();

  const desde = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

  const [eventos, execucao] = await Promise.all([
    supabase
      .from("feeding_events")
      .select("id, occurred_at, grams, trigger, consumed_grams, consumed, source")
      .eq("device_id", DEVICE_ID)
      .gte("occurred_at", desde)
      .order("occurred_at"),
    supabase
      .from("analysis_runs")
      .select("id, dataset_kind, ran_at")
      .eq("device_id", DEVICE_ID)
      .eq("period_days", period)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (eventos.error) tratarErro(eventos.error, "carregar o histórico de alimentação");

  const linhas = eventos.data ?? [];

  // --- consumo por dia ---------------------------------------------
  const porDia = new Map<string, number>();
  linhas.forEach((e) => {
    const chave = isoDate(new Date(e.occurred_at));
    porDia.set(chave, (porDia.get(chave) ?? 0) + Number(e.consumed_grams));
  });

  // --- agrupamentos e anomalias, gravados pelo pipeline Python ------
  let clusters: Cluster[] = [];
  let anomalies: Anomaly[] = [];

  if (execucao.data?.id) {
    const [c, a] = await Promise.all([
      supabase
        .from("analysis_clusters")
        .select("id, label, start_time, end_time, avg_portion_grams, event_count, times_in_minutes")
        .eq("run_id", execucao.data.id)
        .order("start_time"),
      supabase
        .from("analysis_anomalies")
        .select("id, event_date, type, description, z_score, severity")
        .eq("run_id", execucao.data.id)
        .order("event_date", { ascending: false }),
    ]);

    clusters = (c.data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      startTime: String(r.start_time).slice(0, 5),
      endTime: String(r.end_time).slice(0, 5),
      avgPortionGrams: Math.round(Number(r.avg_portion_grams)),
      eventCount: r.event_count,
      timesInMinutes: r.times_in_minutes ?? [],
    }));

    anomalies = (a.data ?? []).map((r) => ({
      id: r.id,
      date: r.event_date,
      type: r.type,
      description: r.description,
      zScore: Number(r.z_score),
      severity: r.severity as Anomaly["severity"],
    }));
  }

  const diasComAnomalia = new Set(anomalies.map((a) => a.date));

  const consumption: DailyConsumption[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, grams]) => ({
      date,
      grams: Math.round(grams),
      anomaly: diasComAnomalia.has(date),
    }));

  const avgDailyGrams = consumption.length
    ? Math.round(consumption.reduce((s, c) => s + c.grams, 0) / consumption.length)
    : 0;

  // Regularidade = proporção de dias do período sem nenhuma anomalia.
  // É uma definição simples e que dá para explicar para a banca em uma
  // frase, ao contrário de um índice composto que ninguém sabe conferir.
  const regularityPercent = consumption.length
    ? Math.round(((consumption.length - diasComAnomalia.size) / consumption.length) * 100)
    : 0;

  // De onde vieram os dados. Se o pipeline ainda não rodou, deduz pelos
  // próprios eventos: qualquer registro sintético já obriga o aviso.
  const temSintetico = linhas.some((e) => e.source === "synthetic");
  const temReal = linhas.some((e) => e.source === "device");
  const datasetKind =
    (execucao.data?.dataset_kind as Analysis["datasetKind"]) ??
    (temSintetico && temReal ? "mixed" : temSintetico ? "synthetic" : temReal ? "real" : "synthetic");

  const headline = anomalies.length
    ? `${anomalies.length} ${anomalies.length === 1 ? "anomalia detectada" : "anomalias detectadas"} nos últimos ${period} dias`
    : consumption.length
      ? `Padrão regular — nenhuma anomalia nos últimos ${period} dias`
      : "Ainda não há dados suficientes para análise";

  return {
    period,
    datasetKind,
    ranAt: execucao.data?.ran_at ?? null,
    consumption,
    clusters,
    anomalies,
    summary: { avgDailyGrams, regularityPercent, anomalyCount: anomalies.length },
    headline,
  };
}

export async function getAnalysisHeadline(): Promise<string> {
  const analise = await getAnalysis(7);
  return analise.headline;
}
