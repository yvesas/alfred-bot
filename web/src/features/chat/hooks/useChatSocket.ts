import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, Inbound, Outbound } from "../types";

// Transporte WebSocket isolado da UI e do estado: cuida de conexão, reconexão e envio.
// Recebe um callback para mensagens recebidas; expõe status e uma função send.
export function useChatSocket(url: string, onMessage: (msg: Inbound) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const aliveRef = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const connect = useCallback(() => {
    if (!aliveRef.current) return;
    setStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatus("open");
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      setStatus("closed");
      if (aliveRef.current) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };
    ws.onmessage = (event) => {
      try {
        onMessageRef.current(JSON.parse(event.data) as Inbound);
      } catch {
        // ignora payloads inválidos
      }
    };
  }, [url]);

  useEffect(() => {
    aliveRef.current = true;
    connect();
    return () => {
      aliveRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: Outbound) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { status, send };
}
