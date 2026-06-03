# ocr-service

Microserviço de **OCR self-hosted** (FastAPI + PaddleOCR). Recebe uma imagem em base64 e devolve o texto transcrito. É consumido **internamente** pelo `bot-telegram` (via `PaddleOcrProvider`) quando `OCR_PROVIDER=paddle`.

## API

| Método | Rota      | Corpo                     | Resposta                                       |
| ------ | --------- | ------------------------- | ---------------------------------------------- |
| GET    | `/health` | —                         | `{ "status": "ok" }`                           |
| POST   | `/ocr`    | `{ "image": "<base64>" }` | `{ "text": "...", "lines": [...], "ms": 123 }` |

## Rodar standalone (Docker)

```bash
docker build -t ocr-service .
docker run --rm -p 8000:8000 ocr-service
# primeiro start é lento (baixa/carrega o modelo)

curl -s http://localhost:8000/health
# teste com uma imagem:
curl -s -X POST http://localhost:8000/ocr \
  -H "Content-Type: application/json" \
  -d "{\"image\":\"$(base64 -i ../nota-01.jpg)\"}"
```

## Rodar junto do bot (recomendado)

Use o `docker-compose.yml` na raiz `/` (orquestra `bot` + `ocr`):

```bash
# no diretório /alfred
docker compose --profile paddle up -d
```

E no `bot-telegram/.env`:

```dotenv
OCR_PROVIDER=paddle
PADDLE_OCR_URL=http://ocr:8000
```

## Desenvolvimento local (sem Docker)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## ⚠️ Plataforma (arm64 vs x86_64)

O `paddlepaddle` distribui wheels para **linux/amd64 (x86_64)**, mas **não** para `linux/arm64`.
Por isso:

- **EC2 x86_64 / máquinas Intel/AMD:** builda nativamente, sem ajustes.
- **Apple Silicon (M1/M2/M3) ou outros ARM:** o build nativo falha. Builde via emulação:
  ```bash
  docker build --platform linux/amd64 -t ocr-service .
  ```

  (ou descomente `platform: linux/amd64` no `../docker-compose.yml`). A emulação é mais lenta.

## Notas

- O serviço **não deve ser exposto publicamente** — no compose ele fica só na rede interna.
- Modelos são cacheados em volume (`/root/.paddleocr`) para não re-baixar a cada recriação.
- `OMP_NUM_THREADS` controla o uso de CPU.
- Cupom térmico melhora muito com pré-processamento (grayscale/contraste/deskew) antes do `ocr.ocr`.
