package com.claimshield.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Request/response shapes the routing, template and notification pages depend on. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkflowContractTest {

    private static final String TENANT = "00000000-0000-0000-0000-000000000001";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    private MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String userId) {
        return request.header("X-Tenant-Id", TENANT).header("X-User-Id", userId);
    }

    private MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder request, Object body) throws Exception {
        return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }

    private JsonNode read(MockHttpServletRequestBuilder request) throws Exception {
        return json.readTree(mvc.perform(request).andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    void notificationPreferencesAreAFlatMapWithDefaultsAndPersistPerUser() throws Exception {
        JsonNode defaults = read(as(get("/api/v1/notifications/preferences"), "notif-user"));
        assertThat(defaults.size()).isEqualTo(6);
        assertThat(defaults.get("notif_escalation").asText()).isEqualTo("true");

        mvc.perform(withBody(as(put("/api/v1/notifications/preferences"), "notif-user"),
                        Map.of("notif_escalation", "false", "unrelated_key", "x")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notif_escalation").value("false"))
                .andExpect(jsonPath("$.unrelated_key").doesNotExist());

        JsonNode otherUser = read(as(get("/api/v1/notifications/preferences"), "someone-else"));
        assertThat(otherUser.get("notif_escalation").asText()).isEqualTo("true");
    }

    @Test
    void routingRuleWithSpecificConditionsRoundTrips() throws Exception {
        JsonNode created = read(withBody(as(post("/api/v1/routing-rules"), "dev-user-001"), Map.of(
                "name", "Big Cigna", "priority", 150, "assign_to", "dev-user-004",
                "match_payer", "Cigna", "match_denial_code", " ", "min_amount_cents", 100_000)));

        assertThat(created.get("match_payer").asText()).isEqualTo("Cigna");
        assertThat(created.get("match_denial_code").isNull()).as("blank condition stored as null").isTrue();
        assertThat(created.get("min_amount_cents").asLong()).isEqualTo(100_000);
        assertThat(created.get("match_field").isNull()).isTrue();
        assertThat(created.get("assign_to_name").asText()).isEqualTo("Lisa Park");

        mvc.perform(as(delete("/api/v1/routing-rules/" + created.get("id").asText()), "dev-user-001"))
                .andExpect(status().isNoContent());
    }

    @Test
    void customTemplateKeepsSectionsAndSource() throws Exception {
        JsonNode created = read(withBody(as(post("/api/v1/custom-templates"), "dev-user-001"), Map.of(
                "name", "Coding appeal", "category", "Coding",
                "sections", List.of("patient_info", "coding_rationale", "closing"),
                "source", "AMA CPT Guidelines")));

        assertThat(created.get("sections").toString()).isEqualTo("[\"patient_info\",\"coding_rationale\",\"closing\"]");
        assertThat(created.get("source").asText()).isEqualTo("AMA CPT Guidelines");

        JsonNode seeded = read(as(get("/api/v1/custom-templates"), "dev-user-001"));
        for (JsonNode t : seeded) {
            assertThat(t.get("sections").isArray()).as("sections on %s", t.get("name")).isTrue();
        }

        mvc.perform(as(delete("/api/v1/custom-templates/" + created.get("id").asText()), "dev-user-001"))
                .andExpect(status().isNoContent());
    }
}
