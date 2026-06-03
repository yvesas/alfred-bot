# Plano — Microserviço PaddleOCR + FastAPI em Docker (Fase 4)

> Documento de planejamento e **estudo**. Nada implementado ainda.
> Implementa a Fase 4 de [PLANO-OCR-FASES.md](./PLANO-OCR-FASES.md): um OCR self-hosted que o bot
> consome **internamente** pela rede Docker, sem depender de provedor pago.
> Última atualização: 02/06/2026.

---

## Context e objetivo

PaddleOCR é uma biblioteca **Python** (não JS), então o padrão correto é rodá-la como um
**microserviço HTTP** (FastAPI) e o bot Node consumir via rede interna. Objetivos:

- Aprender a montar a estrutura `bot (Node) ↔ ocr (Python/PaddleOCR)` em Docker.
- Ter um OCR sem API externa paga (custo = a máquina; ver nota de custo no fim).
- Manter a mesma interface `IOcrProvider` do bot (Fase 1) — o serviço é só mais um provider.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  docker network: app-net (interna)                       │
│                                                          │
│   ┌────────────┐        HTTP POST /ocr     ┌───────────┐ │
│   │   bot      │ ───────────────────────▶  │    ocr    │ │
│   │ (Node/TS)  │   { image: base64 }       │ FastAPI + │ │
│   │            │ ◀───────────────────────  │ PaddleOCR │ │
│   └────────────┘   { text, lines, ms }     └───────────┘ │
│   OCR_PROVIDER=paddle                       (não exposto │
│   PADDLE_OCR_URL=http://ocr:8000             publicamente)│
└──────────────────────────────────────────────────────────┘
```

- O serviço `ocr` **não publica portas** para fora (só acessível na rede interna do compose).
- O bot acessa por DNS do compose: `http://ocr:8000`.

---

## Estrutura de pastas proposta

```
bot-telegram/
├── Dockerfile                 # já existe (bot)
├── docker-compose.yml         # novo — orquestra bot + ocr
└── ocr-service/               # novo — microserviço Python
    ├── Dockerfile
    ├── requirements.txt
    └── app/
        └── main.py            # FastAPI + PaddleOCR
```

---

## Serviço FastAPI (`ocr-service/app/main.py`)

```python
import base64, time
from fastapi import FastAPI
from pydantic import BaseModel
from paddleocr import PaddleOCR

# Carrega o modelo UMA vez no startup (caro). 'pt' = português; use_angle_cls corrige rotação.
ocr = PaddleOCR(use_angle_cls=True, lang="pt", show_log=False)
app = FastAPI(title="ocr-service")

class OcrRequest(BaseModel):
    image: str  # base64 (sem data URI)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ocr")
def run_ocr(req: OcrRequest):
    started = time.time()
    img_bytes = base64.b64decode(req.image)
    result = ocr.ocr(img_bytes, cls=True)

    lines = []
    for page in result or []:
        for _box, (text, conf) in page or []:
            lines.append({"text": text, "confidence": float(conf)})

    full_text = "\n".join(l["text"] for l in lines)
    return {
        "text": full_text,
        "lines": lines,
        "ms": int((time.time() - started) * 1000),
    }
```

Notas:
- **Carregar o modelo no startup** (fora do handler) evita recarregar a cada request.
- `lang="pt"` cobre português; avaliar `lang="latin"` se a precisão variar.
- Resposta inclui `confidence` por linha — útil para o bot decidir reprocessar/avisar o usuário.

### `ocr-service/requirements.txt`
```
fastapi==0.115.*
uvicorn[standard]==0.32.*
paddleocr==2.9.*
paddlepaddle==2.6.*      # versão CPU
```

### `ocr-service/Dockerfile`
```dockerfile
FROM python:3.11-slim

# Dependências de sistema exigidas pelo PaddleOCR/OpenCV.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Limita threads de CPU (evita consumir a máquina inteira).
ENV OMP_NUM_THREADS=2
EXPOSE 8000

# Healthcheck para o compose saber quando está pronto.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Orquestração (`docker-compose.yml`)

```yaml
services:
  bot:
    build: .
    env_file: .env
    environment:
      OCR_PROVIDER: paddle
      PADDLE_OCR_URL: http://ocr:8000
    depends_on:
      ocr:
        condition: service_healthy
    networks: [app-net]
    restart: unless-stopped

  ocr:
    build: ./ocr-service
    # SEM 'ports:' — acessível apenas internamente pela rede app-net.
    networks: [app-net]
    restart: unless-stopped
    # Cache dos modelos baixados (evita re-download a cada recriação).
    volumes:
      - paddle-models:/root/.paddleocr
    deploy:
      resources:
        limits:
          memory: 2g      # PaddleOCR carrega modelos na RAM

networks:
  app-net:
    driver: bridge

volumes:
  paddle-models:
```

Subir tudo:
```bash
docker compose up --build -d
docker compose logs -f ocr     # acompanhar o load do modelo (primeiro start é lento)
```

---

## Integração no bot (resumo da Fase 4)

- `src/services/ocr/PaddleOcrProvider.ts` faz `POST {PADDLE_OCR_URL}/ocr` com `{ image: base64 }`
  e retorna `data.text` (ver esboço em [PLANO-OCR-FASES.md](./PLANO-OCR-FASES.md)).
- Ativar com `OCR_PROVIDER=paddle` (já injeta o provider certo pelo factory do Container).
- O `handlePhoto` não muda — continua chamando `extractTextFromImage`.

---

## Dimensionamento e custo (EC2)

| Item | Recomendação |
|---|---|
| Instância | **t3.medium (4GB)** confortável; t3.small (2GB) no limite. Evitar t2.micro (OOM). |
| CPU/GPU | CPU basta no volume atual; GPU desnecessário. |
| RAM do serviço ocr | ~1–2GB (limite de 2g no compose). |
| Disco | Alguns GB (wheel do paddle + modelos baixados). |
| Custo | t3.small ~US$15/mês, t3.medium ~US$30/mês on-demand (menos com Savings/Spot). |

> ⚠️ Esse **custo fixo de máquina ligada 24/7** costuma superar Gemini/Vision no volume atual
> (<1.000–20 mil/mês). Por isso esta estrutura é **para estudo** e como rota de escala/privacidade
> futura — não como economia imediata.

---

## Notas de estudo / gotchas

- **Cold start:** o primeiro request é lento (carrega modelo). Mantenha o serviço quente; não use
  scale-to-zero.
- **Pré-processamento melhora muito** cupom térmico: grayscale, aumento de contraste, deskew
  (pode entrar no FastAPI antes do `ocr.ocr`).
- **`OMP_NUM_THREADS`** controla uso de CPU — ajuste conforme o tamanho da instância.
- **Segurança:** não publique a porta 8000; deixe o `ocr` só na rede interna. Se um dia expor,
  proteja com token/rede privada.
- **Versões:** PaddleOCR/paddlepaddle são sensíveis a versão — pinar no `requirements.txt` e testar.
- **Observabilidade:** logar `ms` e `confidence` médios ajuda a comparar com Gemini/Vision no A/B.
- **`.dockerignore` do ocr-service:** ignorar `__pycache__`, venv, modelos locais.

---

## Critérios de aceite (quando implementar)

1. `docker compose up` sobe `bot` + `ocr`; `ocr` fica *healthy* antes do `bot` iniciar.
2. `OCR_PROVIDER=paddle` → enviar foto de cupom no Telegram retorna a compra registrada.
3. Serviço `ocr` **não acessível** de fora da rede do compose.
4. Modelos persistidos em volume (segundo start não re-baixa).
5. Uso de RAM dentro do limite configurado; sem OOM.
