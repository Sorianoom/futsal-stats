import { describe, expect, it } from "vitest";

import { nextSeq } from "./sequence";

describe("nextSeq", () => {
  it("empieza en 1 cuando no hay eventos", () => {
    expect(nextSeq([])).toBe(1);
  });

  it("es el mayor seq más uno, aunque lleguen desordenados", () => {
    expect(nextSeq([{ seq: 3 }, { seq: 7 }, { seq: 1 }])).toBe(8);
  });

  it("no depende de que no haya huecos", () => {
    expect(nextSeq([{ seq: 10 }])).toBe(11);
  });
});
