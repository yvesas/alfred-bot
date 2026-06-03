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

# start-period generoso: o primeiro start baixa/carrega o modelo (lento).
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
