FROM python:3.12-slim

WORKDIR /app

COPY services/rules_engine/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/rules_engine/ /app/services/rules_engine/

ENV PYTHONPATH=/app

EXPOSE 8002

CMD ["uvicorn", "services.rules_engine.app.main:app", "--host", "0.0.0.0", "--port", "8002"]
