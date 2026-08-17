# alfred-bot

Monorepo do **Alfred** — um assistente financeiro pessoal no **Telegram e WhatsApp** que registra
compras e gastos a partir de texto ou de fotos de cupons fiscais (IA + OCR), com persistência em MongoDB.

> 📘 **Como usar e testar:** [`docs/runbooks/uso-e-teste.md`](./docs/runbooks/uso-e-teste.md)

## Projetos

| Pasta | O que é | Stack |
|---|---|---|
| [`bot/`](./bot) | O bot (Telegram, WhatsApp, Web) — aplicação principal | TypeScript · Telegraf · Baileys · Mongoose · Gemini/GPT |
| [`web/`](./web) | Frontend de **chat** (web) | React · Vite · Tailwind · WebSocket |
| [`ocr-service/`](./ocr-service) | Microserviço **opcional** de OCR self-hosted | Python · FastAPI · PaddleOCR |

Cada projeto tem o seu próprio README com instruções de setup e execução.

## Subir tudo com Docker

O `docker-compose.yml` na raiz orquestra os dois serviços. O serviço de OCR é **opcional** (só é
necessário com `OCR_PROVIDER=paddle`).

```bash
# Padrão (OCR via Gemini/Vision) — sobe apenas o bot:
docker compose up -d

# Self-host (PaddleOCR) — sobe bot + ocr:
docker compose --profile paddle up -d
```

Configure as variáveis em `bot/.env` (a partir de `bot/.env.sample`).

## Documentação

**`docs/` é o sistema como ele é · `specs/` é o plano.**

| | |
|---|---|
| Guia de uso e teste | [`docs/runbooks/uso-e-teste.md`](./docs/runbooks/uso-e-teste.md) |
| Arquitetura | [`docs/architecture.md`](./docs/architecture.md) |
| Decisões estruturais | [`docs/adr/`](./docs/adr) · [`docs/decisions.md`](./docs/decisions.md) |
| Estado atual e roadmap | [`specs/project/`](./specs/project) |
| Mapeamento do código | [`specs/codebase/`](./specs/codebase) — stack, estrutura, convenções, testes, integrações, **riscos** |
| READMEs dos projetos | [`bot/`](./bot/README.md) · [`web/`](./web/README.md) · [`ocr-service/`](./ocr-service/README.md) |
