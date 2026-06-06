import { useState } from "react";
import { useChat } from "./hooks/useChat";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { getTheme, toggleTheme, type Theme } from "../../lib/theme";

export function ChatPage() {
  const { messages, typing, status, sendText, sendPhoto } = useChat();
  const connected = status === "open";
  const [theme, setTheme] = useState<Theme>(getTheme());

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-base font-semibold">Alfred</h1>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {connected ? "conectado" : status === "connecting" ? "conectando…" : "offline"}
            </span>
            <button
              type="button"
              onClick={() => setTheme(toggleTheme())}
              title="Alternar tema"
              aria-label="Alternar tema"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      <MessageList messages={messages} typing={typing} />
      <ChatInput disabled={!connected} onSendText={sendText} onSendPhoto={sendPhoto} />
    </div>
  );
}
