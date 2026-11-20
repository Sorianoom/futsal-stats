"use client";

import { useEffect } from "react";

import { useAuth } from "@/components/auth-provider";
import { queryCache } from "@/lib/query-cache";
import {
  callupQuery,
  fantasyMeQuery,
  fantasyStandingsQuery,
  matchesQuery,
  movementsQuery,
  playersQuery,
  pointsReferenceQuery,
  seasonStatsQuery,
  sessionsQuery,
  type Query,
} from "@/lib/queries";
import { isPlayer } from "@/lib/roles";
import { currentWeekStart } from "@/lib/weeks";

/** Pide y guarda una lectura. Es un adelanto: si falla, la pantalla volverá a pedirla y avisará. */
function warm(query: Query<unknown>): void {
  const startedAt = queryCache.generation();
  query
    .fetch()
    .then((data) => queryCache.setIfCurrent(query.key, data, startedAt))
    .catch(() => undefined);
}

/**
 * Al abrir sesión precarga las lecturas de cada pestaña, para que ni la primera visita espere a la
 * API (y de paso despierta el backend en frío). No pinta nada.
 */
export function CacheWarmer() {
  const { user, status } = useAuth();
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const week = currentWeekStart();
    // Todos los roles leen el Fantasy: son dos lecturas pequeñas.
    const fantasy: Query<unknown>[] = [fantasyMeQuery, fantasyStandingsQuery];
    // El jugador solo puede leer partidos, estadísticas y Fantasy: pedir más le daría 403.
    if (isPlayer(role)) {
      [matchesQuery, seasonStatsQuery, ...fantasy].forEach(warm);
      return;
    }
    const queries: Query<unknown>[] = [playersQuery, matchesQuery, seasonStatsQuery, ...fantasy];
    if (role === "head_coach") {
      queries.push(
        pointsReferenceQuery,
        callupQuery(week),
        sessionsQuery(week),
        movementsQuery(week),
      );
    }
    queries.forEach(warm);
  }, [status, userId, role]);

  return null;
}
