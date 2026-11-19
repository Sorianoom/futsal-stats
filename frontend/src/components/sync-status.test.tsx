import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RejectionNotice, SyncStatus } from "./sync-status";

describe("SyncStatus", () => {
  it("si el servidor rechazó el envío avisa y deja reintentar sin recargar", async () => {
    const onRetry = vi.fn();
    render(
      <SyncStatus status="stalled" pending={2} detail="El servidor rechazó el envío (Dato inválido)" onRetry={onRetry} onReload={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Dato inválido");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Recargar partido" })).not.toBeInTheDocument();
  });
});

describe("RejectionNotice", () => {
  it("dice qué no se guardó y se puede cerrar", async () => {
    const onDismiss = vi.fn();
    render(<RejectionNotice items={["Gol de Ana (05:00): jugador desconocido"]} onDismiss={onDismiss} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se guardó");
    expect(screen.getByRole("alert")).toHaveTextContent("Gol de Ana (05:00): jugador desconocido");
    await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("sin rechazos no muestra nada", () => {
    const { container } = render(<RejectionNotice items={[]} onDismiss={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
