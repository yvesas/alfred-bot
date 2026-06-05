// Login web (WorkOS via backend). O bot expõe /auth/login e /auth/callback; aqui só
// redirecionamos para o login, capturamos o token do retorno e o guardamos.

const TOKEN_KEY = "alfred:jwt";
const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? "http://localhost:3001";

export interface Session {
  sub: string;
  email?: string;
  name?: string;
}

export function getToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

// Inicia o login: redireciona ao backend levando o clientId anônimo (para o merge).
export function login(clientId: string): void {
  window.location.href = `${AUTH_URL}/auth/login?clientId=${encodeURIComponent(clientId)}`;
}

export function logout(): void {
  clearToken();
  if (typeof window !== "undefined") window.location.reload();
}

// Captura ?token=... do retorno do callback, guarda e limpa a URL. Retorna o token, se houver.
export function captureTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) return null;
  setToken(token);
  params.delete("token");
  const qs = params.toString();
  const url = window.location.pathname + (qs ? `?${qs}` : "");
  window.history.replaceState({}, "", url);
  return token;
}

// Decodifica o payload do JWT (sem validar — a validação é no servidor) para exibir nome/e-mail.
export function decodeSession(token: string | null): Session | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json) as Partial<Session>;
    return data.sub ? { sub: data.sub, email: data.email, name: data.name } : null;
  } catch {
    return null;
  }
}
