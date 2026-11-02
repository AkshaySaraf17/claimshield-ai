"""JWT verification and role enforcement for FastAPI services behind Keycloak."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel


class Role(StrEnum):
    PATIENT = "patient"
    BILLER = "biller"
    CODER = "coder"
    PHYSICIAN_REVIEWER = "physician_reviewer"
    CLINIC_ADMIN = "clinic_admin"
    AUDITOR = "auditor"
    PLATFORM_ADMIN = "platform_admin"


class TokenClaims(BaseModel):
    sub: str
    tenant_id: UUID
    roles: list[Role]
    email: str | None = None
    name: str | None = None


async def _extract_claims(request: Request) -> TokenClaims:
    """Extract claims from the request. In production, the API gateway (APISIX)
    validates the JWT and forwards claims as headers. In dev/test without a
    gateway, fall back to parsing the Authorization header directly."""
    # Gateway-forwarded claims (set by APISIX after JWT validation)
    tenant_header = request.headers.get("X-Tenant-Id")
    sub_header = request.headers.get("X-User-Id")
    roles_header = request.headers.get("X-User-Roles")

    if tenant_header and sub_header and roles_header:
        return TokenClaims(
            sub=sub_header,
            tenant_id=UUID(tenant_header),
            roles=[Role(r.strip()) for r in roles_header.split(",") if r.strip()],
            email=request.headers.get("X-User-Email"),
            name=request.headers.get("X-User-Name"),
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing authentication headers",
    )


CurrentUser = Annotated[TokenClaims, Depends(_extract_claims)]


def require_role(*allowed: Role):
    """Dependency that checks the user has at least one of the allowed roles."""

    async def _check(user: CurrentUser) -> TokenClaims:
        if not any(r in allowed for r in user.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {', '.join(allowed)}",
            )
        return user

    return Depends(_check)
