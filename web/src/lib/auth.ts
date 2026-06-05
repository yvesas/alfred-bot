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

// Login por e-mail + OTP (telas próprias, WorkOS Magic Auth). Passo 1: envia o código.
export async function startEmailLogin(email: string): Promise<boolean> {
  const res = await fetch(`${AUTH_URL}/auth/email/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return res.ok;
}

// Passo 2: valida o código. Em caso de sucesso, guarda o JWT e retorna true.
export async function verifyEmailLogin(
  email: string,
  code: string,
  clientId: string,
): Promise<boolean> {
  const res = await fetch(`${AUTH_URL}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, clientId }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { token?: string };
  if (!data?.token) return false;
  setToken(data.token);
  return true;
}

// URL do deep-link de vínculo: o backend gera o token e redireciona ao t.me/wa.me (Fase 6).
export function linkUrl(platform: "telegram" | "whatsapp"): string {
  const token = getToken() ?? "";
  return `${AUTH_URL}/auth/link/${platform}?token=${encodeURIComponent(token)}`;
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
