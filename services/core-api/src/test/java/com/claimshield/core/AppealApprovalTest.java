package com.claimshield.core;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** "Nothing sent without server-enforced human approval": approve needs a reviewer role, send needs approval. */
class AppealApprovalTest extends ApiTestSupport {

    private String draftAppeal() throws Exception {
        String claimId = createClaim("Aetna", "CO-50", 120_000);
        JsonNode appeal = read(mvc.perform(withBody(as(post("/api/v1/appeals"), BILLER, "biller"),
                Map.of("claim_id", claimId, "letter_text", "Draft letter", "confidence", 0.7)))
                .andExpect(status().isOk()));
        assertThat(appeal.get("needs_review").asBoolean()).isTrue();
        assertThat(appeal.get("letter_text").asText()).isEqualTo("Draft letter");
        return appeal.get("id").asText();
    }

    @Test
    void unapprovedAppealCannotBeSent() throws Exception {
        String appealId = draftAppeal();
        mvc.perform(as(patch("/api/v1/appeals/" + appealId + "/send"), REVIEWER, "manager"))
                .andExpect(status().isConflict());
    }

    @Test
    void billerAndAnonymousCannotApprove() throws Exception {
        String appealId = draftAppeal();
        mvc.perform(withBody(as(patch("/api/v1/appeals/" + appealId + "/approve"), BILLER, "biller"), Map.of()))
                .andExpect(status().isForbidden());
        mvc.perform(withBody(as(patch("/api/v1/appeals/" + appealId + "/approve"), BILLER, null), Map.of()))
                .andExpect(status().isForbidden());

        mvc.perform(as(get("/api/v1/appeals/" + appealId), BILLER, "biller"))
                .andExpect(jsonPath("$.needs_review").value(true));
    }

    @Test
    void reviewerApprovesAsThemselvesThenAppealCanBeSentOnce() throws Exception {
        String appealId = draftAppeal();

        // approved_by in the body is ignored: the approver is always the authenticated caller
        mvc.perform(withBody(as(patch("/api/v1/appeals/" + appealId + "/approve"), REVIEWER, "user, Reviewer"),
                        Map.of("approved_by", "dev-user-004")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved_by").value(REVIEWER))
                .andExpect(jsonPath("$.needs_review").value(false));

        mvc.perform(withBody(as(patch("/api/v1/appeals/" + appealId + "/approve"), REVIEWER, "reviewer"), Map.of()))
                .andExpect(status().isConflict());

        mvc.perform(as(patch("/api/v1/appeals/" + appealId + "/send"), REVIEWER, "reviewer"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("sent"));
    }
}
