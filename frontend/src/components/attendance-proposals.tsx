"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { registerInfraction } from "@/lib/api/points";
import type { AttendanceProposal, TeamSession } from "@/lib/api/types";
import { sanctionText } from "@/lib/labels";

const REGISTER_ERROR = "No se pudo registrar la falta. Inténtalo de nuevo.";
const UNCERTAIN_ERROR =
  "Sin conexión. Puede que la falta se haya registrado. Revisa Puntos antes de volver a intentarlo.";
const CHECK_FAILED =
  "No se pudo comprobar qué faltas ya estaban registradas. Revísalo en Puntos antes de aceptar.";

type Phase = "pending" | "saving" | "done" | "dismissed";

export function proposalKey(playerId: string, infractionCode: string): string {
  return `${playerId}|${infractionCode}`;
}

interface ProposalItemProps {
  proposal: AttendanceProposal;
  playerName: string;
  session: TeamSession;
  alreadyRegistered: boolean;
  locked: boolean;
  onSavingChange: (saving: boolean) => void;
}

function ProposalItem({
  proposal,
  playerName,
  session,
  alreadyRegistered,
  locked,
  onSavingChange,
}: ProposalItemProps) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPhase("saving");
    setError(null);
    onSavingChange(true);
    try {
      await registerInfraction({
        player_id: proposal.player_id,
        infraction_code: proposal.infraction_code,
        occurred_on: session.held_on,
        session_id: session.id,
        in_match: false,
      });
      setPhase("done");
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === "network" ? UNCERTAIN_ERROR : REGISTER_ERROR);
      setPhase("pending");
    } finally {
      onSavingChange(false);
    }
  }

  if (phase === "dismissed") return null;
  const disabled = phase === "saving" || locked;

  return (
    <li className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-lg font-medium">{playerName}</p>
      <p>
        {proposal.description} ({proposal.points})
      </p>
      {proposal.sanction ? <p>Sanción propuesta: {sanctionText(proposal.sanction)}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {alreadyRegistered ? <p className="font-medium">Ya registrada</p> : null}
      {!alreadyRegistered && phase === "done" ? <p className="font-medium">Registrada</p> : null}
      {!alreadyRegistered && phase !== "done" ? (
        <div className="flex gap-4">
          <Button
            aria-label={`Aceptar falta de ${playerName}`}
            disabled={disabled}
            onClick={() => void accept()}
          >
            Aceptar
          </Button>
          <Button
            variant="outline"
            aria-label={`Descartar falta de ${playerName}`}
            disabled={disabled}
            onClick={() => setPhase("dismissed")}
          >
            Descartar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

interface AttendanceProposalsProps {
  proposals: AttendanceProposal[];
  session: TeamSession;
  nameOf: (playerId: string) => string;
  /** Claves de las faltas ya registradas en la sesión; null si no se pudo comprobar. */
  registered: ReadonlySet<string> | null;
  onSavingChange: (saving: boolean) => void;
}

export function AttendanceProposals({
  proposals,
  session,
  nameOf,
  registered,
  onSavingChange,
}: AttendanceProposalsProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (proposals.length === 0) {
    return <p className="text-muted-foreground">No hay faltas que proponer.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="font-medium">Faltas propuestas (las confirmas tú)</p>
      {registered === null ? (
        <p role="alert" className="text-destructive">
          {CHECK_FAILED}
        </p>
      ) : null}
      <ul aria-label="Faltas propuestas" className="space-y-3">
        {proposals.map((proposal) => {
          const key = proposalKey(proposal.player_id, proposal.infraction_code);
          return (
            <ProposalItem
              key={key}
              proposal={proposal}
              playerName={nameOf(proposal.player_id)}
              session={session}
              alreadyRegistered={registered?.has(key) ?? false}
              locked={savingKey !== null && savingKey !== key}
              onSavingChange={(saving) => {
                setSavingKey(saving ? key : null);
                onSavingChange(saving);
              }}
            />
          );
        })}
      </ul>
    </div>
  );
}
