"""Tests for the Cents money type — integer-only, no floats."""

import pytest
from claimshield_common.money import Cents


def test_cents_from_int():
    c = Cents(1500)
    assert int(c) == 1500
    assert c.to_dollars() == 15.00


def test_cents_from_dollars():
    c = Cents.from_dollars(25.50)
    assert int(c) == 2550


def test_cents_rejects_float():
    with pytest.raises(TypeError):
        Cents(15.5)


def test_cents_arithmetic():
    a = Cents(1000)
    b = Cents(500)
    assert int(a + b) == 1500
    assert int(a - b) == 500


def test_cents_comparison():
    assert Cents(100) == Cents(100)
    assert Cents(200) > Cents(100)
    assert Cents(50) < Cents(100)
