// Cliente da API HTTP do bot (painel/conta). Autenticado pelo JWT (Bearer).
const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? "http://localhost:3001";

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export type Plan = "free" | "pro";

export interface PlanUsage {
  plan: Plan;
  monthCount: number;
  limit: number;
}

export interface Me {
  sub?: string;
  name?: string;
  email?: string;
  plan: Plan;
  usage: PlanUsage;
  identities: string[];
}

export interface SpendingReport {
  period: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byStore: Record<string, number>;
}

export interface MonthlyPoint {
  year: number;
  month: number;
  total: number;
  count: number;
}

export interface DashboardReport {
  current: SpendingReport;
  last: SpendingReport;
  monthly: MonthlyPoint[];
}

export async function fetchMe(token: string): Promise<Me | null> {
  const res = await fetch(`${AUTH_URL}/api/me`, { headers: headers(token) });
  return res.ok ? ((await res.json()) as Me) : null;
}

export async function fetchReport(token: string): Promise<DashboardReport | null> {
  const res = await fetch(`${AUTH_URL}/api/report`, { headers: headers(token) });
  return res.ok ? ((await res.json()) as DashboardReport) : null;
}

export async function deleteAccount(token: string): Promise<boolean> {
  const res = await fetch(`${AUTH_URL}/api/account`, { method: "DELETE", headers: headers(token) });
  return res.ok;
}

// Baixa o CSV das compras (servidor). Retorna o Blob para o chamador disparar o download.
export async function fetchCsvBlob(token: string): Promise<Blob | null> {
  const res = await fetch(`${AUTH_URL}/api/export.csv`, { headers: headers(token) });
  return res.ok ? await res.blob() : null;
}

// Edição de perfil (nome) — direito de correção (LGPD).
export async function updateProfile(token: string, name: string): Promise<boolean> {
  const res = await fetch(`${AUTH_URL}/api/profile`, {
    method: "PATCH",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.ok;
}
