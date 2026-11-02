package com.claimshield.core;

import com.claimshield.core.service.ReferenceDataService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Port of tests/test_claims_schemas.py (the Python claims service's status machine tests), plus the API behaviour. */
class ClaimStatusMachineTest extends ApiTestSupport {

    private static final Map<String, Set<String>> T = ReferenceDataService.ALLOWED_TRANSITIONS;

    @Test
    void allStatusesHaveTransitions() {
        assertThat(T.keySet()).containsExactlyInAnyOrder(
                "pending_review", "in_progress", "needs_review", "approved", "sent", "won", "lost", "cancelled");
    }

    @Test
    void terminalStatesHaveNoTransitions() {
        assertThat(T.get("won")).isEmpty();
        assertThat(T.get("cancelled")).isEmpty();
    }

    @Test
    void validForwardFlow() {
        List<String> flow = List.of("pending_review", "in_progress", "needs_review", "approved", "sent", "won");
        for (int i = 0; i < flow.size() - 1; i++) {
            assertThat(T.get(flow.get(i))).as("%s -> %s", flow.get(i), flow.get(i + 1)).contains(flow.get(i + 1));
        }
    }

    @Test
    void cancelledReachableFromMostStates() {
        for (String s : List.of("pending_review", "in_progress", "needs_review", "approved")) {
            assertThat(T.get(s)).as(s).contains("cancelled");
        }
    }

    @Test
    void lostCanRetry() {
        assertThat(T.get("lost")).contains("in_progress");
    }

    @Test
    void createClaimWithAmountAndNoPatient() throws Exception {
        mvc.perform(withBody(as(post("/api/v1/claims"), BILLER, "biller"), Map.of(
                        "payer_name", "Aetna", "raw_denial_text", "Denied for medical necessity",
                        "raw_clinical_notes", "Patient presented with...", "amount_denied_cents", 150_000)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.amount_denied_cents").value(150_000))
                .andExpect(jsonPath("$.patient_id").isEmpty())
                .andExpect(jsonPath("$.status").value("pending_review"));
    }

    @Test
    void apiWalksTheForwardFlowAndRejectsSkippingAhead() throws Exception {
        String id = createClaim("Aetna", "CO-50", 1_000);
        mvc.perform(withBody(as(patch("/api/v1/claims/" + id + "/status"), BILLER, "biller"), Map.of("status", "won")))
                .andExpect(status().isConflict());

        for (String next : List.of("in_progress", "needs_review", "approved", "sent", "won")) {
            mvc.perform(withBody(as(patch("/api/v1/claims/" + id + "/status"), BILLER, "biller"), Map.of("status", next)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value(next));
        }
        mvc.perform(as(get("/api/v1/claims/" + id + "/status-history"), BILLER, "biller"))
                .andExpect(jsonPath("$.length()").value(5));
    }
}
