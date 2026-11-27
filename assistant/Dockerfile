# Build context: repository root.  docker build -f assistant/Dockerfile .
FROM python:3.12-slim
WORKDIR /app
COPY assistant/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY assistant/app.py .
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8800}"]
