package com.claimshield.core;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The dashboard reads snake_case keys and payer_name; camelCase anywhere would render blank fields. */
class ClaimJsonContractTest extends ApiTestSupport {

    @Test
    void claimListUsesSnakeCaseAndPayerName() throws Exception {
        createClaim("Humana", "PR-1", 5_000);
        JsonNode claims = read(mvc.perform(as(get("/api/v1/claims"), BILLER, "biller")).andExpect(status().isOk()));

        assertThat(claims.isArray()).isTrue();
        for (JsonNode claim : claims) {
            assertThat(claim.has("payer_name")).as("payer_name in %s", claim).isTrue();
            assertThat(claim.has("amount_denied_cents")).isTrue();
            assertThat(camelCaseKeys(claim)).as("camelCase keys").isEmpty();
        }
    }

    @Test
    void claimDetailIncludesAllowedTransitions() throws Exception {
        String id = createClaim("Aetna", "CO-50", 5_000);
        mvc.perform(as(get("/api/v1/claims/" + id), BILLER, "biller"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payer_name").value("Aetna"))
                .andExpect(jsonPath("$.allowed_transitions[0]").value("cancelled"))
                .andExpect(jsonPath("$.allowed_transitions[1]").value("in_progress"));
    }

    @Test
    void createAcceptsLegacyPayerKey() throws Exception {
        mvc.perform(withBody(as(post("/api/v1/claims"), BILLER, "biller"),
                        Map.of("payer", "Medicare", "denial_code", "CO-16", "amount_denied_cents", 900)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.payer_name").value("Medicare"))
                .andExpect(jsonPath("$.amount_denied_cents").value(900));
    }

    private List<String> camelCaseKeys(JsonNode node) {
        List<String> found = new ArrayList<>();
        node.fieldNames().forEachRemaining(k -> { if (k.matches(".*[a-z][A-Z].*")) found.add(k); });
        return found;
    }
}
