"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Which innings tab of the scorecard is open, shared between the tabs and the section's share menu so "this innings" means
// the one on screen. Without a provider the tabs work as before.
interface Active {
  key: string | null;
  set: (key: string) => void;
}
const ActiveInnings = createContext<Active | null>(null);

export function ScorecardActiveProvider({ children }: { children: ReactNode }) {
  const [key, set] = useState<string | null>(null);
  const value = useMemo(() => ({ key, set }), [key]);
  return <ActiveInnings.Provider value={value}>{children}</ActiveInnings.Provider>;
}

export const useActiveInnings = (): Active | null => useContext(ActiveInnings);
