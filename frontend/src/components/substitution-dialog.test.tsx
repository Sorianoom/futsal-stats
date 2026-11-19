import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Player } from "@/lib/api/types";

import { SubstitutionDialog } from "./substitution-dialog";

const ANA: Player = { id: "a", name: "Ana", dorsal: 7, position: "field", status: "available", is_active: true, has_account: false };

describe("SubstitutionDialog", () => {
  it("desde un cambio se puede pasar a varios cambios a la vez", async () => {
    const onMany = vi.fn();
    render(
      <SubstitutionDialog anchor={{ player: ANA, side: "court" }} candidates={[]} onPick={vi.fn()} onClose={vi.fn()} onMany={onMany} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Varios cambios a la vez" }));

    expect(onMany).toHaveBeenCalledTimes(1);
  });
});
