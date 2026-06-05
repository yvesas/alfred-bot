import { useChat } from "./hooks/useChat";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";

export function ChatPage() {
  const { messages, typing, status, sendText, sendPhoto } = useChat();
  const connected = status === "open";

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-base font-semibold">Alfred</h1>
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {connected ? "conectado" : status === "connecting" ? "conectando…" : "offline"}
          </span>
        </div>
      </header>

      <MessageList messages={messages} typing={typing} />
      <ChatInput disabled={!connected} onSendText={sendText} onSendPhoto={sendPhoto} />
    </div>
  );
}
