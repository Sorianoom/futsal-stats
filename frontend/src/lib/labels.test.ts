import { describe, expect, it } from "vitest";

import { sanctionText } from "./labels";

describe("sanctionText", () => {
  it("usa el singular cuando es un solo partido", () => {
    expect(sanctionText({ kind: "no_callup", min_matches: 1, max_matches: 1 })).toBe(
      "Sin convocatoria (1 partido)",
    );
  });

  it("usa el plural cuando son varios partidos iguales", () => {
    expect(sanctionText({ kind: "no_play", min_matches: 2, max_matches: 2 })).toBe("No juega (2 partidos)");
  });

  it("muestra el rango cuando mínimo y máximo difieren", () => {
    expect(sanctionText({ kind: "no_play", min_matches: 1, max_matches: 2 })).toBe("No juega (1–2 partidos)");
  });
});
