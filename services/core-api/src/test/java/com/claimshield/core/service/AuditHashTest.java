package com.claimshield.core.service;

import com.claimshield.core.model.AuditLog;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Port of tests/test_audit_hasher.py (the Python audit service's hash-chain tests) against AuditService.computeHash.
 * Difference from Python: the Java hash does not cover the timestamp, so there is no timestamp input here.
 */
class AuditHashTest {

    private final AuditService audit = new AuditService(null);

    private AuditLog entry(String prevHash, String tenant, String action, String detail) {
        AuditLog e = new AuditLog();
        e.setPrevHash(prevHash);
        e.setTenantId(tenant);
        e.setActorId("actor1");
        e.setAction(action);
        e.setResourceType("claim");
        e.setResourceId("c1");
        e.setDetail(detail);
        return e;
    }

    @Test
    void hashIsDeterministicSha256() {
        String h1 = audit.computeHash(entry("GENESIS", "t1", "create", null));
        String h2 = audit.computeHash(entry("GENESIS", "t1", "create", null));
        assertThat(h1).isEqualTo(h2).hasSize(64).matches("[0-9a-f]{64}");
    }

    @Test
    void chainedEntryHashesDiffer() {
        String h1 = audit.computeHash(entry("GENESIS", "t1", "create", null));
        String h2 = audit.computeHash(entry(h1, "t1", "update", "{\"status\":\"approved\"}"));
        assertThat(h2).isNotEqualTo(h1).hasSize(64);
    }

    @Test
    void differentTenantGivesDifferentHash() {
        assertThat(audit.computeHash(entry("GENESIS", "t1", "create", null)))
                .isNotEqualTo(audit.computeHash(entry("GENESIS", "t2", "create", null)));
    }

    @Test
    void tamperingWithAnEarlierEntryChangesEveryLaterHash() {
        String h1 = audit.computeHash(entry("GENESIS", "t1", "create", null));
        String h2 = audit.computeHash(entry(h1, "t1", "update", null));

        String h1Tampered = audit.computeHash(entry("GENESIS", "t1", "delete", null));
        String h2Rederived = audit.computeHash(entry(h1Tampered, "t1", "update", null));
        assertThat(h2Rederived).isNotEqualTo(h2);
    }
}
