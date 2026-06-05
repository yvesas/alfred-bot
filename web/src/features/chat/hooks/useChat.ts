import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getClientId } from "../../../lib/clientId";
import { notifyIfHidden, requestNotificationPermission } from "../../../lib/notify";
import { useAuth } from "../../auth/AuthProvider";
import type { ChatMessage, Inbound, Role } from "../types";
import { useChatSocket } from "./useChatSocket";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3100";

// Estado da conversa (mensagens + "digitando"), integrado ao transporte WS.
// A UI consome só este hook — não conhece WebSocket.
export function useChat() {
  const clientId = useMemo(getClientId, []);
  const { token } = useAuth(); // quando logado, anexamos o JWT às mensagens

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);

  const append = useCallback((role: Role, text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text }]);
  }, []);

  // Anexa o token (quando logado) a toda mensagem enviada ao servidor.
  const auth = useMemo(() => (token ? { token } : {}), [token]);

  const handleInbound = useCallback(
    (msg: Inbound) => {
      switch (msg.type) {
        case "bot_message":
          setTyping(false);
          append("bot", msg.text);
          // Lembretes/mensagens chegam mesmo com a aba em segundo plano: avisa via notificação.
          notifyIfHidden("Alfred", msg.text);
          break;
        case "typing":
          setTyping(msg.value);
          break;
        case "error":
          setTyping(false);
          append("bot", `⚠️ ${msg.message}`);
          break;
      }
    },
    [append],
  );

  const { status, send } = useChatSocket(WS_URL, handleInbound);

  // Ao conectar pela primeira vez, manda um /start para o bot saudar.
  const greeted = useRef(false);
  useEffect(() => {
    if (status === "open" && !greeted.current) {
      greeted.current = true;
      send({ type: "user_message", clientId, text: "/start", ...auth });
    }
  }, [status, send, clientId, auth]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Pede permissão de notificação no 1º gesto do usuário (requisito dos navegadores).
      requestNotificationPermission();
      append("user", trimmed);
      send({ type: "user_message", clientId, text: trimmed, ...auth });
    },
    [append, send, clientId, auth],
  );

  const sendPhoto = useCallback(
    (imageBase64: string) => {
      append("user", "📷 Cupom enviado");
      send({ type: "user_photo", clientId, imageBase64, ...auth });
    },
    [append, send, clientId, auth],
  );

  // Troca o idioma do bot (reusa o comando /idioma) sem exibir o comando no chat.
  const setLanguage = useCallback(
    (lang: string) => {
      send({ type: "user_message", clientId, text: `/idioma ${lang}`, ...auth });
    },
    [send, clientId, auth],
  );

  return { messages, typing, status, clientId, sendText, sendPhoto, setLanguage };
}
