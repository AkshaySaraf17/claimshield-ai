package com.claimshield.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Shared setup for core-api contract tests: full app on an in-memory DB, called the way the Next.js proxy calls it. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class ApiTestSupport {

    protected static final String TENANT = "00000000-0000-0000-0000-000000000001";
    protected static final String BILLER = "dev-user-001";
    protected static final String REVIEWER = "dev-user-003";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    /** Adds the identity headers the frontend proxy forwards from the signed-in session. */
    protected MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String userId, String roles) {
        request.header("X-Tenant-Id", TENANT).header("X-User-Id", userId);
        if (roles != null) request.header("X-User-Roles", roles);
        return request;
    }

    protected MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder request, Object body) throws Exception {
        return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }

    protected JsonNode read(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    /** Creates a claim through the API with the same body shape the dashboard sends; returns its id. */
    protected String createClaim(String payer, String denialCode, long amountDeniedCents) throws Exception {
        JsonNode created = read(mvc.perform(withBody(as(post("/api/v1/claims"), BILLER, "biller"), Map.of(
                "payer_name", payer,
                "denial_code", denialCode,
                "denial_reason", "test",
                "amount_denied_cents", amountDeniedCents,
                "raw_clinical_notes", "Synthetic notes long enough to count as clinical documentation for tests."
        ))).andExpect(status().isCreated()));
        return created.get("id").asText();
    }
}
