package com.claimshield.core;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Request/response shapes the batch and merge pages depend on. */
class BatchAndMergeTest extends ApiTestSupport {

    @Test
    void batchTransitionAcceptsNewStatusAndReportsCounts() throws Exception {
        String a = createClaim("Aetna", "CO-50", 1_000);
        String b = createClaim("Aetna", "CO-50", 2_000);

        mvc.perform(withBody(as(post("/api/v1/claims/batch-transition"), BILLER, "biller"),
                        Map.of("claim_ids", List.of(a, b), "new_status", "in_progress")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transitioned").value(2))
                .andExpect(jsonPath("$.failed").value(0))
                .andExpect(jsonPath("$.results[0].success").value(true));

        mvc.perform(as(get("/api/v1/claims/" + a), BILLER, "biller")).andExpect(jsonPath("$.status").value("in_progress"));
    }

    @Test
    void batchTransitionRejectsInvalidMovesAndAcceptsLegacyStatusKey() throws Exception {
        String a = createClaim("Cigna", "CO-4", 1_000);

        mvc.perform(withBody(as(post("/api/v1/claims/batch-transition"), BILLER, "biller"),
                        Map.of("claim_ids", List.of(a, "missing-id"), "new_status", "won")))
                .andExpect(jsonPath("$.transitioned").value(0))
                .andExpect(jsonPath("$.failed").value(2))
                .andExpect(jsonPath("$.errors[0].error").value("cannot transition from pending_review to won"));

        mvc.perform(withBody(as(post("/api/v1/claims/batch-transition"), BILLER, "biller"),
                        Map.of("claim_ids", List.of(a), "status", "cancelled")))
                .andExpect(jsonPath("$.transitioned").value(1));
    }

    @Test
    void mergeAbsorbsSecondariesAndCancelsThem() throws Exception {
        String primary = createClaim("Aetna", "CO-50", 1_000);
        String secondary = createClaim("Aetna", "CO-50", 1_000);
        mvc.perform(withBody(as(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/claims/" + secondary), BILLER, "biller"),
                Map.of("raw_clinical_notes", "Secondary-only notes")));

        mvc.perform(withBody(as(post("/api/v1/claims/merge"), BILLER, "biller"),
                        Map.of("primary_claim_id", primary, "secondary_claim_ids", List.of(secondary))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.primary_id").value(primary))
                .andExpect(jsonPath("$.merged_count").value(1));

        mvc.perform(as(get("/api/v1/claims/" + secondary), BILLER, "biller")).andExpect(jsonPath("$.status").value("cancelled"));
        JsonNode merged = read(mvc.perform(as(get("/api/v1/claims/" + primary), BILLER, "biller")));
        assertThat(merged.get("raw_clinical_notes").asText()).contains("--- merged from").contains("Secondary-only notes");

        JsonNode notes = read(mvc.perform(as(get("/api/v1/claims/" + secondary + "/notes"), BILLER, "biller")));
        assertThat(notes.toString()).contains("Merged into");
    }

    @Test
    void mergeWithUnknownPrimaryIs404() throws Exception {
        mvc.perform(withBody(as(post("/api/v1/claims/merge"), BILLER, "biller"),
                        Map.of("primary_claim_id", "nope", "secondary_claim_ids", List.of())))
                .andExpect(status().isNotFound());
    }
}
