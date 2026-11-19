import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";

import { actionErrorMessage } from "./errors";

const FALLBACK = "No se pudo";

describe("actionErrorMessage", () => {
  it("un rechazo del servidor muestra su mensaje", () => {
    const failure = new ApiError(409, "squad_full", "Tu plantilla está llena");

    expect(actionErrorMessage(failure, FALLBACK)).toBe("Tu plantilla está llena");
  });

  it.each([
    ["un corte de red", new ApiError(0, "network", "Sin conexión con el servidor")],
    ["un fallo del servidor", new ApiError(500, "internal_error", "Traceback")],
    ["un rechazo sin mensaje", new ApiError(422, "bid_too_low", "")],
    ["algo que no es de la API", new Error("boom")],
  ])("%s da el aviso genérico", (_name, failure) => {
    expect(actionErrorMessage(failure, FALLBACK)).toBe(FALLBACK);
  });
});
