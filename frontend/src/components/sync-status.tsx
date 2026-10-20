import { Button } from "@/components/ui/button";
import type { LogStatus } from "@/lib/match/use-match-log";

interface SyncStatusProps {
  status: LogStatus;
  pending: number;
  /** Qué falló, si se conoce. */
  detail?: string | null;
  onRetry: () => void;
  onReload: () => void;
}

/** Estado del envío al servidor: lo anotado nunca se pierde, aquí se ve si ya llegó. */
export function SyncStatus({ status, pending, detail, onRetry, onReload }: SyncStatusProps) {
  return (
    <div className="flex items-center gap-3 text-base">
      {status === "synced" ? <span className="text-muted-foreground">Sincronizado</span> : null}
      {status === "pending" ? <span>{`Enviando… (${pending})`}</span> : null}
      {status === "offline" ? (
        <>
          <span role="status" className="font-medium text-destructive">
            {`Sin conexión · ${pending} sin enviar`}
          </span>
          <Button variant="outline" onClick={onRetry}>
            Reintentar envío
          </Button>
        </>
      ) : null}
      {status === "conflict" ? (
        <>
          <span role="status" className="font-medium text-destructive">
            {detail ?? "Conflicto con otro dispositivo"}
          </span>
          <Button variant="outline" onClick={onReload}>
            Recargar partido
          </Button>
        </>
      ) : null}
    </div>
  );
}
