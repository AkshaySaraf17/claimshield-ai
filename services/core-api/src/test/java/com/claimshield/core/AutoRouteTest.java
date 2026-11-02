package com.claimshield.core;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.jdbc.Sql;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Auto-route reads workflow-service's routing_rules: highest priority wins, every condition a rule sets must hold. */
@Sql("/routing-rules.sql")
class AutoRouteTest extends ApiTestSupport {

    @Test
    void specificRuleWinsWhenAllItsConditionsMatch() throws Exception {
        String id = createClaim("Cigna", "CO-4", 150_000);
        mvc.perform(as(post("/api/v1/claims/" + id + "/auto-route"), BILLER, "biller"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.routed").value(true))
                .andExpect(jsonPath("$.rule_name").value("Big Cigna to Lisa"))
                .andExpect(jsonPath("$.assigned_to").value("dev-user-004"))
                .andExpect(jsonPath("$.assigned_to_name").value("Lisa Park"));
    }

    @Test
    void fallsThroughToGenericRuleWhenAmountIsBelowMinimum() throws Exception {
        String id = createClaim("Cigna", "CO-4", 5_000);
        mvc.perform(as(post("/api/v1/claims/" + id + "/auto-route"), BILLER, "biller"))
                .andExpect(jsonPath("$.rule_name").value("Any Cigna to Sarah"))
                .andExpect(jsonPath("$.assigned_to").value("dev-user-002"));
    }

    @Test
    void noMatchingRuleIsReported() throws Exception {
        String id = createClaim("Aetna", "CO-50", 5_000);
        mvc.perform(as(post("/api/v1/claims/" + id + "/auto-route"), BILLER, "biller"))
                .andExpect(jsonPath("$.routed").value(false));
    }
}
