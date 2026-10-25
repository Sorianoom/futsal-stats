import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Movement } from "@/lib/api/types";

import { MovementsList } from "./movements-list";

function movement(id: string, points: number, reason: string): Movement {
  return {
    id,
    player_id: `p-${id}`,
    occurred_on: "2026-10-24",
    points,
    reason,
    applies_week: "2026-10-19",
    session_id: null,
    infraction_code: null,
  };
}

function setup(movements: Movement[]) {
  render(
    <MovementsList
      movements={movements}
      nameOf={(playerId) => `Jugador ${playerId}`}
      onUndo={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

function pointsOf(reason: string): HTMLElement {
  const row = screen.getByText(reason).closest("li") as HTMLElement;
  return within(row).getByText(/^[+-]\d+$/);
}

describe("MovementsList", () => {
  it("distingue a simple vista lo que suma, en verde, de lo que resta, en rojo", () => {
    setup([movement("a", 2, "Ejercicio ganado"), movement("b", -10, "No asistir sin aviso")]);

    expect(pointsOf("Ejercicio ganado")).toHaveClass("text-success-foreground");
    expect(pointsOf("No asistir sin aviso")).toHaveClass("text-destructive");
  });

  it("muestra el signo de cada movimiento", () => {
    setup([movement("a", 2, "Ejercicio ganado"), movement("b", -10, "No asistir sin aviso")]);

    expect(pointsOf("Ejercicio ganado")).toHaveTextContent("+2");
    expect(pointsOf("No asistir sin aviso")).toHaveTextContent("-10");
  });

  it("avisa cuando no hay movimientos", () => {
    setup([]);

    expect(screen.getByText("No hay movimientos esta semana")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Resumen de la semana" })).not.toBeInTheDocument();
  });

  it("resume la semana: cuántos movimientos, lo que suman y lo que restan", () => {
    setup([movement("a", 2, "Ejercicio ganado"), movement("b", 3, "Partidillo ganado"), movement("c", -10, "Falta")]);

    const summary = within(screen.getByRole("group", { name: "Resumen de la semana" }));

    expect(summary.getByText("Movimientos").previousElementSibling).toHaveTextContent("3");
    expect(summary.getByText("Suman").previousElementSibling).toHaveTextContent("+5");
    expect(summary.getByText("Restan").previousElementSibling).toHaveTextContent("-10");
  });

  it("si nada resta, lo deja en 0 sin signo", () => {
    setup([movement("a", 2, "Ejercicio ganado")]);

    const summary = within(screen.getByRole("group", { name: "Resumen de la semana" }));

    expect(summary.getByText("Restan").previousElementSibling).toHaveTextContent(/^0$/);
  });
});
