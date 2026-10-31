"""RFC 9457 application/problem+json error responses."""

from __future__ import annotations
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None
    extensions: dict[str, Any] | None = None


def problem_response(
    status: int,
    title: str,
    detail: str | None = None,
    type: str = "about:blank",
    request_id: str | None = None,
    **extensions: Any,
) -> JSONResponse:
    body = ProblemDetail(
        type=type,
        title=title,
        status=status,
        detail=detail,
        request_id=request_id,
        extensions=extensions if extensions else None,
    )
    return JSONResponse(
        status_code=status,
        content=body.model_dump(exclude_none=True),
        media_type="application/problem+json",
    )
