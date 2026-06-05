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
RUN pnpm build

# ---------- runtime ----------
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
