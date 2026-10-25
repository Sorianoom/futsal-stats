import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("la variante cta usa el color de acción principal", () => {
    render(<Button variant="cta">Empezar partido</Button>);

    const button = screen.getByRole("button", { name: "Empezar partido" });
    expect(button).toHaveClass("bg-cta", "text-cta-foreground");
  });

  it("los tamaños por defecto son de al menos 48 px para tocar con el pulgar", () => {
    expect(buttonVariants({ size: "default" })).toContain("h-12");
    expect(buttonVariants({ size: "lg" })).toContain("h-16");
  });

  it("la variante por defecto sigue siendo la primaria", () => {
    render(<Button>Guardar</Button>);

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("bg-primary");
  });
});
