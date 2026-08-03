"use client";

import React, { createContext, useContext } from "react";
import type { Role } from "@/lib/types";
import { can as canCheck, type Capability } from "@/lib/permissions";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

const Ctx = createContext<SessionUser | null>(null);

export function UserProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useUser(): SessionUser {
  const u = useContext(Ctx);
  if (!u) throw new Error("useUser outside provider");
  return u;
}

export function useCan(capability: Capability): boolean {
  const u = useUser();
  return canCheck(u.role, capability);
}
