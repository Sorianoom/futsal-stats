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
      {status === "stalled" ? (
        <>
          <span role="status" className="font-medium text-destructive">
            {detail ?? "El servidor rechazó el envío"}
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

interface RejectionNoticeProps {
  /** Qué no se guardó, ya descrito: «Gol de Ana (05:00): jugador desconocido». */
  items: readonly string[];
  onDismiss: () => void;
}

/** Aviso de lo que el servidor rechazó: se quitó del registro, pero se puede seguir anotando. */
export function RejectionNotice({ items, onDismiss }: RejectionNoticeProps) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive p-3">
      <div>
        <p className="font-medium text-destructive">No se guardó (se ha quitado del partido):</p>
        <ul className="list-disc pl-5">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
      <Button variant="outline" onClick={onDismiss}>
        Entendido
      </Button>
    </div>
  );
}
