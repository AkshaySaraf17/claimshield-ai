package com.claimshield.core;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The /api/v1/rules/check contract the Python agent pipeline (rule_checker.py) depends on. */
class RulesEngineApiTest extends ApiTestSupport {

    @Test
    void agentRequestShapeReturnsResultsAndBlockerFlag() throws Exception {
        // rule_checker.py sends only payer_name and denial_code, with no identity headers
        mvc.perform(withBody(post("/api/v1/rules/check"), Map.of("payer_name", "Aetna", "denial_code", "CO-50")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.has_blockers").value(false))
                .andExpect(jsonPath("$.results.length()").value(2))
                .andExpect(jsonPath("$.results[0].rule_id").value("denial_code_validation"))
                .andExpect(jsonPath("$.results[0].severity").value("info"))
                .andExpect(jsonPath("$.results[0].details.category").value("medical_necessity"))
                .andExpect(jsonPath("$.results[0].source").isNotEmpty())
                .andExpect(jsonPath("$.results[1].rule_id").value("bundling_check"));
    }

    @Test
    void expiredFilingIsABlocker() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("payer_name", "Aetna");
        body.put("denial_code", "CO-29");
        body.put("date_of_service", LocalDate.now().minusDays(200).toString());
        body.put("primary_cpt", "99213");
        body.put("secondary_cpts", List.of("36415"));

        mvc.perform(withBody(post("/api/v1/rules/check"), body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.has_blockers").value(true))
                .andExpect(jsonPath("$.results[1].rule_id").value("timely_filing"))
                .andExpect(jsonPath("$.results[1].severity").value("block"))
                .andExpect(jsonPath("$.results[1].details.days_remaining").value(-110))
                .andExpect(jsonPath("$.results[2].passed").value(false))
                .andExpect(jsonPath("$.results[2].details.bundled_codes[0]").value("36415"));
    }

    @Test
    void emptyRequestStillReturnsDenialAndBundlingResults() throws Exception {
        mvc.perform(withBody(post("/api/v1/rules/check"), Map.of()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].severity").value("warn"))
                .andExpect(jsonPath("$.has_blockers").value(false));
    }
}
