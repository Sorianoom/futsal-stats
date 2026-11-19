"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { InvitationDialog } from "@/components/invitation-dialog";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerFormDialog } from "@/components/player-form-dialog";
import { PlayerPhotoDialog } from "@/components/player-photo-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/api/types";
import { POSITION_LABEL, STATUS_LABEL } from "@/lib/labels";
import { playersQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type RosterFilter = "all" | "field" | "goalkeeper" | "injured";

const FILTERS: { id: RosterFilter; label: string; matches: (player: Player) => boolean }[] = [
  { id: "all", label: "Todos", matches: () => true },
  { id: "field", label: "Campo", matches: (player) => player.position === "field" },
  { id: "goalkeeper", label: "Porteros", matches: (player) => player.position === "goalkeeper" },
  { id: "injured", label: "Lesionados", matches: (player) => player.status === "injured" },
];

function RosterAvatar({ player }: { player: Player }) {
  return (
    <PlayerAvatar
      name={player.name}
      dorsal={player.dorsal}
      photoUrl={player.photo_url}
      className={cn(
        "size-12 text-xl",
        player.position === "goalkeeper" ? "bg-cta text-cta-foreground" : "bg-secondary text-primary",
      )}
    />
  );
}

export default function PlantillaPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "head_coach";
  const { data: players, failed: loadFailed, reload } = useApiQuery(playersQuery.key, playersQuery.fetch);
  const [editing, setEditing] = useState<Player | "new" | null>(null);
  const [inviting, setInviting] = useState<Player | null>(null);
  const [photoOf, setPhotoOf] = useState<Player | null>(null);
  const [filter, setFilter] = useState<RosterFilter>("all");

  function handleSaved() {
    setEditing(null);
    reload();
  }

  const activeFilter = FILTERS.find((candidate) => candidate.id === filter) ?? FILTERS[0];
  const visible = players?.filter(activeFilter.matches) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          {players ? (
            <p className="text-sm font-bold text-muted-foreground">
              {players.length === 1 ? "1 jugador" : `${players.length} jugadores`}
            </p>
          ) : null}
          <h1 className="text-4xl font-extrabold tracking-tight">Plantilla</h1>
        </div>
        {canEdit ? (
          <Button variant="cta" size="lg" className="rounded-2xl" onClick={() => setEditing("new")}>
            Añadir jugador
          </Button>
        ) : null}
      </header>

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-2xl border p-4">
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

      {players && players.length > 0 ? (
        <div role="group" aria-label="Filtrar plantilla" className="flex flex-wrap gap-2">
          {FILTERS.map(({ id, label, matches }) => {
            const selected = id === filter;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-5 text-[15px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card text-foreground hover:bg-muted",
                )}
              >
                {label} <span className="font-semibold opacity-80">{players.filter(matches).length}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {players && players.length > 0 && visible.length === 0 ? (
        <p className="text-muted-foreground">No hay jugadores con este filtro</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {visible.map((player) => (
          <li
            key={player.id}
            className="flex min-h-36 flex-col justify-between gap-3 rounded-3xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Foto de ${player.name}`}
                  onClick={() => setPhotoOf(player)}
                  className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <RosterAvatar player={player} />
                </button>
              ) : (
                <RosterAvatar player={player} />
              )}
              <Badge
                variant={player.status === "injured" ? "destructive" : "secondary"}
                className={cn(
                  "h-6 px-3 text-xs font-bold",
                  player.status !== "injured" && "bg-success text-success-foreground",
                )}
              >
                {STATUS_LABEL[player.status]}
              </Badge>
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold">{player.name}</p>
              {player.alias ? <p className="truncate text-base font-bold text-primary">{player.alias}</p> : null}
              <p className="text-sm font-semibold text-muted-foreground">{POSITION_LABEL[player.position]}</p>
            </div>
            {canEdit ? (
              <div className="flex items-center justify-between gap-2">
                {player.has_account ? (
                  <span className="text-sm font-bold text-muted-foreground">Tiene cuenta</span>
                ) : !player.is_active ? (
                  <span className="text-sm font-bold text-muted-foreground">De baja</span>
                ) : (
                  <Button
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    aria-label={`Invitar a ${player.name}`}
                    onClick={() => setInviting(player)}
                  >
                    Invitar
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="shrink-0 rounded-xl"
                  aria-label={`Editar ${player.name}`}
                  onClick={() => setEditing(player)}
                >
                  Editar
                </Button>
              </div>
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
      <PlayerPhotoDialog player={photoOf} onClose={() => setPhotoOf(null)} onChanged={reload} />
      <InvitationDialog player={inviting} onClose={() => setInviting(null)} onRosterStale={reload} />
    </div>
  );
}
