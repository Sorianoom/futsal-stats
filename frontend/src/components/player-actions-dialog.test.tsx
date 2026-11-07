import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Player } from "@/lib/api/types";

import { PlayerActionsDialog } from "./player-actions-dialog";

function player(id: string, dorsal: number): Player {
  return { id, name: `Jugador ${id}`, dorsal, position: "field", status: "available", is_active: true, has_account: false };
}

function setup(bench: Player[], current: Player = player("a", 7)) {
  const props = {
    player: current,
    bench,
    onClose: vi.fn(),
    onQuick: vi.fn(),
    onGoal: vi.fn(),
    onRed: vi.fn(),
    onSubstitute: vi.fn(),
    onSubstituteWith: vi.fn(),
  };
  render(<PlayerActionsDialog {...props} />);
  return props;
}

describe("PlayerActionsDialog", () => {
  it("ofrece el banquillo para cambiar al jugador con un solo toque", async () => {
    const props = setup([player("b", 9), player("c", 11)]);

    const group = screen.getByRole("group", { name: "Cambiar por" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    await userEvent.click(within(group).getByRole("button", { name: /Jugador c/ }));

    expect(props.onSubstituteWith).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });

  it("en los botones de cambio rápido pone el alias, y el título lleva el nombre completo", () => {
    setup([{ ...player("b", 9), alias: "Bebé" }, player("c", 11)]);

    const group = within(screen.getByRole("group", { name: "Cambiar por" }));
    expect(group.getByText("Bebé")).toBeInTheDocument();
    expect(group.getByText("Jugador c")).toBeInTheDocument();
    expect(screen.getByText("7 · Jugador a")).toBeInTheDocument();
  });

  it("no muestra el apartado de cambio rápido si no hay nadie en el banquillo", () => {
    setup([]);

    expect(screen.queryByRole("group", { name: "Cambiar por" })).not.toBeInTheDocument();
  });

  it("al portero le ofrece la parada con un solo toque", async () => {
    const props = setup([], { ...player("k", 1), position: "goalkeeper" });

    await userEvent.click(screen.getByRole("button", { name: "Parada" }));

    expect(props.onQuick).toHaveBeenCalledWith("save");
  });

  it("a un jugador de campo no le ofrece la parada", () => {
    setup([]);

    expect(screen.queryByRole("button", { name: "Parada" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tiro" })).toBeInTheDocument();
  });

  it("mantiene el botón Cambio para elegir con la lista completa", async () => {
    const props = setup([player("b", 9)]);

    await userEvent.click(screen.getByRole("button", { name: "Cambio" }));

    expect(props.onSubstitute).toHaveBeenCalled();
  });
});
