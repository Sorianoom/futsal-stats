"use client";

import { useEffect } from "react";

import { useAuth } from "@/components/auth-provider";
import { queryCache } from "@/lib/query-cache";
import {
  callupQuery,
  matchesQuery,
  movementsQuery,
  playersQuery,
  pointsReferenceQuery,
  seasonStatsQuery,
  sessionsQuery,
  type Query,
} from "@/lib/queries";
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
    const queries: Query<unknown>[] = [playersQuery, matchesQuery, seasonStatsQuery];
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
