# alfred-bot

Monorepo do **Alfred** — um assistente financeiro pessoal no **Telegram e WhatsApp** que registra
compras e gastos a partir de texto ou de fotos de cupons fiscais (IA + OCR), com persistência em MongoDB.

> 📘 **Como usar e testar:** [`GUIA-DE-USO-E-TESTE.md`](./GUIA-DE-USO-E-TESTE.md)

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

- **Guia de uso e teste:** [`GUIA-DE-USO-E-TESTE.md`](./GUIA-DE-USO-E-TESTE.md)
- Bot: [`bot/README.md`](./bot/README.md)
- Roadmap: [`bot/ROADMAP.md`](./bot/ROADMAP.md)
- Análise técnica: [`bot/ANALISE-PROJETO.md`](./bot/ANALISE-PROJETO.md)
- Planos de OCR: [`bot/PLANO-OCR-FASES.md`](./bot/PLANO-OCR-FASES.md) · [`bot/PLANO-PADDLEOCR-DOCKER.md`](./bot/PLANO-PADDLEOCR-DOCKER.md)
