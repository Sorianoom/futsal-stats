"use client";

import { useEffect, useState } from "react";

import { AttendanceProposals, proposalKey } from "@/components/attendance-proposals";
import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { getAttendance, listMovements, saveAttendance } from "@/lib/api/points";
import type {
  AttendanceRecord,
  AttendanceSaved,
  AttendanceStatus,
  Player,
  TeamSession,
} from "@/lib/api/types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import { weekStartOf } from "@/lib/weeks";

const MAX_MINUTES_LATE = 300;
const SAVE_ERROR = "No se pudo guardar la lista. Inténtalo de nuevo.";
const LOAD_ERROR = "No se pudo cargar la lista de la sesión.";

interface Row {
  status: AttendanceStatus;
  notified: boolean;
  minutes: string;
}

type Edits = Readonly<Record<string, Partial<Row>>>;

const DEFAULT_ROW: Row = { status: "attended", notified: false, minutes: "" };

function savedRow(record: AttendanceRecord | undefined): Row {
  if (!record) return DEFAULT_ROW;
  return {
    status: record.status,
    notified: record.notified,
    minutes: record.minutes_late > 0 ? String(record.minutes_late) : "",
  };
}

function minutesOf(row: Row): number {
  const parsed = Math.trunc(Number(row.minutes) || 0);
  return Math.min(MAX_MINUTES_LATE, Math.max(0, parsed));
}

/** Claves de las faltas de esta sesión que ya constan como movimientos. */
async function registeredKeys(session: TeamSession): Promise<ReadonlySet<string> | null> {
  try {
    const movements = await listMovements(weekStartOf(session.held_on));
    return new Set(
      movements
        .filter((m) => m.session_id === session.id && m.infraction_code)
        .map((m) => proposalKey(m.player_id, m.infraction_code as string)),
    );
  } catch {
    return null;
  }
}

interface FormProps {
  session: TeamSession;
  players: Player[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
}

interface Saved {
  result: AttendanceSaved;
  registered: ReadonlySet<string> | null;
}

function AttendanceForm({ session, players, busy, setBusy, onClose }: FormProps) {
  const [existing, setExisting] = useState<AttendanceRecord[] | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  // Solo depende de la sesión: recargar la plantilla no debe pisar lo que se está editando.
  useEffect(() => {
    let active = true;
    getAttendance(session.id)
      .then((records) => {
        if (active) setExisting(records);
      })
      .catch(() => {
        if (active) setError(LOAD_ERROR);
      });
    return () => {
      active = false;
    };
  }, [session.id]);

  const rowOf = (player: Player): Row => ({
    ...savedRow(existing?.find((record) => record.player_id === player.id)),
    ...edits[player.id],
  });

  function update(playerId: string, changes: Partial<Row>) {
    setEdits({ ...edits, [playerId]: { ...edits[playerId], ...changes } });
  }

  async function save() {
    if (existing === null || busy) return;
    const missingMinutes = players.find((p) => rowOf(p).status === "late" && minutesOf(rowOf(p)) === 0);
    if (missingMinutes) {
      setError(`Indica los minutos de retraso de ${missingMinutes.name}`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const records: AttendanceRecord[] = players.map((player) => {
        const row = rowOf(player);
        return {
          player_id: player.id,
          status: row.status,
          notified: row.notified,
          minutes_late: row.status === "late" ? minutesOf(row) : 0,
        };
      });
      const result = await saveAttendance(session.id, records);
      setSaved({ result, registered: await registeredKeys(session) });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    const names = new Map(players.map((player) => [player.id, player.name]));
    return (
      <div className="space-y-4">
        <p role="status" className="text-lg font-semibold">
          Lista guardada
        </p>
        <AttendanceProposals
          proposals={saved.result.proposals}
          session={session}
          nameOf={(playerId) => names.get(playerId) ?? "Jugador desconocido"}
          registered={saved.registered}
          onSavingChange={setBusy}
        />
        <DialogFooter>
          <Button disabled={busy} onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {existing === null && !error ? <p className="text-muted-foreground">Cargando lista…</p> : null}
      {existing ? (
        <ul className="space-y-2">
          {players.map((player) => {
            const row = rowOf(player);
            return (
              <li key={player.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="w-40 shrink-0 text-lg font-medium">{player.name}</span>
                <select
                  aria-label={`Estado de ${player.name}`}
                  className={`${SELECT_CLASS} max-w-52`}
                  value={row.status}
                  onChange={(e) => update(player.id, { status: e.target.value as AttendanceStatus })}
                >
                  {Object.entries(ATTENDANCE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {row.status === "late" ? (
                  <Input
                    aria-label={`Minutos de retraso de ${player.name}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_MINUTES_LATE}
                    placeholder="min"
                    className="h-12 w-24"
                    value={row.minutes}
                    onChange={(e) => update(player.id, { minutes: e.target.value })}
                  />
                ) : null}
                <label className="flex min-h-12 items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Avisó ${player.name}`}
                    className="size-6"
                    checked={row.notified}
                    onChange={(e) => update(player.id, { notified: e.target.checked })}
                  />
                  Avisó
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={busy || existing === null} onClick={() => void save()}>
          Guardar lista
        </Button>
      </DialogFooter>
    </div>
  );
}

interface AttendanceDialogProps {
  session: TeamSession | null;
  players: Player[];
  onClose: () => void;
}

export function AttendanceDialog({ session, players, onClose }: AttendanceDialogProps) {
  return (
    <BusyDialog
      open={session !== null}
      title="Pasar lista"
      className="sm:max-w-2xl"
      onClose={onClose}
    >
      {({ busy, setBusy }) =>
        session ? (
          <AttendanceForm
            key={session.id}
            session={session}
            players={players}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
          />
        ) : null
      }
    </BusyDialog>
  );
}
