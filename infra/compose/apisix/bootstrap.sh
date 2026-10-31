#!/bin/sh
set -eu

ADMIN="http://apisix:9180/apisix/admin"
KEY="claimshield-apisix-dev-key"
KC="http://keycloak:8080/realms/claimshield"

echo "Waiting for APISIX admin API..."
until curl -sf "$ADMIN/routes" -H "X-API-KEY: $KEY" > /dev/null 2>&1; do
  sleep 2
done
echo "APISIX is ready."

echo "Waiting for Keycloak OIDC discovery..."
until curl -sf "$KC/.well-known/openid-configuration" > /dev/null 2>&1; do
  sleep 2
done
echo "Keycloak is ready."

# --- Global JWT consumer ---
curl -sf -X PUT "$ADMIN/consumers/claimshield-jwt" \
  -H "X-API-KEY: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "claimshield-jwt",
    "plugins": {}
  }' > /dev/null

# --- Claims service route ---
curl -sf -X PUT "$ADMIN/routes/claims-svc" \
  -H "X-API-KEY: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "/api/v1/claims/*",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "claims-svc:8000": 1 }
    },
    "plugins": {
      "openid-connect": {
        "discovery": "'"$KC/.well-known/openid-configuration"'",
        "bearer_only": true,
        "set_id_token_header": false,
        "set_access_token_header": false,
        "set_userinfo_header": false
      },
      "serverless-pre-function": {
        "phase": "access",
        "functions": [
          "return function(conf, ctx) local jwt = require(\"resty.jwt\"); local token = ngx.var.http_authorization and ngx.var.http_authorization:match(\"Bearer%s+(.+)\"); if token then local obj = jwt:load_jwt(token); if obj and obj.payload then ngx.req.set_header(\"X-Tenant-Id\", obj.payload.tenant_id or \"\"); ngx.req.set_header(\"X-User-Id\", obj.payload.sub or \"\"); ngx.req.set_header(\"X-User-Roles\", type(obj.payload.roles)==\"table\" and table.concat(obj.payload.roles, \",\") or (obj.payload.roles or \"\")); ngx.req.set_header(\"X-User-Email\", obj.payload.email or \"\"); ngx.req.set_header(\"X-User-Name\", obj.payload.name or \"\") end end end"
        ]
      }
    }
  }' > /dev/null

# --- Appeals service route ---
curl -sf -X PUT "$ADMIN/routes/appeals-svc" \
  -H "X-API-KEY: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "/api/v1/appeals/*",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "appeals-svc:8000": 1 }
    },
    "plugins": {
      "openid-connect": {
        "discovery": "'"$KC/.well-known/openid-configuration"'",
        "bearer_only": true,
        "set_id_token_header": false,
        "set_access_token_header": false,
        "set_userinfo_header": false
      },
      "serverless-pre-function": {
        "phase": "access",
        "functions": [
          "return function(conf, ctx) local jwt = require(\"resty.jwt\"); local token = ngx.var.http_authorization and ngx.var.http_authorization:match(\"Bearer%s+(.+)\"); if token then local obj = jwt:load_jwt(token); if obj and obj.payload then ngx.req.set_header(\"X-Tenant-Id\", obj.payload.tenant_id or \"\"); ngx.req.set_header(\"X-User-Id\", obj.payload.sub or \"\"); ngx.req.set_header(\"X-User-Roles\", type(obj.payload.roles)==\"table\" and table.concat(obj.payload.roles, \",\") or (obj.payload.roles or \"\")); ngx.req.set_header(\"X-User-Email\", obj.payload.email or \"\"); ngx.req.set_header(\"X-User-Name\", obj.payload.name or \"\") end end end"
        ]
      }
    }
  }' > /dev/null

# --- Audit service route (auditor read-only) ---
curl -sf -X PUT "$ADMIN/routes/audit-svc" \
  -H "X-API-KEY: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "/api/v1/audit/*",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "audit-svc:8000": 1 }
    },
    "plugins": {
      "openid-connect": {
        "discovery": "'"$KC/.well-known/openid-configuration"'",
        "bearer_only": true,
        "set_id_token_header": false,
        "set_access_token_header": false,
        "set_userinfo_header": false
      },
      "serverless-pre-function": {
        "phase": "access",
        "functions": [
          "return function(conf, ctx) local jwt = require(\"resty.jwt\"); local token = ngx.var.http_authorization and ngx.var.http_authorization:match(\"Bearer%s+(.+)\"); if token then local obj = jwt:load_jwt(token); if obj and obj.payload then ngx.req.set_header(\"X-Tenant-Id\", obj.payload.tenant_id or \"\"); ngx.req.set_header(\"X-User-Id\", obj.payload.sub or \"\"); ngx.req.set_header(\"X-User-Roles\", type(obj.payload.roles)==\"table\" and table.concat(obj.payload.roles, \",\") or (obj.payload.roles or \"\")); ngx.req.set_header(\"X-User-Email\", obj.payload.email or \"\"); ngx.req.set_header(\"X-User-Name\", obj.payload.name or \"\") end end end"
        ]
      }
    }
  }' > /dev/null

echo "APISIX routes bootstrapped."
