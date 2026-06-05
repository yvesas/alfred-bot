import { useState } from "react";
import { getClientId } from "../../lib/clientId";
import { startEmailLogin, verifyEmailLogin } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";

interface Props {
  onClose: () => void;
}

// Login por e-mail + OTP em tela própria (WorkOS Magic Auth, headless). Passo 1: e-mail →
// envia código. Passo 2: código → valida e recarrega já logado.
export function LoginModal({ onClose }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    const ok = await startEmailLogin(email.trim()).catch(() => false);
    setLoading(false);
    if (ok) setStep("code");
    else setError(t("login_error"));
  };

  const verify = async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    setError("");
    const ok = await verifyEmailLogin(email.trim(), code.trim(), getClientId()).catch(() => false);
    if (ok) {
      window.location.reload(); // reconecta o WS já com o token
      return;
    }
    setLoading(false);
    setError(t("login_error"));
  };

  const inputClass =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";
  const submitClass =
    "w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {t("login_title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
            className="space-y-3"
          >
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login_email_placeholder")}
              className={inputClass}
            />
            <button type="submit" disabled={loading || !email.trim()} className={submitClass}>
              {t("login_send_code")}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
            className="space-y-3"
          >
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("login_code_sent")}{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-200">{email}</span>
            </p>
            <input
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("login_code_placeholder")}
              className={`${inputClass} tracking-widest`}
            />
            <button type="submit" disabled={loading || !code.trim()} className={submitClass}>
              {t("login_verify")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError("");
              }}
              className="w-full text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {t("login_back")}
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <p className="mt-4 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          {t("login_consent")}{" "}
          <a href="/privacidade" target="_blank" rel="noreferrer" className="underline">
            {t("privacy_policy")}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
