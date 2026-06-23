import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getApi } from "@/services/api";
import type { User } from "@/services/types";

interface AuthCtx {
  user: User | null;
  signIn: (u: string, p: string) => Promise<void>;
  signUp: (u: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = getApi();
  const [user, setUser] = useState<User | null>(() => api.getCurrentUser());

  useEffect(() => {
    const unsub = api.onAuthChange(setUser);
    return unsub;
  }, [api]);

  const value: AuthCtx = {
    user,
    signIn: async (u, p) => {
      await api.signIn(u, p);
    },
    signUp: async (u, p) => {
      await api.signUp(u, p);
    },
    signOut: async () => {
      await api.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
