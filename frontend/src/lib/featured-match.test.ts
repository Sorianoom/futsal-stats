import { describe, expect, it } from "vitest";

import type { Match } from "@/lib/api/match-types";

import { pickFeaturedMatch } from "./featured-match";

function match(id: string, heldOn: string): Match {
  return { id, session_id: `s-${id}`, held_on: heldOn, opponent: `Rival ${id}`, is_official: true };
}

describe("pickFeaturedMatch", () => {
  it("elige el partido futuro más cercano", () => {
    const featured = pickFeaturedMatch(
      [match("c", "2026-11-15"), match("a", "2026-10-25"), match("b", "2026-11-01")],
      "2026-10-20",
    );

    expect(featured).toEqual({ kind: "upcoming", match: match("a", "2026-10-25") });
  });

  it("cuenta el partido de hoy como próximo", () => {
    const featured = pickFeaturedMatch([match("a", "2026-10-20"), match("b", "2026-10-10")], "2026-10-20");

    expect(featured?.kind).toBe("upcoming");
    expect(featured?.match.id).toBe("a");
  });

  it("sin partidos futuros ofrece el último jugado", () => {
    const featured = pickFeaturedMatch([match("a", "2026-09-01"), match("b", "2026-10-10")], "2026-10-20");

    expect(featured).toEqual({ kind: "last", match: match("b", "2026-10-10") });
  });

  it("devuelve null si no hay partidos", () => {
    expect(pickFeaturedMatch([], "2026-10-20")).toBeNull();
  });

  it("no modifica la lista recibida", () => {
    const input = [match("b", "2026-11-01"), match("a", "2026-10-25")];
    const copy = [...input];

    pickFeaturedMatch(input, "2026-10-20");

    expect(input).toEqual(copy);
  });
});
