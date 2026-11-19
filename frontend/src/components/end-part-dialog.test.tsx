import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EndPartDialog } from "./end-part-dialog";

describe("EndPartDialog", () => {
  it("pregunta por la parte y el tiempo antes de terminarla", async () => {
    const onConfirm = vi.fn();
    render(<EndPartDialog part={1} timeText="20:00" open onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.getByText("¿Terminar la 1ª parte en 20:00?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Terminar la parte" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancelar no termina nada", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<EndPartDialog part={2} timeText="00:00" open onConfirm={onConfirm} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole("button", { name: "Seguir jugando" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cerrado no muestra nada", () => {
    render(<EndPartDialog part={1} timeText="20:00" open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText(/Terminar la 1ª parte/)).not.toBeInTheDocument();
  });
});
