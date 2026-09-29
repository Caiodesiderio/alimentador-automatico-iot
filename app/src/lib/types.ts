export type DeviceStatus = "online" | "offline" | "connecting";

export interface Device {
  id: string;
  name: string;
  status: DeviceStatus;
  firmwareVersion: string;
  lastSeen: string;
  streamUrl: string;
}

export interface Pet {
  id: string;
  name: string;
  avatarUrl: string;
  weightKg: number;
  dailyTargetGrams: number;
}

export interface Tutor {
  id: string;
  name: string;
}

export interface FoodLevel {
  percentage: number;
  currentGrams: number;
  capacityGrams: number;
  readAt: string;
  /**
   * true = valor ESTIMADO por saldo, não medido.
   * A célula de carga está no comedouro, não no reservatório: o nível do
   * tanque é calculado descontando as porções liberadas desde o último
   * reabastecimento registrado. A tela precisa deixar isso visível.
   */
  isEstimate?: boolean;
}

/** Peso realmente medido pela célula de carga, na tigela. */
export interface BowlWeight {
  grams: number;
  readAt: string;
}

export interface FeedingEvent {
  id: string;
  timestamp: string;
  grams: number;
  trigger: "scheduled" | "manual";
  consumedGrams: number;
  consumed: boolean;
}

export type ScheduleFrequency = "daily" | "weekly" | "once";

export interface Schedule {
  id: string;
  label: string;
  time: string;
  frequency: ScheduleFrequency;
  weekdays: number[];
  date: string | null;
  portionGrams: number;
  enabled: boolean;
}

export interface Cluster {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  avgPortionGrams: number;
  eventCount: number;
  /** minutos desde a meia-noite dos registros do grupo, para a distribuição */
  timesInMinutes: number[];
}

export interface Anomaly {
  id: string;
  date: string;
  type: string;
  description: string;
  zScore: number;
  severity: "low" | "medium" | "high";
}

export interface DailyConsumption {
  date: string;
  grams: number;
  anomaly: boolean;
}

export interface AnalysisSummary {
  avgDailyGrams: number;
  regularityPercent: number;
  anomalyCount: number;
}

export type AnalysisPeriod = 7 | 30 | 90;

export interface Analysis {
  period: AnalysisPeriod;
  /**
   * De onde vieram os dados desta análise. Enquanto for "synthetic", a aba
   * Análise mostra o aviso "Dados simulados — em validação técnica".
   * O aviso passa a ser consequência do dado, e não um texto fixo na tela.
   */
  datasetKind?: "synthetic" | "real" | "mixed";
  /** Quando o pipeline Python rodou. null = ainda não rodou nenhuma vez. */
  ranAt?: string | null;
  consumption: DailyConsumption[];
  clusters: Cluster[];
  anomalies: Anomaly[];
  summary: AnalysisSummary;
  headline: string;
}

export interface HomeStats {
  nextMealTime: string | null;
  lastMeal: { time: string; grams: number } | null;
  todayGrams: number;
}

export interface FeedResult {
  grams: number;
  event: FeedingEvent;
}

export interface CameraStream {
  streamUrl: string;
  signalQuality: "boa" | "média" | "fraca";
  /**
   * "live"     = MJPEG direto da ESP32-CAM (só funciona na rede local e
   *              com o app servido em HTTP);
   * "snapshot" = foto periódica no Supabase Storage (funciona em HTTPS,
   *              de qualquer lugar).
   */
  mode?: "live" | "snapshot";
  /** URL pública do último snapshot, quando existir. */
  snapshotUrl?: string | null;
}
