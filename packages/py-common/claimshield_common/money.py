"""Integer-cent money type. All monetary values in the system are stored and
transported as integer cents to avoid floating-point rounding errors."""

from __future__ import annotations
from pydantic import GetCoreSchemaHandler
from pydantic_core import CoreSchema, core_schema


class Cents:
    """Wrapper around an integer cent value with arithmetic and formatting."""

    __slots__ = ("_value",)

    def __init__(self, value: int) -> None:
        if not isinstance(value, int):
            raise TypeError(f"Cents requires int, got {type(value).__name__}")
        self._value = value

    @classmethod
    def from_dollars(cls, dollars: float) -> Cents:
        return cls(round(dollars * 100))

    @property
    def value(self) -> int:
        return self._value

    @property
    def dollars(self) -> str:
        sign = "-" if self._value < 0 else ""
        abs_val = abs(self._value)
        return f"{sign}${abs_val // 100}.{abs_val % 100:02d}"

    def __repr__(self) -> str:
        return f"Cents({self._value})"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Cents):
            return self._value == other._value
        return NotImplemented

    def __add__(self, other: Cents) -> Cents:
        if not isinstance(other, Cents):
            return NotImplemented
        return Cents(self._value + other._value)

    def __sub__(self, other: Cents) -> Cents:
        if not isinstance(other, Cents):
            return NotImplemented
        return Cents(self._value - other._value)

    def __int__(self) -> int:
        return self._value

    def __gt__(self, other: Cents) -> bool:
        if not isinstance(other, Cents):
            return NotImplemented
        return self._value > other._value

    def __lt__(self, other: Cents) -> bool:
        if not isinstance(other, Cents):
            return NotImplemented
        return self._value < other._value

    def __ge__(self, other: Cents) -> bool:
        if not isinstance(other, Cents):
            return NotImplemented
        return self._value >= other._value

    def __le__(self, other: Cents) -> bool:
        if not isinstance(other, Cents):
            return NotImplemented
        return self._value <= other._value

    def __hash__(self) -> int:
        return hash(self._value)

    def to_dollars(self) -> float:
        return self._value / 100

    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source: type, _handler: GetCoreSchemaHandler
    ) -> CoreSchema:
        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: v.value, info_arg=False, return_schema=core_schema.int_schema()
            ),
        )

    @classmethod
    def _validate(cls, v: int | Cents) -> Cents:
        if isinstance(v, cls):
            return v
        if isinstance(v, int):
            return cls(v)
        raise ValueError(f"Cannot convert {type(v).__name__} to Cents")
