import { describe, expect, it } from "vitest";

import { describeGoalDetail, detailOf, goalTagLabel, hasDetail, toggleTag } from "./goal-detail";

describe("goalTagLabel", () => {
  it("cambia la pérdida y la propia según de quién es el gol", () => {
    expect(goalTagLabel("turnover", false)).toBe("Pérdida en campo propio");
    expect(goalTagLabel("turnover", true)).toBe("Robo en campo rival");
    expect(goalTagLabel("own_goal", true)).toBe("En propia del rival");
    expect(goalTagLabel("far_post", true)).toBe("Segundo palo");
    expect(goalTagLabel("nuevo", false)).toBe("nuevo");
  });
});

describe("toggleTag", () => {
  it("marca, desmarca y no deja pasar de 3", () => {
    expect(toggleTag([], "counter")).toEqual(["counter"]);
    expect(toggleTag(["counter"], "counter")).toEqual([]);
    expect(toggleTag(["counter", "rebound", "penalty"], "far_post")).toEqual(["counter", "rebound", "penalty"]);
  });
});

describe("detalle de un evento", () => {
  it("un gol antiguo no tiene detalle", () => {
    const detail = detailOf({});
    expect(detail).toEqual({ goal_tags: [], goal_x: null, goal_y: null });
    expect(hasDetail(detail)).toBe(false);
    expect(describeGoalDetail(detail, false)).toBe("");
  });

  it("describe los tipos y si tiene punto", () => {
    const detail = detailOf({ goal_tags: ["set_piece", "far_post"], goal_x: 80, goal_y: 10 });
    expect(hasDetail(detail)).toBe(true);
    expect(describeGoalDetail(detail, false)).toBe("Balón parado, segundo palo · con punto");
    expect(describeGoalDetail({ ...detail, goal_tags: [] }, true)).toBe("con punto");
  });
});
