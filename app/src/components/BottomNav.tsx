import { Link } from "@tanstack/react-router";
import { BarChart3, CalendarClock, Home, Video } from "lucide-react";

const tabs = [
  { to: "/", label: "Início", icon: Home },
  { to: "/agenda", label: "Agenda", icon: CalendarClock },
  { to: "/camera", label: "Câmera", icon: Video },
  { to: "/analise", label: "Análise", icon: BarChart3 },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              aria-label={label}
              activeOptions={{ exact: to === "/" }}
              className="tap-feedback flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="h-[22px] w-[22px]" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
