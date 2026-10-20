import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import HomePage from "./page";

describe("HomePage", () => {
  it("saluda según el rol y enlaza con la plantilla", () => {
    renderWithAuth(<HomePage />, { user: fakeUser("assistant_coach") });

    expect(screen.getByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByText("Sesión de Segundo entrenador")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Plantilla/ })).toHaveAttribute("href", "/plantilla");
  });
});
