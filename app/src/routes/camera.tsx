import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Camera, Maximize2, RotateCw, UtensilsCrossed, WifiOff } from "lucide-react";

import { AppScreen } from "@/components/AppScreen";
import { FeedDialog } from "@/components/FeedDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCameraStream, getDevice } from "@/lib/api";

export const Route = createFileRoute("/camera")({
  head: () => ({
    meta: [
      { title: "Câmera ao vivo — PetFeeder" },
      {
        name: "description",
        content: "Assista ao vivo pela ESP32-CAM e libere ração enquanto observa seu pet.",
      },
      { property: "og:title", content: "Câmera ao vivo — PetFeeder" },
      {
        property: "og:description",
        content: "Vídeo ao vivo do alimentador com captura de foto e alimentação instantânea.",
      },
    ],
  }),
  component: CameraScreen,
});

function CameraScreen() {
  const [feedOpen, setFeedOpen] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const device = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const stream = useQuery({ queryKey: ["cameraStream"], queryFn: getCameraStream });

  const online = device.data?.status === "online";
  const failed = stream.isError || streamFailed;

  function retry() {
    setStreamFailed(false);
    stream.refetch();
  }

  function toggleFullscreen() {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  return (
    <AppScreen>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Câmera</h1>
      <p className="mt-1 text-sm text-muted-foreground">Transmissão da ESP32-CAM na rede local.</p>

      <div
        ref={boxRef}
        className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted shadow-card"
      >
        {stream.isPending && !failed && (
          <div className="h-full w-full" role="status" aria-label="Conectando à câmera">
            <Skeleton className="h-full w-full rounded-2xl" />
            <span className="absolute inset-0 grid place-items-center text-sm font-medium text-muted-foreground">
              Conectando à câmera...
            </span>
          </div>
        )}

        {failed && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <WifiOff className="h-10 w-10 text-danger" aria-hidden />
            <p className="text-base font-bold text-foreground">Sem conexão com a câmera</p>
            <p className="text-sm text-muted-foreground">
              O celular precisa estar na mesma rede Wi-Fi local da ESP32-CAM.
            </p>
            <Button
              onClick={retry}
              variant="outline"
              className="tap-feedback mt-1 h-11 rounded-2xl font-bold"
            >
              <RotateCw className="mr-2 h-4 w-4" aria-hidden />
              Tentar novamente
            </Button>
          </div>
        )}

        {!stream.isPending && !failed && stream.data && (
          <>
            <img
              src={stream.data.streamUrl}
              alt="Transmissão ao vivo do alimentador"
              className="h-full w-full object-cover"
              onError={() => setStreamFailed(true)}
            />
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold text-danger-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger-foreground" aria-hidden />
              AO VIVO
            </div>
            <div className="absolute right-3 top-3 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-semibold text-background">
              Sinal: {stream.data.signalQuality}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={failed || stream.isPending}
          onClick={() => {
            setPhotoTaken(true);
            setTimeout(() => setPhotoTaken(false), 1600);
          }}
          className="tap-feedback h-12 rounded-2xl font-semibold"
        >
          <Camera className="mr-2 h-4 w-4" aria-hidden />
          {photoTaken ? "Foto salva" : "Capturar foto"}
        </Button>
        <Button
          variant="outline"
          disabled={failed || stream.isPending}
          onClick={toggleFullscreen}
          className="tap-feedback h-12 rounded-2xl font-semibold"
        >
          <Maximize2 className="mr-2 h-4 w-4" aria-hidden />
          Tela cheia
        </Button>
      </div>

      <Button
        size="lg"
        disabled={device.isPending || !online}
        onClick={() => setFeedOpen(true)}
        className="tap-feedback mt-3 h-16 w-full rounded-2xl text-lg font-bold"
      >
        <UtensilsCrossed className="mr-2 h-5 w-5" aria-hidden />
        Alimentar agora
      </Button>
      {!device.isPending && !online && (
        <p className="mt-2 text-center text-xs text-danger">
          Dispositivo offline — não é possível liberar ração agora.
        </p>
      )}

      <FeedDialog open={feedOpen} onOpenChange={setFeedOpen} deviceOnline={!!online} />
    </AppScreen>
  );
}
