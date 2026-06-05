import { useEffect, useState, type ReactNode } from "react";
import { TopNav } from "../components/TopNav";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../features/auth/AuthProvider";
import { fetchReport, type DashboardReport } from "../lib/api";
import { money, monthLabel } from "../lib/format";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}

// Gráfico de barras simples (sem dependência) — total por mês.
function MonthlyBars({
  data,
  locale,
}: {
  data: DashboardReport["monthly"];
  locale: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex items-end gap-2" style={{ height: 160 }}>
      {data.map((d) => (
        <div key={`${d.year}-${d.month}`} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{money(d.total, locale)}</span>
          <div
            className="w-full rounded-t bg-brand/80"
            style={{ height: `${Math.round((d.total / max) * 120)}px` }}
            title={money(d.total, locale)}
          />
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {monthLabel(d.year, d.month)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function Dashboard() {
  const { t, locale } = useI18n();
  const { token, openLogin } = useAuth();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void fetchReport(token).then((r) => {
      setReport(r);
      setLoading(false);
    });
  }, [token]);

  if (!token) {
    return (
      <Shell>
        <p className="text-zinc-600 dark:text-zinc-400">
          {t("dashboard_login_required")}{" "}
          <button type="button" onClick={openLogin} className="font-medium text-brand underline">
            {t("login")}
          </button>
        </p>
      </Shell>
    );
  }
  if (loading) {
    return <Shell>{t("common_loading")}</Shell>;
  }

  const empty = !report || (report.current.count === 0 && report.monthly.length === 0);
  if (empty) {
    return (
      <Shell>
        <h1 className="mb-4 text-xl font-semibold">{t("dashboard_title")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("dashboard_empty")}</p>
      </Shell>
    );
  }

  const { current, last, monthly } = report;
  const diff = current.total - last.total;
  const diffLabel = `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff), locale)}`;
  const categories = Object.entries(current.byCategory).sort(([, a], [, b]) => b - a);

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">{t("dashboard_title")}</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card title={t("dashboard_this_month")}>
          <p className="text-2xl font-semibold">{money(current.total, locale)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {current.count} {t("dashboard_purchases")}
          </p>
        </Card>
        <Card title={t("dashboard_last_month")}>
          <p className="text-2xl font-semibold">{money(last.total, locale)}</p>
        </Card>
        <Card title={`${t("dashboard_this_month")} vs ${t("dashboard_last_month")}`}>
          <p className={`text-2xl font-semibold ${diff >= 0 ? "text-red-500" : "text-emerald-500"}`}>
            {diffLabel}
          </p>
        </Card>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {t("dashboard_monthly")}
        </h3>
        <MonthlyBars data={monthly} locale={locale} />
      </div>

      {categories.length > 0 && (
        <div className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {t("dashboard_by_category")}
          </h3>
          <ul className="space-y-1 text-sm">
            {categories.map(([cat, val]) => (
              <li key={cat} className="flex justify-between">
                <span>{cat}</span>
                <span className="font-medium">{money(val, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
