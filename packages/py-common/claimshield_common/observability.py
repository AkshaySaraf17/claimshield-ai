"""OpenTelemetry instrumentation and structured logging for ClaimShield services.

Usage in each FastAPI service:
    from claimshield_common.observability import setup_observability
    setup_observability(app, service_name="claims-svc")
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class StructuredJsonFormatter(logging.Formatter):
    """Outputs log records as single-line JSON for log aggregation."""

    def __init__(self, service_name: str = "claimshield"):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": self.service_name,
        }
        if record.exc_info and record.exc_info[1]:
            entry["exception"] = {
                "type": type(record.exc_info[1]).__name__,
                "message": str(record.exc_info[1]),
            }

        # Add trace context if available
        trace_id = getattr(record, "otelTraceID", None)
        span_id = getattr(record, "otelSpanID", None)
        if trace_id and trace_id != "0":
            entry["trace_id"] = trace_id
        if span_id and span_id != "0":
            entry["span_id"] = span_id

        # Add extra fields from the record
        for key in ("tenant_id", "user_id", "request_id", "method", "path", "status_code", "duration_ms"):
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val

        return json.dumps(entry, default=str)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs each request with method, path, status, and duration."""

    def __init__(self, app: Any, service_name: str = "claimshield"):
        super().__init__(app)
        self.logger = logging.getLogger(f"{service_name}.http")

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        tenant_id = request.headers.get("x-tenant-id")
        user_id = request.headers.get("x-user-id")

        self.logger.info(
            "%s %s %s %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "tenant_id": tenant_id,
                "user_id": user_id,
            },
        )
        return response


def setup_structured_logging(service_name: str = "claimshield", level: int = logging.INFO) -> None:
    """Replace the root handler with JSON structured output."""
    root = logging.getLogger()
    root.setLevel(level)

    # Remove existing handlers
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredJsonFormatter(service_name))
    root.addHandler(handler)


def setup_otel_tracing(service_name: str = "claimshield") -> None:
    """Set up OpenTelemetry tracing if the SDK is installed.

    This is optional — services work fine without it. When OTEL is available,
    it exports traces to an OTLP endpoint (Jaeger, Grafana Tempo, etc.).
    """
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        resource = Resource.create({SERVICE_NAME: service_name})
        provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(OTLPSpanExporter())
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        return FastAPIInstrumentor
    except ImportError:
        return None


def setup_observability(app: Any, service_name: str = "claimshield") -> None:
    """One-call setup: structured logging + request middleware + optional OTEL."""
    setup_structured_logging(service_name)

    # Add request logging middleware
    app.add_middleware(RequestLoggingMiddleware, service_name=service_name)

    # Try to set up OTEL tracing (optional dependency)
    instrumentor = setup_otel_tracing(service_name)
    if instrumentor:
        instrumentor().instrument_app(app)
        logging.getLogger(service_name).info("OpenTelemetry tracing enabled")
    else:
        logging.getLogger(service_name).info(
            "OpenTelemetry SDK not installed — running without distributed tracing"
        )
