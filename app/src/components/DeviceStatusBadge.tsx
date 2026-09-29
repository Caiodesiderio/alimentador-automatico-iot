import type { DeviceStatus } from "@/lib/types";

const MAP: Record<DeviceStatus, { label: string; dot: string; wrap: string }> = {
  online: { label: "Online", dot: "bg-success", wrap: "bg-success-soft text-success" },
  connecting: { label: "Conectando", dot: "bg-warning", wrap: "bg-warning-soft text-warning-foreground" },
  offline: { label: "Offline", dot: "bg-danger", wrap: "bg-danger-soft text-danger" },
};

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const s = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.wrap}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${s.dot} ${status === "connecting" ? "animate-pulse" : ""}`}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
