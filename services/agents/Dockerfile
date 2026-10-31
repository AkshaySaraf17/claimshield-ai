FROM python:3.12-slim

WORKDIR /app

COPY services/agents/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/agents/ /app/services/agents/

ENV PYTHONPATH=/app
ENV OLLAMA_BASE_URL=http://ollama:11434

EXPOSE 8001

CMD ["uvicorn", "services.agents.app.main:app", "--host", "0.0.0.0", "--port", "8001"]
