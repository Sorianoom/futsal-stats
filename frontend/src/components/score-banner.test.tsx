import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreBanner } from "./score-banner";

describe("ScoreBanner", () => {
  it("muestra el título y el marcador", () => {
    render(<ScoreBanner eyebrow="Descanso" title="Parte 1 terminada" score={{ for: 3, against: 2 }} />);

    expect(screen.getByText("Parte 1 terminada")).toBeInTheDocument();
    expect(screen.getByText("Descanso")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("3 – 2");
  });

  it("usa un encabezado de nivel 2 salvo que se pida el 1", () => {
    const { rerender } = render(<ScoreBanner eyebrow="Final" title="vs Rival" score={{ for: 1, against: 0 }} />);
    expect(screen.getByRole("heading", { level: 2, name: "vs Rival" })).toBeInTheDocument();

    rerender(<ScoreBanner eyebrow="Final" title="vs Rival" level={1} score={{ for: 1, against: 0 }} />);

    expect(screen.getByRole("heading", { level: 1, name: "vs Rival" })).toBeInTheDocument();
  });

  it("muestra la nota solo si se da", () => {
    const { rerender } = render(
      <ScoreBanner eyebrow="Final" title="Partido terminado" score={{ for: 0, against: 0 }} />,
    );
    expect(screen.queryByText("Partido cerrado")).not.toBeInTheDocument();

    rerender(
      <ScoreBanner eyebrow="Final" title="Partido terminado" note="Partido cerrado" score={{ for: 0, against: 0 }} />,
    );

    expect(screen.getByText("Partido cerrado")).toBeInTheDocument();
  });
});
