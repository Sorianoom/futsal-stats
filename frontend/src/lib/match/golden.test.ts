import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { onCourt, replay, secondsByPlayer, type LineupEvent } from "./lineup";

/** Caso dorado compartido con el backend (`backend/tests/domain/stints/test_golden.py`). */
interface Golden {
  lineup_events: LineupEvent[];
  expected: { sent_off: string[]; seconds_by_player: Record<string, number> };
}

const FIXTURE = resolve(process.cwd(), "..", "shared", "fixtures", "stints_full_match.json");
const golden = JSON.parse(readFileSync(FIXTURE, "utf-8")) as Golden;

describe("caso dorado compartido con Python", () => {
  const state = replay(golden.lineup_events);

  it("termina sin nadie en pista y con los expulsados esperados", () => {
    expect(onCourt(state)).toEqual([]);
    expect([...state.sentOff].sort()).toEqual(golden.expected.sent_off);
  });

  it("calcula los mismos minutos por jugador que Python", () => {
    expect(secondsByPlayer(state.closed)).toEqual(golden.expected.seconds_by_player);
  });
});
