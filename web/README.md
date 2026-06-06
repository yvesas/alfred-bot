# alfred-web

Frontend de **chat** (React + Vite + Tailwind) que conversa com o bot via **WebSocket** (o
`WebAdapter` do projeto `bot/`). Sem login nesta fase — identidade anônima por `clientId` no
`localStorage`.

## Rodar (dev)

```bash
pnpm install
cp .env.sample .env     # ajuste VITE_WS_URL se necessário (default ws://localhost:3100)
pnpm dev                # http://localhost:5173
```

Pré-requisito: o **bot** rodando com `PLATFORMS` incluindo `web` (abre o WebSocket em `WEB_PORT`,
default `3100`).

## Scripts

| Script | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (Vite) |
| `pnpm build` | Type-check + build de produção (`dist/`) |
| `pnpm preview` | Servir a build localmente |
| `pnpm typecheck` | Checagem de tipos |

## Estrutura

```
src/
├── App.tsx · main.tsx
├── lib/clientId.ts                 # identidade anônima (localStorage)
└── features/chat/
    ├── ChatPage.tsx                # container
    ├── types.ts                    # protocolo WS + tipos do chat
    ├── hooks/useChatSocket.ts      # transporte WS (conexão/reconexão)
    ├── hooks/useChat.ts            # estado das mensagens
    └── components/                 # MessageList, MessageBubble, ChatInput, TypingIndicator
```

**Princípio:** transporte (`useChatSocket`) isolado do estado (`useChat`) e da UI (componentes puros).
