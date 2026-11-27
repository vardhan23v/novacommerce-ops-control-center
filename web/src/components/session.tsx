"use client";
import { createContext, useContext } from "react";

export type Me = { id: string; name: string; email: string; role: "viewer" | "operator" | "manager"; permissions: string[] };
const Ctx = createContext<Me | null>(null);
export const SessionProvider = Ctx.Provider;
export function useMe() {
  const me = useContext(Ctx);
  if (!me) throw new Error("no session");
  return me;
}
export const useCan = (p: string) => useMe().permissions.includes(p);
