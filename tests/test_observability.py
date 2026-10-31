"""Tests for the observability module — structured logging and request middleware."""

import json
import logging
import pytest
from claimshield_common.observability import StructuredJsonFormatter, setup_structured_logging


class TestStructuredJsonFormatter:
    def test_outputs_valid_json(self):
        formatter = StructuredJsonFormatter(service_name="test-svc")
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello world", args=(), exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["message"] == "hello world"
        assert parsed["service"] == "test-svc"
        assert parsed["level"] == "INFO"

    def test_includes_timestamp(self):
        formatter = StructuredJsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None,
        )
        output = json.loads(formatter.format(record))
        assert "timestamp" in output

    def test_includes_extra_fields(self):
        formatter = StructuredJsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="request", args=(), exc_info=None,
        )
        record.tenant_id = "tenant-123"
        record.method = "GET"
        record.path = "/health"
        record.status_code = 200
        record.duration_ms = 12.5
        output = json.loads(formatter.format(record))
        assert output["tenant_id"] == "tenant-123"
        assert output["method"] == "GET"
        assert output["path"] == "/health"
        assert output["status_code"] == 200
        assert output["duration_ms"] == 12.5

    def test_includes_exception_info(self):
        formatter = StructuredJsonFormatter()
        try:
            raise ValueError("test error")
        except ValueError:
            import sys
            exc_info = sys.exc_info()

        record = logging.LogRecord(
            name="test", level=logging.ERROR, pathname="", lineno=0,
            msg="failed", args=(), exc_info=exc_info,
        )
        output = json.loads(formatter.format(record))
        assert output["exception"]["type"] == "ValueError"
        assert output["exception"]["message"] == "test error"

    def test_includes_trace_context(self):
        formatter = StructuredJsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="traced", args=(), exc_info=None,
        )
        record.otelTraceID = "abc123"
        record.otelSpanID = "def456"
        output = json.loads(formatter.format(record))
        assert output["trace_id"] == "abc123"
        assert output["span_id"] == "def456"

    def test_skips_zero_trace_context(self):
        formatter = StructuredJsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="no trace", args=(), exc_info=None,
        )
        record.otelTraceID = "0"
        record.otelSpanID = "0"
        output = json.loads(formatter.format(record))
        assert "trace_id" not in output
        assert "span_id" not in output


class TestSetupStructuredLogging:
    def test_replaces_root_handlers(self):
        setup_structured_logging("test-svc", level=logging.DEBUG)
        root = logging.getLogger()
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, StructuredJsonFormatter)
