# ---------- build ----------
FROM node:20-slim AS builder
WORKDIR /app

# Evita rodar o hook do husky durante o install em ambiente sem git.
ENV HUSKY=0
RUN corepack enable

# Instala dependências (com cache de camada) a partir do lockfile.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copia o código e compila para dist/.
COPY . .
RUN pnpm build

# ---------- runtime ----------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0
RUN corepack enable

# Apenas dependências de produção. --ignore-scripts evita o hook "prepare" (husky,
# que é devDependency e não existe aqui); nenhum build script é necessário em runtime.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Artefato compilado.
COPY --from=builder /app/dist ./dist

# Porta do servidor de health/metrics (liveness, readiness e /metrics p/ Prometheus).
EXPOSE 3000

# Healthcheck do orquestrador via readiness (usa node, sempre presente na imagem).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.HEALTH_PORT||3000)+'/ready', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

# As credenciais e variáveis de ambiente são fornecidas pelo host em runtime
# (ex.: secrets/volumes). NÃO são embutidas na imagem.
CMD ["node", "dist/index.js"]
