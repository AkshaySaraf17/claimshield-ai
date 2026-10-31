FROM python:3.12-slim

WORKDIR /app

COPY services/dev_server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/dev_server/ /app/services/dev_server/
COPY services/claims/ /app/services/claims/

ENV PYTHONPATH=/app

EXPOSE 8003

CMD ["uvicorn", "services.dev_server.main:app", "--host", "0.0.0.0", "--port", "8003"]
