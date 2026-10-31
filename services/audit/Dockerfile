FROM python:3.12-slim

WORKDIR /app

COPY ../../packages/py-common /packages/py-common
RUN pip install --no-cache-dir /packages/py-common

COPY . /app
RUN pip install --no-cache-dir /app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
