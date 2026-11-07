import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { AuthContext, type AuthContextValue } from "@/components/auth-provider";
import type { Role, User } from "@/lib/api/types";

export function fakeUser(role: Role = "head_coach"): User {
  return { id: "u1", email: `${role}@club.es`, role, player_id: role === "player" ? "p1" : null };
}

export function renderWithAuth(ui: ReactElement, overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    user: fakeUser(),
    status: "authenticated",
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { value, ...render(<AuthContext.Provider value={value}>{ui}</AuthContext.Provider>) };
}
