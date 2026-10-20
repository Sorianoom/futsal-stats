import { describe, expect, it } from "vitest";

import { mockApi } from "@/test/mock-api";

import {
  createExclusion,
  createSession,
  deleteMovement,
  listExclusions,
  getAttendance,
  getCallup,
  listInfractions,
  listMovements,
  listSessions,
  registerInfraction,
  registerWins,
  saveAttendance,
} from "./points";

const WEEK = "2026-10-19";

describe("API de puntos", () => {
  it("getCallup pide la semana y, si se indica, el partido", async () => {
    const api = mockApi({ "GET /callup": { data: { week: WEEK } } });

    await getCallup(WEEK);
    await getCallup(WEEK, "m1");

    expect(api.calls.map((c) => c.path)).toEqual([
      `/callup?week=${WEEK}`,
      `/callup?week=${WEEK}&match_id=m1`,
    ]);
  });

  it("listSessions y listMovements filtran por semana", async () => {
    const api = mockApi({
      "GET /sessions": { data: [] },
      "GET /movements": { data: [] },
    });

    await listSessions(WEEK);
    await listMovements(WEEK);
    await listMovements(WEEK, "p1");

    expect(api.calls.map((c) => c.path)).toEqual([
      `/sessions?week=${WEEK}`,
      `/movements?week=${WEEK}`,
      `/movements?week=${WEEK}&player_id=p1`,
    ]);
  });

  it("createSession envía tipo, fecha y notas", async () => {
    const api = mockApi({ "POST /sessions": { data: { id: "s1" } } });

    await createSession({ kind: "training", held_on: "2026-10-20", notes: null });

    expect(api.calls[0].body).toEqual({ kind: "training", held_on: "2026-10-20", notes: null });
  });

  it("saveAttendance usa PUT con los registros y devuelve las propuestas", async () => {
    const api = mockApi({
      "PUT /sessions/s1/attendance": { data: { saved: 1, proposals: [] } },
      "GET /sessions/s1/attendance": { data: [] },
    });
    const records = [{ player_id: "p1", status: "late" as const, notified: false, minutes_late: 20 }];

    const saved = await saveAttendance("s1", records);
    await getAttendance("s1");

    expect(saved).toEqual({ saved: 1, proposals: [] });
    expect(api.calls[0].body).toEqual({ records });
    expect(api.count("GET", "/sessions/s1/attendance")).toBe(1);
  });

  it("registerWins envía el tipo y los jugadores", async () => {
    const api = mockApi({ "POST /sessions/s1/wins": { data: { movements: [] } } });

    await registerWins("s1", "scrimmage", ["p1", "p2"]);

    expect(api.calls[0].body).toEqual({ kind: "scrimmage", player_ids: ["p1", "p2"] });
  });

  it("registerInfraction envía la falta y deleteMovement la corrige", async () => {
    const api = mockApi({
      "POST /movements/infractions": { data: { movement: { id: "m1" }, escalations: [] } },
      "DELETE /movements/m1": { data: { id: "m1" } },
      "GET /catalog/infractions": { data: [] },
    });
    const infraction = {
      player_id: "p1",
      infraction_code: "a",
      occurred_on: "2026-10-20",
      in_match: false,
    };

    await registerInfraction(infraction);
    await deleteMovement("m1");
    await listInfractions();

    expect(api.calls[0].body).toEqual(infraction);
    expect(api.count("DELETE", "/movements/m1")).toBe(1);
    expect(api.count("GET", "/catalog/infractions")).toBe(1);
  });

  it("createExclusion y listExclusions usan /exclusions", async () => {
    const api = mockApi({
      "POST /exclusions": { data: { id: "x1" } },
      "GET /exclusions": { data: [] },
    });

    await createExclusion("p1", "m2", "no_play");
    await listExclusions("m2");

    expect(api.calls[0].body).toEqual({ player_id: "p1", match_id: "m2", kind: "no_play" });
    expect(api.calls[1].path).toBe("/exclusions?match_id=m2");
  });
});
