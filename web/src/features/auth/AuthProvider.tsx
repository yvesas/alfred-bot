import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  captureTokenFromUrl,
  decodeSession,
  getToken,
  logout as doLogout,
  type Session,
} from "../../lib/auth";
import { LoginModal } from "./LoginModal";

interface AuthValue {
  token: string | null;
  session: Session | null;
  openLogin: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

// Estado de autenticação compartilhado por todo o app (sessão, abrir login, sair).
// Captura o token do retorno do login uma única vez e expõe a sessão decodificada.
export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useMemo(() => captureTokenFromUrl() ?? getToken(), []);
  const session = useMemo(() => decodeSession(token), [token]);
  const [loginOpen, setLoginOpen] = useState(false);

  const value = useMemo<AuthValue>(
    () => ({ token, session, openLogin: () => setLoginOpen(true), logout: doLogout }),
    [token, session],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
