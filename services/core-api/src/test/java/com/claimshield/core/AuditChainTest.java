package com.claimshield.core;

import com.claimshield.core.model.AuditLog;
import com.claimshield.core.repository.AuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.annotation.DirtiesContext;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Hash-chained audit: /audit/verify must catch both broken links and edited entries. */
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AuditChainTest extends ApiTestSupport {

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Test
    void chainIsValidAfterApiWritesAndDetectsTampering() throws Exception {
        createClaim("Aetna", "CO-50", 10_000);
        createClaim("Cigna", "CO-4", 20_000);

        mvc.perform(as(get("/api/v1/audit/verify?limit=1000"), BILLER, "biller"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chain_valid").value(true));

        List<AuditLog> entries = auditLogRepository.findByTenantIdOrderByCreatedAtAsc(TENANT);
        AuditLog victim = entries.get(entries.size() - 1);
        victim.setDetail("{\"tampered\":true}");
        auditLogRepository.save(victim);

        mvc.perform(as(get("/api/v1/audit/verify?limit=1000"), BILLER, "biller"))
                .andExpect(jsonPath("$.chain_valid").value(false))
                .andExpect(jsonPath("$.broken_at_id").value(victim.getId()))
                .andExpect(jsonPath("$.reason").value("entry_hash_mismatch"));
    }
}
