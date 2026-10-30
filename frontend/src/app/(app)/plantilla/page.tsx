"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { PlayerFormDialog } from "@/components/player-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/api/types";
import { POSITION_LABEL, STATUS_LABEL } from "@/lib/labels";
import { playersQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";

export default function PlantillaPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "head_coach";
  const { data: players, failed: loadFailed, reload } = useApiQuery(playersQuery.key, playersQuery.fetch);
  const [editing, setEditing] = useState<Player | "new" | null>(null);

  function handleSaved() {
    setEditing(null);
    reload();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Plantilla</h1>
        {canEdit ? (
          <Button size="lg" onClick={() => setEditing("new")}>
            Añadir jugador
          </Button>
        ) : null}
      </header>

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo cargar la plantilla</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {players === null && !loadFailed ? (
        <p className="text-muted-foreground">Cargando plantilla…</p>
      ) : null}
      {players?.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay jugadores</p>
      ) : null}

      <ul className="space-y-3">
        {players?.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-4 rounded-xl border bg-card p-4"
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {player.dorsal}
            </span>
            <div className="flex-1">
              <p className="text-lg font-medium">{player.name}</p>
              <p className="text-muted-foreground">{POSITION_LABEL[player.position]}</p>
            </div>
            <Badge variant={player.status === "injured" ? "destructive" : "secondary"}>
              {STATUS_LABEL[player.status]}
            </Badge>
            {canEdit ? (
              <Button
                variant="outline"
                aria-label={`Editar ${player.name}`}
                onClick={() => setEditing(player)}
              >
                Editar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <PlayerFormDialog
        player={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
