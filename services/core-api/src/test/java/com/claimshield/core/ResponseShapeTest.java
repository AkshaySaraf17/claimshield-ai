package com.claimshield.core;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fields whose absence crashed dashboard pages on render. */
class ResponseShapeTest extends ApiTestSupport {

    @Test
    void preventionTipsAreGroupedByDenialCodeWithSource() throws Exception {
        createClaim("Aetna", "CO-29", 1_000);
        JsonNode groups = read(mvc.perform(as(get("/api/v1/denial-prevention-tips"), BILLER, "biller")).andExpect(status().isOk()));

        assertThat(groups.size()).isPositive();
        for (JsonNode g : groups) {
            assertThat(g.get("denial_code").asText()).isNotBlank();
            assertThat(g.get("occurrence_count").asInt()).isPositive();
            assertThat(g.get("tips").isArray()).isTrue();
            assertThat(g.get("source").asText()).isNotBlank();
        }
    }

    @Test
    void snapshotIncludesTagsCostsAndAttachmentCount() throws Exception {
        String id = createClaim("Aetna", "CO-50", 1_000);
        mvc.perform(withBody(as(post("/api/v1/claims/" + id + "/tags"), BILLER, "biller"), Map.of("tag", "urgent")));
        mvc.perform(withBody(as(post("/api/v1/claims/" + id + "/costs"), BILLER, "biller"),
                Map.of("category", "staff_time", "description", "call", "amount_cents", 2_500)));

        mvc.perform(as(get("/api/v1/claims/" + id + "/snapshot"), BILLER, "biller"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags[0]").value("urgent"))
                .andExpect(jsonPath("$.costs_total_cents").value(2_500))
                .andExpect(jsonPath("$.attachments_count").value(0));
    }

    @Test
    void deletingATagReturns204() throws Exception {
        String id = createClaim("Aetna", "CO-50", 1_000);
        JsonNode tag = read(mvc.perform(withBody(as(post("/api/v1/claims/" + id + "/tags"), BILLER, "biller"),
                Map.of("tag", "temp"))).andExpect(status().isCreated()));

        mvc.perform(as(delete("/api/v1/claims/" + id + "/tags/" + tag.get("id").asText()), BILLER, "biller"))
                .andExpect(status().isNoContent());
    }

    @Test
    void predictionIsDeterministicAndCitesItsSource() throws Exception {
        String id = createClaim("Medicare", "CO-50", 10_000);
        JsonNode first = read(mvc.perform(as(get("/api/v1/claims/" + id + "/predict"), BILLER, "biller")).andExpect(status().isOk()));
        JsonNode second = read(mvc.perform(as(get("/api/v1/claims/" + id + "/predict"), BILLER, "biller")));

        assertThat(first.get("predicted_win_probability")).isEqualTo(second.get("predicted_win_probability"));
        assertThat(first.get("source").asText()).isNotBlank();
        // CO-50 base 0.65 + Medicare 0.10 + small amount 0.05 + clinical notes 0.10 = 0.90
        assertThat(first.get("predicted_win_probability").asDouble()).isEqualTo(0.9);
    }
}
