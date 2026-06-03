"""Microserviço de OCR (FastAPI + PaddleOCR).

Recebe uma imagem em base64 e devolve o texto transcrito. Consumido internamente
pelo bot (PaddleOcrProvider) quando OCR_PROVIDER=paddle.
"""

import base64
import time

import cv2
import numpy as np
from fastapi import FastAPI
from paddleocr import PaddleOCR
from pydantic import BaseModel

# Carrega o modelo UMA vez no startup (caro). lang="pt" = português;
# use_angle_cls corrige texto rotacionado.
ocr = PaddleOCR(use_angle_cls=True, lang="pt", show_log=False)

app = FastAPI(title="ocr-service", version="1.0.0")


class OcrRequest(BaseModel):
    image: str  # base64 (sem prefixo data URI)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
def run_ocr(req: OcrRequest):
    started = time.time()

    img_bytes = base64.b64decode(req.image)
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)

    result = ocr.ocr(img, cls=True)

    lines = []
    for page in result or []:
        for entry in page or []:
            text, confidence = entry[1][0], float(entry[1][1])
            lines.append({"text": text, "confidence": confidence})

    full_text = "\n".join(line["text"] for line in lines)
    return {
        "text": full_text,
        "lines": lines,
        "ms": int((time.time() - started) * 1000),
    }
