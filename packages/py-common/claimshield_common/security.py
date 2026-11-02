"""Security middleware and utilities for ClaimShield services.

Provides:
- Rate limiting (in-memory, per-tenant)
- Input size limiting
- Security headers
- CORS configuration
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


@dataclass
class RateBucket:
    tokens: float
    last_refill: float


class RateLimiter:
    """Token bucket rate limiter, keyed by tenant_id.

    Each tenant gets `rate` requests per second, up to `burst` tokens.
    """

    def __init__(self, rate: float = 10.0, burst: int = 50):
        self.rate = rate
        self.burst = burst
        self._buckets: dict[str, RateBucket] = defaultdict(
            lambda: RateBucket(tokens=burst, last_refill=time.monotonic())
        )

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._buckets[key]

        elapsed = now - bucket.last_refill
        bucket.tokens = min(self.burst, bucket.tokens + elapsed * self.rate)
        bucket.last_refill = now

        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True
        return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware using tenant_id from gateway headers."""

    def __init__(self, app: Any, rate: float = 10.0, burst: int = 50):
        super().__init__(app)
        self.limiter = RateLimiter(rate=rate, burst=burst)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/healthz", "/ready"):
            return await call_next(request)

        tenant_id = request.headers.get("x-tenant-id", "anonymous")
        if not self.limiter.allow(tenant_id):
            return JSONResponse(
                status_code=429,
                content={
                    "type": "about:blank",
                    "title": "Too Many Requests",
                    "status": 429,
                    "detail": "Rate limit exceeded. Please try again later.",
                },
                headers={"Retry-After": "5"},
            )
        return await call_next(request)


class InputSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject request bodies that exceed a configurable size limit."""

    def __init__(self, app: Any, max_bytes: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    "type": "about:blank",
                    "title": "Payload Too Large",
                    "status": 413,
                    "detail": f"Request body exceeds maximum size of {self.max_bytes} bytes.",
                },
            )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to all responses."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        return response


def setup_security(
    app: Any,
    rate: float = 10.0,
    burst: int = 50,
    max_body_bytes: int = 10 * 1024 * 1024,
    allowed_origins: list[str] | None = None,
) -> None:
    """One-call security setup for a FastAPI service."""
    from starlette.middleware.cors import CORSMiddleware

    # Security headers (outermost — runs last on response)
    app.add_middleware(SecurityHeadersMiddleware)

    # Rate limiting
    app.add_middleware(RateLimitMiddleware, rate=rate, burst=burst)

    # Input size limiting
    app.add_middleware(InputSizeLimitMiddleware, max_bytes=max_body_bytes)

    # CORS — restrictive by default
    origins = allowed_origins or [
        "http://localhost:3000",
        "http://localhost:9080",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Tenant-Id"],
    )
