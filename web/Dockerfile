# ---------- build ----------
FROM node:20-slim AS builder
WORKDIR /app
ENV HUSKY=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# A URL do WebSocket é embutida no build (Vite). Default: bot publicado em :3100 no host.
ARG VITE_WS_URL=ws://localhost:3100
ENV VITE_WS_URL=$VITE_WS_URL
# URL do AuthServer (login WorkOS), também embutida no build. Default: bot publicado em :3001.
ARG VITE_AUTH_URL=http://localhost:3001
ENV VITE_AUTH_URL=$VITE_AUTH_URL
# Habilita o botão "Vincular WhatsApp" (Fase 6). "false" enquanto não houver número de bot.
ARG VITE_WHATSAPP_ENABLED=false
ENV VITE_WHATSAPP_ENABLED=$VITE_WHATSAPP_ENABLED
RUN pnpm build

# ---------- runtime ----------
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
