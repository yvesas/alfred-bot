import { useEffect, useState, type ReactNode } from "react";
import { TopNav } from "../components/TopNav";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../features/auth/AuthProvider";
import { fetchMe, deleteAccount, updateProfile, type Me } from "../lib/api";
import { linkUrl } from "../lib/auth";

const WHATSAPP_ENABLED = import.meta.env.VITE_WHATSAPP_ENABLED === "true";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}

const linkBtn =
  "rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800";

export function Account() {
  const { t } = useI18n();
  const { token, openLogin, logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void fetchMe(token).then((m) => {
      setMe(m);
      setName(m?.name ?? "");
      setLoading(false);
    });
  }, [token]);

  const onSaveName = async () => {
    if (token && name.trim().length >= 2) await updateProfile(token, name.trim());
  };

  const onDelete = async () => {
    if (!token) return;
    if (!window.confirm(t("account_delete_confirm"))) return;
    if (await deleteAccount(token)) logout(); // logout recarrega já deslogado
  };

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
  if (loading || !me) {
    return <Shell>{t("common_loading")}</Shell>;
  }

  const planLabel = me.plan === "pro" ? t("plan_pro_title") : t("plan_free_title");

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">{t("account_title")}</h1>

      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="—"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:bg-zinc-800"
            />
            <button
              type="button"
              onClick={onSaveName}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t("save")}
            </button>
          </div>
          {me.email && <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{me.email}</p>}
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("account_plan")}</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-sm font-medium text-brand">
              {planLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t("account_usage")}: {me.usage.monthCount}
            {me.plan === "free" ? ` / ${me.usage.limit}` : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">{t("account_linked")}</p>
          <p className="mb-3 text-sm">{me.identities.join(", ")}</p>
          <div className="flex flex-wrap gap-2">
            <a target="_blank" rel="noreferrer" href={linkUrl("telegram")} className={linkBtn}>
              {t("link_telegram")}
            </a>
            {WHATSAPP_ENABLED && (
              <a target="_blank" rel="noreferrer" href={linkUrl("whatsapp")} className={linkBtn}>
                {t("link_whatsapp")}
              </a>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-red-200 p-4 dark:border-red-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("account_delete_warning")}</p>
          <button
            type="button"
            onClick={onDelete}
            className="mt-3 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            {t("account_delete")}
          </button>
        </div>
      </div>
    </Shell>
  );
}
