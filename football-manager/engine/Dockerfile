# ─── Manager FDF — Match Engine (Python/FastAPI) ──────────────────────────────
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN useradd --system --create-home --home-dir /home/fdf --shell /usr/sbin/nologin fdf \
  && chown -R fdf:fdf /app

USER fdf

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=4s --start-period=15s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
