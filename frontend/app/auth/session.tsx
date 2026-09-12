"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient, type AuthenticatedUser } from "./api";

const TOKEN_KEY = "examen-sw1.access-token";

type SessionStatus = "loading" | "anonymous" | "authenticated";

type SessionContextValue = {
  status: SessionStatus;
  user: AuthenticatedUser | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
};

type SessionApi = Pick<ApiClient, "login" | "register" | "me">;

const SessionContext = createContext<SessionContextValue | null>(null);

export function safeReturnPath(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/projects";
}

export function SessionProvider({ children, client }: Readonly<{ children: ReactNode; client?: SessionApi }>) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const clearSessionRef = useRef<() => void>(() => undefined);
  const apiRef = useRef<SessionApi | null>(null);

  const clearSession = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setStatus("anonymous");
  };
  clearSessionRef.current = clearSession;

  const api = apiRef.current ?? client ?? createApiClient({
      getToken: () => sessionStorage.getItem(TOKEN_KEY),
      onUnauthorized: () => clearSessionRef.current(),
    });
  apiRef.current = api;

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setStatus("anonymous");
      return;
    }
    void api.me().then((authenticatedUser) => {
      setUser(authenticatedUser);
      setStatus("authenticated");
    }).catch(() => clearSessionRef.current());
  }, []);

  const authenticate = async (email: string, password: string, register = false) => {
    if (register) {
      await api.register(email, password);
    }
    const token = await api.login(email, password);
    sessionStorage.setItem(TOKEN_KEY, token);
    const authenticatedUser = await api.me();
    setUser(authenticatedUser);
    setStatus("authenticated");
  };

  return (
    <SessionContext.Provider value={{
      status,
      user,
      login: (email, password) => authenticate(email, password),
      register: (email, password) => authenticate(email, password, true),
      logout: clearSession,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession debe usarse dentro de SessionProvider.");
  }
  return session;
}
