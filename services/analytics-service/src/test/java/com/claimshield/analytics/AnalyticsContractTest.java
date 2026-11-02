package com.claimshield.analytics;

import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.repository.ClaimRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** analytics-service is read-only over the shared DB; these pin the response shapes dashboard pages render. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AnalyticsContractTest {

    private static final String TENANT = "00000000-0000-0000-0000-000000000001";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private ClaimRepository claimRepository;

    @BeforeEach
    void seedClaims() {
        claimRepository.deleteAll();
        claimRepository.save(claim("Cigna", "CO-4", 10_000));
        claimRepository.save(claim("Cigna", "CO-4", 20_000));
        claimRepository.save(claim("Cigna", "CO-16", 5_000));
        claimRepository.save(claim("Aetna", "CO-50", 40_000));
    }

    @Test
    void payerPerformanceIncludesTopDenialCodes() throws Exception {
        JsonNode payers = read("/api/v1/analytics/payer-performance");
        JsonNode cigna = find(payers, "Cigna");

        assertThat(cigna.get("total_claims").asInt()).isEqualTo(3);
        assertThat(cigna.get("total_denied_cents").asLong()).isEqualTo(35_000);
        assertThat(cigna.get("top_denial_codes").get(0).get("code").asText()).isEqualTo("CO-4");
        assertThat(cigna.get("top_denial_codes").get(0).get("count").asInt()).isEqualTo(2);
        assertThat(cigna.has("_denial_codes")).as("internal accumulator must not leak").isFalse();
        assertThat(payers.get(0).get("payer").asText()).as("sorted by denied cents desc").isEqualTo("Aetna");
    }

    @Test
    void statsCountsTenantClaims() throws Exception {
        JsonNode stats = read("/api/v1/stats");
        assertThat(stats.get("claims_total").asInt()).isEqualTo(4);
    }

    private JsonNode read(String path) throws Exception {
        String body = mvc.perform(get(path).header("X-Tenant-Id", TENANT))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private JsonNode find(JsonNode payers, String name) {
        for (JsonNode p : payers) if (name.equals(p.get("payer").asText())) return p;
        throw new AssertionError("payer not found: " + name);
    }

    private Claim claim(String payer, String code, long deniedCents) {
        Claim c = new Claim();
        c.setId(UUID.randomUUID().toString());
        c.setTenantId(TENANT);
        c.setPayer(payer);
        c.setDenialCode(code);
        c.setAmountDeniedCents(deniedCents);
        c.setStatus("pending_review");
        c.setCreatedAt(LocalDateTime.now());
        return c;
    }
}
