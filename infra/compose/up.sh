#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV="${1:-dev}"

case "$ENV" in
  dev)
    docker compose -f "$SCRIPT_DIR/dev.yml" --env-file "$SCRIPT_DIR/.env.dev" up -d
    echo ""
    echo "Dev stack is starting. Services:"
    echo "  Postgres:  localhost:5432"
    echo "  Valkey:    localhost:6379"
    echo "  Kafka:     localhost:9094"
    echo "  Keycloak:  http://localhost:8080 (admin/admin)"
    echo "  Traefik:   http://localhost:80 (dashboard: http://localhost:8081)"
    echo "  Debezium:  http://localhost:8083"
    ;;
  test)
    docker compose -p cs-test -f "$SCRIPT_DIR/test.yml" up -d
    echo ""
    echo "Test stack is starting. Services:"
    echo "  Postgres:  localhost:5433"
    echo "  Valkey:    localhost:6380"
    echo "  Kafka:     localhost:9095"
    echo "  Keycloak:  http://localhost:8082"
    ;;
  down)
    docker compose -f "$SCRIPT_DIR/dev.yml" --env-file "$SCRIPT_DIR/.env.dev" down
    docker compose -p cs-test -f "$SCRIPT_DIR/test.yml" down 2>/dev/null || true
    echo "All stacks stopped."
    ;;
  *)
    echo "Usage: $0 [dev|test|down]"
    exit 1
    ;;
esac
