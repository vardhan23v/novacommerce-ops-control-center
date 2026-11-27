# Build context: repository root.  docker build -f deploy/mock/Dockerfile .
FROM python:3.12-slim
WORKDIR /app
COPY attachments/mock_services.py attachments/business_data.json ./
COPY deploy/mock/serve.py ./
CMD ["python", "serve.py"]
