import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  messages: ChatMessage[];
  typing: boolean;
}

export function MessageList({ messages, typing }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {messages.length === 0 && !typing && (
          <p className="mt-10 text-center text-sm text-zinc-500">
            Comece enviando uma compra (ex.: “agua 7”) ou pergunte “quanto gastei?”.
          </p>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {typing && <TypingIndicator />}
        <div ref={endRef} />
      </div>
    </div>
  );
}
