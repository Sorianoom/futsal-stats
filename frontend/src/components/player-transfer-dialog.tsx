"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { transferPlayer } from "@/lib/api/matches";
import type { Player } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface PlayerTransferDialogProps {
  open: boolean;
  matchId: string;
  players: Player[];
  /** Jugadores con algo anotado en el partido: los únicos que pueden ceder sus datos. */
  involved: ReadonlySet<string>;
  /** Anotaciones aún sin enviar: hay que esperar a que lleguen al servidor. */
  pending: number;
  /** Hecho: recibe el jugador que se quedó con los datos. */
  onDone: (toPlayerId: string) => void;
  onClose: () => void;
}

function PlayerChoice({
  label,
  players,
  value,
  onChange,
}: {
  label: string;
  players: Player[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-bold">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            role="radio"
            aria-checked={value === player.id}
            onClick={() => onChange(player.id)}
            className={cn(
              "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              value === player.id ? "border-primary bg-primary/10 font-bold" : "",
            )}
          >
            <span className="tabular-nums text-muted-foreground">{player.dorsal}</span>
            <span className="min-w-0 truncate">{player.name}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const ERRORS: Record<string, string> = {
  player_in_match: "Ese jugador ya tiene datos en el partido: elige a uno que no haya jugado.",
  nothing_to_transfer: "El primer jugador no tiene nada anotado en este partido.",
  same_player: "Elige dos jugadores distintos.",
};

function Body({ matchId, players, involved, pending, onDone, onClose }: Omit<PlayerTransferDialogProps, "open">) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sources = players.filter((p) => involved.has(p.id));
  const targets = players.filter((p) => !involved.has(p.id));
  const names = new Map(players.map((p) => [p.id, p.name]));

  async function confirm() {
    if (!from || !to) return;
    setBusy(true);
    setError(null);
    try {
      await transferPlayer(matchId, from, to);
      onDone(to);
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : null;
      setError((code && ERRORS[code]) ?? "No se pudo traspasar. Comprueba la conexión e inténtalo de nuevo.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Para cuando se apuntó a un jugador en lugar de otro: todo lo del primero en este partido (minutos, goles,
        faltas, tarjetas…) pasa al segundo, también si está en pista ahora.
      </p>
      {pending > 0 ? (
        <p role="alert" className="rounded-xl border border-destructive/40 p-3 font-semibold text-destructive">
          {`Hay ${pending} anotaciones sin enviar. Espera a que se envíen (necesita conexión) y vuelve a abrir esto.`}
        </p>
      ) : null}
      <PlayerChoice label="De (el que se apuntó por error)" players={sources} value={from} onChange={setFrom} />
      <PlayerChoice label="A (el que jugó de verdad)" players={targets} value={to} onChange={setTo} />
      {from && to ? (
        <p className="rounded-xl bg-muted p-3 font-semibold">{`Todo lo de ${names.get(from)} pasará a ${names.get(to)}.`}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="lg" disabled={!from || !to || busy || pending > 0} onClick={() => void confirm()}>
          {busy ? "Traspasando…" : "Traspasar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Traspasa lo anotado de un jugador a otro en este partido. */
export function PlayerTransferDialog({ open, onClose, ...rest }: PlayerTransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Traspasar estadísticas</DialogTitle>
        </DialogHeader>
        {open ? <Body onClose={onClose} {...rest} /> : null}
      </DialogContent>
    </Dialog>
  );
}
