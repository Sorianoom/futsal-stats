import { describe, expect, it } from "vitest";

import { shortName } from "./player-name";

describe("shortName", () => {
  it("usa el alias cuando lo hay", () => {
    expect(shortName({ name: "Pedro Gómez Ruiz", alias: "Pedri" })).toBe("Pedri");
  });

  it("usa el nombre completo si no hay alias", () => {
    expect(shortName({ name: "Pedro Gómez Ruiz", alias: null })).toBe("Pedro Gómez Ruiz");
    expect(shortName({ name: "Pedro Gómez Ruiz" })).toBe("Pedro Gómez Ruiz");
  });

  it("ignora un alias en blanco", () => {
    expect(shortName({ name: "Pedro Gómez Ruiz", alias: "   " })).toBe("Pedro Gómez Ruiz");
  });
});
