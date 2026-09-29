import { useEffect, useState } from "react";
import { Check, Loader2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedNow } from "@/lib/api";

const PRESETS = [50, 100, 150];

type Phase = "select" | "loading" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceOnline: boolean;
  onFed?: (grams: number) => void;
}

export function FeedDialog({ open, onOpenChange, deviceOnline, onFed }: Props) {
  const [phase, setPhase] = useState<Phase>("select");
  const [preset, setPreset] = useState<number | "custom">(100);
  const [custom, setCustom] = useState("120");
  const [released, setReleased] = useState(0);
  const [error, setError] = useState("");

  const grams = preset === "custom" ? Number(custom) : preset;
  const validGrams = Number.isFinite(grams) && grams >= 10 && grams <= 300;

  useEffect(() => {
    if (open) {
      setPhase("select");
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(() => onOpenChange(false), 1800);
    return () => clearTimeout(t);
  }, [phase, onOpenChange]);

  async function handleConfirm() {
    setPhase("loading");
    try {
      const result = await feedNow(grams);
      setReleased(result.grams);
      setPhase("success");
      onFed?.(result.grams);
    } catch (e) {
      // A mensagem vem pronta da camada de dados: "o dosador travou",
      // "o alimentador não respondeu", etc. Dizer qual é o problema vale
      // mais do que um texto genérico.
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível liberar a ração. Verifique o dispositivo.",
      );
      setPhase("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-3xl">
        {phase === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="animate-pop-check flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
              <Check className="h-10 w-10 text-success" aria-hidden />
            </div>
            <p className="text-2xl font-bold text-foreground">{released} g liberados</p>
            <p className="text-sm text-muted-foreground">Pesados na tigela. Bom apetite!</p>
          </div>
        ) : phase === "loading" ? (
          <div
            className="flex flex-col items-center gap-3 py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
            <p className="text-base font-semibold text-foreground">Liberando ração...</p>
            <p className="text-sm text-muted-foreground">
              O motor gira em blocos e pesa a tigela entre eles — pode levar até um minuto.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Alimentar agora</DialogTitle>
              <DialogDescription>Escolha a porção que será liberada.</DialogDescription>
            </DialogHeader>

            {!deviceOnline && (
              <div className="flex items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm text-danger">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Dispositivo offline. Conecte o alimentador à rede Wi-Fi para liberar ração.
                </span>
              </div>
            )}

            {phase === "error" && (
              <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>
            )}

            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Porção">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  aria-pressed={preset === p}
                  className={`tap-feedback min-h-[52px] rounded-2xl border text-base font-bold ${
                    preset === p
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-surface text-foreground"
                  }`}
                >
                  {p} g
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPreset("custom")}
              aria-pressed={preset === "custom"}
              className={`tap-feedback min-h-[48px] w-full rounded-2xl border text-sm font-semibold ${
                preset === "custom"
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              Personalizado
            </button>

            {preset === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="porcao-custom">Gramas (10 a 300)</Label>
                <Input
                  id="porcao-custom"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={300}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="h-12 rounded-2xl text-base"
                />
                {!validGrams && (
                  <p className="text-xs text-danger">Informe um valor entre 10 e 300 g.</p>
                )}
              </div>
            )}

            <Button
              size="lg"
              disabled={!deviceOnline || !validGrams}
              onClick={handleConfirm}
              className="tap-feedback h-14 w-full rounded-2xl text-base font-bold"
            >
              {deviceOnline ? `Liberar ${validGrams ? grams : "—"} g` : "Dispositivo offline"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
