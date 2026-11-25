import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GoalStat } from "@/lib/api/stats-types";

import { GoalsSummary, countTags } from "./goals-summary";

function goal(partial: Partial<GoalStat>): GoalStat {
  return { event_id: "g", for_team: false, part: 1, t: 0, player_id: null, tags: [], x: null, y: null, ...partial };
}

const GOALS = [
  goal({ event_id: "a", tags: ["set_piece", "far_post"], x: 80, y: 10 }),
  goal({ event_id: "b", tags: ["set_piece"], x: 50, y: 30 }),
  goal({ event_id: "c" }),
  goal({ event_id: "d", for_team: true, player_id: "p1", tags: ["turnover"] }),
];

describe("GoalsSummary", () => {
  it("cuenta los tipos de más a menos", () => {
    expect(countTags(GOALS.slice(0, 3))).toEqual([
      ["set_piece", 2],
      ["far_post", 1],
    ]);
  });

  it("separa los goles en contra y a favor, con sus tipos y el mapa", () => {
    render(<GoalsSummary goals={GOALS} />);

    const against = screen.getByRole("region", { name: "Goles en contra" });
    expect(against).toHaveTextContent("3");
    expect(within(against).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Balón parado2",
      "Segundo palo1",
    ]);
    expect(against).toHaveTextContent("1 gol sin tipo anotado");
    expect(within(against).getByRole("img", { name: /2 puntos desde donde se marcaron/ })).toBeInTheDocument();
    const ours = screen.getByRole("region", { name: "Goles a favor" });
    expect(ours).toHaveTextContent("Robo en campo rival");
    expect(within(ours).queryByRole("img")).not.toBeInTheDocument();
  });

  it("sin goles no enseña nada", () => {
    const { container } = render(<GoalsSummary goals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
