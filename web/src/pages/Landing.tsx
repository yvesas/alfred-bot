import { Link } from "react-router-dom";
import { TopNav } from "../components/TopNav";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../features/auth/AuthProvider";

function PlanCard({
  title,
  features,
  highlight,
}: {
  title: string;
  features: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlight ? "border-brand" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {features
          .split("•")
          .map((f) => f.trim())
          .filter(Boolean)
          .map((f) => (
            <li key={f}>• {f}</li>
          ))}
      </ul>
    </div>
  );
}

export function Landing() {
  const { t } = useI18n();
  const { session, openLogin } = useAuth();

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <section className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">{t("landing_tagline")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-zinc-600 dark:text-zinc-400">
            {t("landing_subtitle")}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/chat"
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              {t("landing_cta_chat")}
            </Link>
            {!session && (
              <button
                type="button"
                onClick={openLogin}
                className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {t("login")}
              </button>
            )}
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-center text-xl font-semibold">{t("plans_title")}</h2>
          <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
            <PlanCard title={t("plan_free_title")} features={t("plan_free_features")} />
            <PlanCard title={t("plan_pro_title")} features={t("plan_pro_features")} highlight />
          </div>
        </section>
      </main>
    </div>
  );
}
