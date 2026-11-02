package com.claimshield.core;

import com.claimshield.core.service.Edi835ParserServiceTestFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The /edi835 contract the dashboard Import page uses (request field raw_edi; response keys it renders). */
class Edi835ApiTest extends ApiTestSupport {

    private static final String SAMPLE = Edi835ParserServiceTestFixtures.SAMPLE_835;

    @Test
    void parseAcceptsRawEdiAndReturnsPageFields() throws Exception {
        mvc.perform(withBody(as(post("/api/v1/edi835/parse"), BILLER, "biller"), Map.of("raw_edi", SAMPLE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payer_name").value("Aetna Insurance"))
                .andExpect(jsonPath("$.check_number").value("TRACE123"))
                .andExpect(jsonPath("$.check_date").value("2023-10-15"))
                .andExpect(jsonPath("$.claims_found").value(1))
                .andExpect(jsonPath("$.claims[0].claim_id").value("CLM-001"))
                .andExpect(jsonPath("$.claims[0].denial_codes_all[1]").value("CO-97"))
                .andExpect(jsonPath("$.errors").isArray());
    }

    @Test
    void parseStillAcceptsLegacyContentField() throws Exception {
        mvc.perform(withBody(as(post("/api/v1/edi835/parse"), BILLER, "biller"), Map.of("content", SAMPLE)))
                .andExpect(jsonPath("$.claims_found").value(1));
    }

    @Test
    void importCreatesWorkableClaims() throws Exception {
        JsonNode result = read(mvc.perform(withBody(as(post("/api/v1/edi835/import"), BILLER, "biller"),
                Map.of("raw_edi", SAMPLE))).andExpect(status().isCreated()));

        assertThat(result.get("imported").asInt()).isEqualTo(1);
        assertThat(result.get("payer_name").asText()).isEqualTo("Aetna Insurance");
        String id = result.get("claim_ids").get(0).asText();

        JsonNode claim = read(mvc.perform(as(get("/api/v1/claims/" + id), BILLER, "biller")));
        assertThat(claim.get("status").asText()).isEqualTo("pending_review");
        assertThat(claim.get("claim_number").asText()).isEqualTo("CLM-001");
        assertThat(claim.get("denial_code").asText()).isEqualTo("CO-50");
        assertThat(claim.get("denial_reason").asText()).isEqualTo("CO-50: $100.00; CO-97: $200.00");
        assertThat(claim.get("amount_denied_cents").asLong()).isEqualTo(50_000);
        assertThat(claim.get("raw_denial_text").asText()).contains("EDI 835 Remittance").contains("Denied: $500.00");
        assertThat(claim.get("filing_deadline").isNull()).isFalse();

        // an imported claim must be able to move through the normal workflow
        mvc.perform(withBody(as(patch("/api/v1/claims/" + id + "/status"), BILLER, "biller"), Map.of("status", "in_progress")))
                .andExpect(status().isOk());
    }

    @Test
    void emptyInputParsesToNoClaims() throws Exception {
        mvc.perform(withBody(as(post("/api/v1/edi835/parse"), BILLER, "biller"), Map.of("raw_edi", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.claims_found").value(0));
    }
}
