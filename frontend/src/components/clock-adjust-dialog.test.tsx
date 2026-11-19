import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClockAdjustDialog } from "./clock-adjust-dialog";

type DialogProps = React.ComponentProps<typeof ClockAdjustDialog>;

function setup(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    open: true,
    elapsed: 300,
    partSeconds: 1200,
    onShift: vi.fn(),
    onSet: vi.fn(),
    onPartSeconds: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ClockAdjustDialog {...props} />);
  return props;
}

describe("ClockAdjustDialog", () => {
  it("muestra lo que marca el reloj en cuenta atrás", () => {
    setup();

    expect(screen.getByRole("status")).toHaveTextContent("15:00");
  });

  it.each([
    ["+1 s", 1],
    ["−1 s", -1],
    ["+10 s", 10],
    ["−10 s", -10],
  ])("%s mueve lo que se ve en el marcador", async (label, delta) => {
    const props = setup();

    await userEvent.click(screen.getByRole("button", { name: label }));

    expect(props.onShift).toHaveBeenCalledWith(delta);
  });

  it("se puede teclear el tiempo exacto, también uno anterior", async () => {
    const props = setup({ elapsed: 600 });

    await userEvent.click(screen.getByRole("button", { name: "Teclear el tiempo" }));
    for (const digit of "1500") await userEvent.click(screen.getByRole("button", { name: digit }));
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(props.onSet).toHaveBeenCalledWith(300);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("cambia la duración de la parte de minuto en minuto", async () => {
    const props = setup();

    expect(screen.getByText("Parte de 20:00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Parte de 1 min más" }));
    expect(props.onPartSeconds).toHaveBeenCalledWith(1260);
    await userEvent.click(screen.getByRole("button", { name: "Parte de 1 min menos" }));
    expect(props.onPartSeconds).toHaveBeenCalledWith(1140);
  });

  it("la duración no baja de 1 minuto", () => {
    setup({ partSeconds: 60 });

    expect(screen.getByRole("button", { name: "Parte de 1 min menos" })).toBeDisabled();
  });

  it("Listo cierra el diálogo", async () => {
    const props = setup();

    await userEvent.click(screen.getByRole("button", { name: "Listo" }));

    expect(props.onClose).toHaveBeenCalled();
  });
});
