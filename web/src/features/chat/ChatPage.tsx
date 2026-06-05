import { useEffect, useRef } from "react";
import { useChat } from "./hooks/useChat";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { TopNav } from "../../components/TopNav";
import { useI18n } from "../../lib/i18n";

export function ChatPage() {
  const { messages, typing, status, sendText, sendPhoto, setLanguage } = useChat();
  const { locale, t } = useI18n();
  const connected = status === "open";

  const statusLabel = connected
    ? t("status_connected")
    : status === "connecting"
      ? t("status_connecting")
      : t("status_offline");

  // Sincroniza o idioma do bot quando o locale muda (após o 1º render, e se conectado).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (connected) setLanguage(locale);
  }, [locale, connected, setLanguage]);

  return (
    <div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopNav />

      <div className="border-b border-zinc-200 px-4 py-1.5 dark:border-zinc-800">
        <div className="mx-auto flex max-w-4xl items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {statusLabel}
        </div>
      </div>

      <MessageList messages={messages} typing={typing} />
      <ChatInput disabled={!connected} onSendText={sendText} onSendPhoto={sendPhoto} />
    </div>
  );
}
