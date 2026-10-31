"""Tests for the security module — rate limiter, input validation, headers."""

import time
import pytest
from claimshield_common.security import RateLimiter


class TestRateLimiter:
    def test_allows_within_burst(self):
        limiter = RateLimiter(rate=10.0, burst=5)
        for _ in range(5):
            assert limiter.allow("tenant-1") is True

    def test_blocks_after_burst_exhausted(self):
        limiter = RateLimiter(rate=10.0, burst=3)
        for _ in range(3):
            limiter.allow("tenant-1")
        assert limiter.allow("tenant-1") is False

    def test_different_tenants_independent(self):
        limiter = RateLimiter(rate=10.0, burst=2)
        limiter.allow("tenant-1")
        limiter.allow("tenant-1")
        assert limiter.allow("tenant-1") is False
        assert limiter.allow("tenant-2") is True

    def test_refills_over_time(self):
        limiter = RateLimiter(rate=100.0, burst=5)
        for _ in range(5):
            limiter.allow("tenant-1")
        assert limiter.allow("tenant-1") is False

        # Manually advance the bucket's last_refill
        bucket = limiter._buckets["tenant-1"]
        bucket.last_refill -= 0.1  # 0.1s at 100 req/s = 10 tokens
        assert limiter.allow("tenant-1") is True

    def test_burst_caps_tokens(self):
        limiter = RateLimiter(rate=100.0, burst=3)
        # Even after long time, tokens cap at burst
        bucket = limiter._buckets["tenant-1"]
        bucket.last_refill -= 100.0
        for _ in range(3):
            assert limiter.allow("tenant-1") is True
        assert limiter.allow("tenant-1") is False

    def test_default_params(self):
        limiter = RateLimiter()
        assert limiter.rate == 10.0
        assert limiter.burst == 50
