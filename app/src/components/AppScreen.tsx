import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppScreen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
