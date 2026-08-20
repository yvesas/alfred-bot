# Tech Stack

**Analisado:** 2026-08-14 · **Fonte:** `bot/package.json`, `web/package.json`,
`ocr-service/requirements.txt`, `docker-compose.yml`, `.github/workflows/`

Monorepo com **três projetos independentes**, cada um com o seu próprio
`package.json`/`pyproject.toml`, lint, testes e Dockerfile. Não há workspace
pnpm unificado — os projetos são instalados separadamente.

## Core (`bot/` — aplicação principal)

- **Linguagem:** TypeScript 5.7 (`strict: true`, decorators experimentais)
- **Runtime:** Node.js ≥ 20 (`.nvmrc` = `20`)
- **Módulos:** CommonJS (`module: CommonJS`, `moduleResolution: Node`) — **não** é ESM
- **Package manager:** pnpm 10.6.5 (fixado em `packageManager`)
- **DI:** InversifyJS 6 (`@injectable`/`@inject`, container em `src/infra/Container.ts`)
- **Sem framework HTTP** — os servidores usam `node:http` puro

## Mensageria / plataformas

- **Telegram:** Telegraf 4.16 (long-polling)
- **WhatsApp:** `@whiskeysockets/baileys` 6.7.23 (biblioteca não-oficial, login por QR)
- **Web:** `ws` 8.21 (servidor WebSocket próprio)

## Persistência

- **Banco:** MongoDB (Atlas em produção; container `mongo:7` no compose de dev)
- **ODM:** Mongoose 8.10 — schemas em `bot/src/models/`
- **Agregações:** `$facet`/`$group` nativos para somatórios de gasto

## IA e OCR

- **Gemini:** `@google-cloud/vertexai` 1.9.3 — modelo `gemini-2.0-flash-lite-001` (padrão)
- **GPT:** `openai` 4.86 — modelo `gpt-4-turbo` (alternativa por usuário)
- **OCR Google:** `@google-cloud/vision` 4.3 (provider `vision`)
- **OCR self-hosted:** microserviço `ocr-service/` (provider `paddle`)
- **QR/NFC-e:** `jsqr` 1.4 + `jimp` 1.6 (fallback de leitura da chave de acesso)

## Autenticação

- **WorkOS** (`@workos-inc/node` 10.2) — Magic Auth (e-mail + código OTP)
- **Sessão:** JWT próprio (`jsonwebtoken` 9), assinado com `JWT_SECRET`, validade 30 d

## Frontend (`web/`)

- **UI:** React 18.3 + React Router 7.17
- **Build:** Vite 5.4 · **Estilo:** Tailwind 3.4 + PostCSS/Autoprefixer
- **Estado:** hooks nativos + Context (`AuthProvider`) — sem Redux/Zustand/React Query
- **PDF:** jsPDF 4.2 (exportação client-side)
- **Serve:** nginx (imagem de produção)

## Serviço de OCR (`ocr-service/` — opcional)

- Python + FastAPI + PaddleOCR (`lang="pt"`, `use_angle_cls`) + OpenCV
- Só sobe com `docker compose --profile paddle`; **imagem nunca foi buildada**
  (paddlepaddle não tem wheel para linux/arm64)

## Testes

| Projeto | Framework | Extras |
|---|---|---|
| `bot/` | Jest 29 + ts-jest | sinon 19 (mocks), `mongodb-memory-server` 11 (Mongo real em memória) |
| `web/` | Vitest 2.1 | React Testing Library 16, `@testing-library/user-event`, jsdom 25 |

Cobertura reportada ao **Codecov** (só o bot).

## Observabilidade

- **Logs:** pino 10 (JSON em prod, `pino-pretty` em dev)
- **Métricas:** `prom-client` 15 → `GET /metrics` (Prometheus)
- **Health:** `GET /health` (liveness) e `GET /ready` (readiness + estado do Mongo)
- **Stack opcional:** Prometheus + Grafana via `--profile monitoring`

## Ferramentas de desenvolvimento

- ESLint 9 (flat config) + Prettier 3 nos dois projetos TypeScript
- Husky 9 + lint-staged 15 (`bot/.husky` cobre **os dois** projetos)
- Hook `commit-msg` próprio em `.githooks/` (baseline de convenções do workspace)
- GitHub Actions: `bot.yml`, `web.yml`, `ocr-service.yml` — path-filtered
- Docker: Dockerfile multi-stage por projeto + `docker-compose.yml` na raiz
