"""Core multi-tenant schema with RLS, integer cents, outbox, and audit trail.

Revision ID: 0001
Revises: None
Create Date: 2026-10-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS \"vector\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"")

    # --- RLS helper: session variable for current tenant ---
    # Services call SET LOCAL app.current_tenant_id = '<uuid>' after begin.
    # RLS policies use current_setting('app.current_tenant_id').

    # --- Tenants ---
    op.create_table(
        "tenants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("slug", sa.String(63), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # --- Clinics (belong to a tenant) ---
    op.create_table(
        "clinics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("npi", sa.String(10), nullable=True),
        sa.Column("tax_id", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_clinics_tenant_id", "clinics", ["tenant_id"])

    # --- Claims (integer cents for money) ---
    op.create_table(
        "claims",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("clinic_id", UUID(as_uuid=True), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), nullable=True),
        sa.Column("claim_number", sa.String(50), nullable=True),
        sa.Column("payer_name", sa.Text(), nullable=True),
        sa.Column("denial_code", sa.String(20), nullable=True),
        sa.Column("denial_reason", sa.Text(), nullable=True),
        sa.Column("raw_denial_text", sa.Text(), nullable=False),
        sa.Column("raw_clinical_notes", sa.Text(), nullable=False),
        sa.Column("amount_denied_cents", sa.BigInteger(), nullable=True),
        sa.Column("amount_approved_cents", sa.BigInteger(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'pending_review'")),
        sa.Column("reviewed_by", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('pending_review','in_progress','needs_review','approved','sent','won','lost','cancelled')",
            name="ck_claims_status",
        ),
    )
    op.create_index("ix_claims_tenant_id", "claims", ["tenant_id"])
    op.create_index("ix_claims_clinic_id", "claims", ["clinic_id"])
    op.create_index("ix_claims_status", "claims", ["status"])

    # --- Appeals ---
    op.create_table(
        "appeals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("claim_id", UUID(as_uuid=True), sa.ForeignKey("claims.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("letter_text", sa.Text(), nullable=True),
        sa.Column("policy_evidence", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("approved_by", sa.Text(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_appeals_tenant_id", "appeals", ["tenant_id"])
    op.create_index("ix_appeals_claim_id", "appeals", ["claim_id"])

    # --- Policy clauses (RAG with pgvector) ---
    op.create_table(
        "policy_clauses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("payer_name", sa.Text(), nullable=False),
        sa.Column("denial_code", sa.String(20), nullable=True),
        sa.Column("clause_text", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_policy_clauses_tenant_id", "policy_clauses", ["tenant_id"])
    # pgvector embedding column added via raw SQL (Alembic doesn't natively handle vector type)
    op.execute("ALTER TABLE policy_clauses ADD COLUMN embedding vector(1536)")
    op.execute(
        "CREATE INDEX ix_policy_clauses_embedding ON policy_clauses "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    # --- Transactional outbox (Debezium CDC) ---
    op.create_table(
        "outbox",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("aggregatetype", sa.String(255), nullable=False),
        sa.Column("aggregateid", sa.String(255), nullable=False),
        sa.Column("type", sa.String(255), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # --- Append-only hash-chained audit log ---
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=False),
        sa.Column("actor_role", sa.String(50), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("detail", JSONB(), nullable=True),
        sa.Column("prev_hash", sa.String(64), nullable=True),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_audit_log_tenant_id", "audit_log", ["tenant_id"])
    op.create_index("ix_audit_log_resource", "audit_log", ["resource_type", "resource_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])

    # --- Row-Level Security policies ---
    for table in ("clinics", "claims", "appeals", "policy_clauses"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id::text = current_setting('app.current_tenant_id', true))"
        )

    # Audit log: RLS read-only (tenants can read their own rows, writes go through the service)
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_log FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON audit_log "
        "FOR SELECT USING (tenant_id::text = current_setting('app.current_tenant_id', true))"
    )
    # Audit inserts bypass RLS — the audit service writes with a privileged role
    op.execute(
        "CREATE POLICY audit_insert ON audit_log "
        "FOR INSERT WITH CHECK (true)"
    )


def downgrade() -> None:
    for table in ("clinics", "claims", "appeals", "policy_clauses", "audit_log"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    op.execute("DROP POLICY IF EXISTS audit_insert ON audit_log")

    op.drop_table("audit_log")
    op.drop_table("outbox")
    op.drop_table("policy_clauses")
    op.drop_table("appeals")
    op.drop_table("claims")
    op.drop_table("clinics")
    op.drop_table("tenants")
