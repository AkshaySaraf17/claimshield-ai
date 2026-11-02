-- routing_rules belongs to workflow-service; core-api only reads it, so tests create it themselves
CREATE TABLE IF NOT EXISTS routing_rules (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    match_field VARCHAR(50),
    match_operator VARCHAR(20),
    match_value VARCHAR(255),
    match_payer VARCHAR(255),
    match_denial_code VARCHAR(20),
    min_amount_cents BIGINT,
    max_amount_cents BIGINT,
    assign_to VARCHAR(36) NOT NULL,
    priority INT NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL
);
DELETE FROM routing_rules;
INSERT INTO routing_rules (id, tenant_id, name, match_payer, min_amount_cents, assign_to, priority, is_active, created_at)
VALUES ('rule-specific', '00000000-0000-0000-0000-000000000001', 'Big Cigna to Lisa', 'Cigna', 100000, 'dev-user-004', 200, TRUE, CURRENT_TIMESTAMP);
INSERT INTO routing_rules (id, tenant_id, name, match_field, match_operator, match_value, assign_to, priority, is_active, created_at)
VALUES ('rule-generic', '00000000-0000-0000-0000-000000000001', 'Any Cigna to Sarah', 'payer', 'equals', 'Cigna', 'dev-user-002', 100, TRUE, CURRENT_TIMESTAMP);
