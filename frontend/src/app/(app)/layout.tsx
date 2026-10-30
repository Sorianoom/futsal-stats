import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { CacheWarmer } from "@/components/cache-warmer";
import { RequireAuth } from "@/components/require-auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <CacheWarmer />
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
