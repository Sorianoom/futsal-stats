import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import HomePage from "./page";

test("muestra el título de la aplicación", () => {
  render(<HomePage />);

  expect(screen.getByRole("heading", { name: "Futsal Stats" })).toBeTruthy();
});
