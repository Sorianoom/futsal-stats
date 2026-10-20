"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { LoggedEvent, Match } from "@/lib/api/match-types";
import { listMatches } from "@/lib/api/matches";
import {
  createExclusion,
  listExclusions,
  listInfractions,
  listMovements,
  registerInfraction,
} from "@/lib/api/points";
import type { Exclusion, Infraction } from "@/lib/api/types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { SANCTION_LABEL, sanctionText } from "@/lib/labels";
import { formatShortDay, shiftWeek, weekStartOf } from "@/lib/weeks";

/** Roja en un partido que perjudique al equipo (régimen interno). */
const RED_INFRACTION = "o";
const CONFLICT = 409;
const CLIENT_ERROR_FROM = 400;
const SERVER_ERROR_FROM = 500;
const REGISTER_ERROR = "No se pudo registrar la falta. Inténtalo de nuevo.";
const UNCERTAIN_ERROR =
  "Sin conexión. Puede que la falta se haya registrado. Revisa Puntos antes de volver a intentarlo.";
const SERVER_UNCERTAIN_ERROR =
  "El servidor no respondió bien. Puede que la falta se haya registrado. Revisa Puntos antes de volver a intentarlo.";
const CHECK_ERROR = "No se pudo comprobar si la falta consta. Inténtalo de nuevo.";
const EXCLUSION_ERROR = "No se pudo confirmar la exclusión. Inténtalo de nuevo.";

interface MatchKey {
  id: string;
  heldOn: string;
  sessionId: string;
}

interface Reference {
  /** null si no se pudo cargar. */
  infraction: Infraction | null;
  /** Jugadores con la falta «o» ya registrada en este partido; null si no se pudo comprobar. */
  alreadyRegistered: ReadonlySet<string> | null;
  /** Partidos posteriores a este; null si no se pudieron cargar. */
  upcoming: readonly Match[] | null;
  exclusions: readonly Exclusion[];
}

/** La falta puede aplicarse a la semana siguiente, así que se miran las dos. */
async function loadRegistered(match: MatchKey): Promise<ReadonlySet<string> | null> {
  const week = weekStartOf(match.heldOn);
  try {
    const weeks = await Promise.all([listMovements(week), listMovements(shiftWeek(week, 1))]);
    return new Set(
      weeks
        .flat()
        .filter((m) => m.infraction_code === RED_INFRACTION && m.session_id === match.sessionId)
        .map((m) => m.player_id),
    );
  } catch {
    return null;
  }
}

async function loadUpcoming(match: MatchKey): Promise<readonly Match[] | null> {
  try {
    const all = await listMatches();
    return all
      .filter((m) => m.id !== match.id && m.held_on > match.heldOn)
      .sort((a, b) => a.held_on.localeCompare(b.held_on));
  } catch {
    return null;
  }
}

async function loadReference(match: MatchKey): Promise<Reference> {
  const [infraction, alreadyRegistered, upcoming] = await Promise.all([
    listInfractions().then(
      (list) => list.find((i) => i.code === RED_INFRACTION) ?? null,
      () => null,
    ),
    loadRegistered(match),
    loadUpcoming(match),
  ]);
  const found = await Promise.all(
    (upcoming ?? []).map((m) => listExclusions(m.id).catch(() => [] as Exclusion[])),
  );
  return { infraction, alreadyRegistered, upcoming, exclusions: found.flat() };
}

function isClearRejection(failure: unknown): boolean {
  if (!(failure instanceof ApiError) || failure.code === "network") return false;
  return failure.status >= CLIENT_ERROR_FROM && failure.status < SERVER_ERROR_FROM;
}

interface ItemProps {
  match: Match;
  playerId: string;
  name: string;
  infraction: Infraction;
  alreadyRegistered: boolean;
  upcoming: readonly Match[] | null;
  exclusions: readonly Exclusion[];
  /** Vuelve a mirar en el servidor si la falta consta; null si no se pudo comprobar. */
  recheck: (playerId: string) => Promise<boolean | null>;
}

function RedCardItem({
  match,
  playerId,
  name,
  infraction,
  alreadyRegistered,
  upcoming,
  exclusions,
  recheck,
}: ItemProps) {
  const { sanction } = infraction;
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<readonly Match[]>(() =>
    (upcoming ?? []).filter((m) =>
      exclusions.some((x) => x.match_id === m.id && x.player_id === playerId),
    ),
  );
  const remaining = (upcoming ?? []).filter((m) => !confirmed.some((c) => c.id === m.id));
  const [chosen, setChosen] = useState(() => remaining[0]?.id ?? "");
  const [chooseError, setChooseError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exclusionError, setExclusionError] = useState<string | null>(null);
  // Cerrojos síncronos: el estado de React llega tarde para frenar un doble toque.
  const registerLock = useRef(false);
  const confirmLock = useRef(false);

  async function register() {
    if (registerLock.current) return;
    registerLock.current = true;
    setRegistering(true);
    setRegisterError(null);
    try {
      await registerInfraction({
        player_id: playerId,
        infraction_code: RED_INFRACTION,
        occurred_on: match.held_on,
        in_match: true,
        session_id: match.session_id,
      });
      setRegistered(true);
    } catch (failure) {
      if (isClearRejection(failure)) {
        setRegisterError(REGISTER_ERROR);
      } else {
        // Pudo llegar al servidor: no se deja registrar a ciegas otra vez (duplicaría puntos).
        setUncertain(true);
        const offline = failure instanceof ApiError && failure.code === "network";
        setRegisterError(offline ? UNCERTAIN_ERROR : SERVER_UNCERTAIN_ERROR);
      }
    } finally {
      registerLock.current = false;
      setRegistering(false);
    }
  }

  async function check() {
    const found = await recheck(playerId);
    if (found === null) {
      setRegisterError(CHECK_ERROR);
      return;
    }
    // Si consta, `alreadyRegistered` lo mostrará; si no, ya se puede volver a intentar.
    setUncertain(false);
    setRegisterError(null);
  }

  async function confirmExclusion() {
    if (!sanction || confirmLock.current) return;
    const target = remaining.find((m) => m.id === chosen);
    if (!target) {
      setChooseError("Elige el partido");
      return;
    }
    confirmLock.current = true;
    setChooseError(null);
    setExclusionError(null);
    setConfirming(true);
    try {
      await createExclusion(playerId, target.id, sanction.kind);
      markConfirmed(target);
    } catch (failure) {
      // Que ya existiera es el resultado buscado.
      if (failure instanceof ApiError && failure.status === CONFLICT) markConfirmed(target);
      else setExclusionError(EXCLUSION_ERROR);
    } finally {
      confirmLock.current = false;
      setConfirming(false);
    }
  }

  function markConfirmed(target: Match) {
    setConfirmed((list) => [...list, target]);
    setChosen(remaining.find((m) => m.id !== target.id)?.id ?? "");
  }

  const complete = sanction !== null && confirmed.length >= sanction.max_matches;

  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-lg font-medium">{`Roja de ${name}`}</p>
      <p>{`${infraction.description} (${infraction.points})`}</p>

      {alreadyRegistered ? <p className="font-medium">Falta «o» ya registrada</p> : null}
      {registered && !alreadyRegistered ? <p className="font-medium">Falta «o» registrada</p> : null}
      {!alreadyRegistered && !registered && !uncertain ? (
        <Button
          aria-label={`Registrar falta «o» a ${name}`}
          disabled={registering}
          onClick={() => void register()}
        >
          Registrar falta «o»
        </Button>
      ) : null}
      {!alreadyRegistered && !registered && uncertain ? (
        <Button
          variant="outline"
          aria-label={`Comprobar falta «o» de ${name}`}
          onClick={() => void check()}
        >
          Comprobar si se registró
        </Button>
      ) : null}
      {registerError ? (
        <p role="alert" className="text-destructive">
          {registerError}
        </p>
      ) : null}

      {sanction ? (
        <div className="space-y-2">
          <p>{`Sanción propuesta: ${sanctionText(sanction)}`}</p>
          {confirmed.map((m) => (
            <p key={m.id} className="font-medium">
              {`Exclusión confirmada: ${SANCTION_LABEL[sanction.kind]} en ${m.opponent}`}
            </p>
          ))}
          {complete ? (
            <p className="text-muted-foreground">La sanción propuesta ya está completa.</p>
          ) : upcoming === null ? null : upcoming.length === 0 ? (
            <p className="text-muted-foreground">
              Todavía no hay un partido siguiente: crea uno en Partidos y confírmala desde aquí.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label={`Partido de la exclusión de ${name}`}
                aria-invalid={Boolean(chooseError)}
                aria-describedby={chooseError ? `choose-error-${playerId}` : undefined}
                className={`${SELECT_CLASS} max-w-72`}
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">Selecciona el partido</option>
                {remaining.map((m) => (
                  <option key={m.id} value={m.id}>
                    {formatShortDay(m.held_on)} · {m.opponent}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                aria-label={`Confirmar exclusión de ${name}`}
                disabled={confirming}
                onClick={() => void confirmExclusion()}
              >
                Confirmar exclusión
              </Button>
            </div>
          )}
          {chooseError ? (
            <p id={`choose-error-${playerId}`} role="alert" className="text-sm text-destructive">
              {chooseError}
            </p>
          ) : null}
          {exclusionError ? (
            <p role="alert" className="text-destructive">
              {exclusionError}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

interface RedCardsProps {
  match: Match;
  /** Rojas efectivas del partido (sin las deshechas). */
  reds: readonly LoggedEvent[];
  nameOf: (playerId: string) => string;
}

/** Rojas del partido: el entrenador decide si registra la falta «o» y confirma la sanción. */
export function RedCards({ match, reds, nameOf }: RedCardsProps) {
  const { id, held_on: heldOn, session_id: sessionId } = match;
  const [reference, setReference] = useState<Reference | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void loadReference({ id, heldOn, sessionId }).then((loaded) => {
      if (active) setReference(loaded);
    });
    return () => {
      active = false;
    };
  }, [id, heldOn, sessionId, reloadKey]);

  const recheck = useCallback(
    async (playerId: string): Promise<boolean | null> => {
      const registered = await loadRegistered({ id, heldOn, sessionId });
      setReference((current) => (current ? { ...current, alreadyRegistered: registered } : current));
      return registered === null ? null : registered.has(playerId);
    },
    [id, heldOn, sessionId],
  );

  const loadFailed =
    reference !== null &&
    (reference.infraction === null || reference.upcoming === null || reference.alreadyRegistered === null);

  return (
    <section aria-labelledby="reds-title" className="space-y-3">
      <h3 id="reds-title" className="text-lg font-semibold">
        Rojas del partido
      </h3>
      {reference && reference.infraction === null ? (
        <p role="alert" className="text-destructive">
          No se pudo cargar la falta «o»
        </p>
      ) : null}
      {reference && reference.upcoming === null ? (
        <p role="alert" className="text-destructive">
          No se pudieron cargar los partidos siguientes
        </p>
      ) : null}
      {reference && reference.alreadyRegistered === null ? (
        <p className="text-sm text-muted-foreground">
          No se pudo comprobar si ya estaba registrada: revisa Puntos antes de registrarla.
        </p>
      ) : null}
      {loadFailed ? (
        <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          Reintentar carga
        </Button>
      ) : null}
      <ul className="space-y-3">
        {reds.map((red) =>
          red.player_id && reference?.infraction ? (
            <RedCardItem
              key={red.id}
              match={match}
              playerId={red.player_id}
              name={nameOf(red.player_id)}
              infraction={reference.infraction}
              alreadyRegistered={reference.alreadyRegistered?.has(red.player_id) ?? false}
              upcoming={reference.upcoming}
              exclusions={reference.exclusions}
              recheck={recheck}
            />
          ) : (
            <li key={red.id} className="rounded-xl border bg-card p-4 text-lg font-medium">
              {`Roja de ${red.player_id ? nameOf(red.player_id) : "jugador desconocido"}`}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
