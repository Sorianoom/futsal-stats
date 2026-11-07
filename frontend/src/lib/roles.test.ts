import { describe, expect, it } from "vitest";

import { canVisit, homeFor } from "./roles";

describe("roles", () => {
  it("el jugador empieza en las estadísticas y los entrenadores en el inicio", () => {
    expect(homeFor("player")).toBe("/estadisticas");
    expect(homeFor("head_coach")).toBe("/");
    expect(homeFor("assistant_coach")).toBe("/");
  });

  it.each(["/estadisticas", "/estadisticas/"])("el jugador puede ver %s", (pathname) => {
    expect(canVisit("player", pathname)).toBe(true);
  });

  it.each(["/", "/partido", "/partido/", "/puntos", "/convocatoria", "/plantilla", "/entrenos", "/corregir", "/estadisticasX"])(
    "el jugador no puede ver %s",
    (pathname) => {
      expect(canVisit("player", pathname)).toBe(false);
    },
  );

  it("los entrenadores pueden ver cualquier pantalla de la app", () => {
    expect(canVisit("head_coach", "/puntos")).toBe(true);
    expect(canVisit("assistant_coach", "/partido")).toBe(true);
  });
});
