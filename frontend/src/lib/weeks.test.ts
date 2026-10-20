import { describe, expect, it } from "vitest";

import { currentWeekStart, formatWeekRange, shiftWeek, todayInMadrid, weekStartOf } from "./weeks";

describe("todayInMadrid", () => {
  it("devuelve el día de Madrid, no el de UTC", () => {
    expect(todayInMadrid(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(todayInMadrid(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
  });
});

describe("weekStartOf", () => {
  it.each([
    ["2026-10-19", "2026-10-19"],
    ["2026-10-20", "2026-10-19"],
    ["2026-10-25", "2026-10-19"],
    ["2026-10-26", "2026-10-26"],
    ["2027-01-01", "2026-12-28"],
  ])("el lunes de %s es %s", (day, monday) => {
    expect(weekStartOf(day)).toBe(monday);
  });
});

describe("currentWeekStart", () => {
  it("usa el día en Europe/Madrid, no el UTC", () => {
    // Domingo 25 oct 2026 23:30 UTC ya es lunes 26 en Madrid (UTC+1 tras el cambio de hora).
    expect(currentWeekStart(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });

  it("antes de la medianoche de Madrid sigue en la semana anterior", () => {
    expect(currentWeekStart(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-19");
  });
});

describe("shiftWeek", () => {
  it("avanza y retrocede semanas completas", () => {
    expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26");
    expect(shiftWeek("2026-10-19", -1)).toBe("2026-10-12");
  });

  it("cruza el cambio de hora y de año sin desplazar el día", () => {
    expect(shiftWeek("2026-10-26", -1)).toBe("2026-10-19");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });
});

describe("formatWeekRange", () => {
  it("muestra de lunes a domingo en español", () => {
    expect(formatWeekRange("2026-10-19")).toBe("19 oct – 25 oct 2026");
  });
});
