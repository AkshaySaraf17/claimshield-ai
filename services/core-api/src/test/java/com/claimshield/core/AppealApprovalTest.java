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

    @Test
    void clientCannotCreateAnAlreadyApprovedAppeal() throws Exception {
        String claimId = createClaim("Aetna", "CO-50", 1_000);
        JsonNode appeal = read(mvc.perform(withBody(as(post("/api/v1/appeals"), BILLER, "biller"), Map.of(
                "claim_id", claimId, "letter_text", "Sneaky", "status", "approved",
                "approved_by", BILLER, "sent_via", "fax"))).andExpect(status().isOk()));

        assertThat(appeal.get("status").asText()).isEqualTo("draft");
        assertThat(appeal.get("needs_review").asBoolean()).isTrue();
        assertThat(appeal.get("approved_by").isNull()).isTrue();
        mvc.perform(as(patch("/api/v1/appeals/" + appeal.get("id").asText() + "/send"), BILLER, "biller"))
                .andExpect(status().isConflict());
    }

    @Test
    void appealVersionsIncrementPerClaimAndUnknownClaimIs404() throws Exception {
        String claimId = createClaim("Aetna", "CO-50", 1_000);
        for (int expected = 1; expected <= 3; expected++) {
            mvc.perform(withBody(as(post("/api/v1/appeals"), BILLER, "biller"),
                            Map.of("claim_id", claimId, "letter_text", "v" + expected)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.version").value(expected));
        }
        mvc.perform(withBody(as(post("/api/v1/appeals"), BILLER, "biller"),
                        Map.of("claim_id", "no-such-claim", "letter_text", "x")))
                .andExpect(status().isNotFound());
    }

    @Test
    void keycloakRoleNamesCanApprove() throws Exception {
        for (String role : new String[] {"physician_reviewer", "clinic_admin", "platform_admin"}) {
            String appealId = draftAppeal();
            mvc.perform(withBody(as(patch("/api/v1/appeals/" + appealId + "/approve"), REVIEWER, role), Map.of()))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void highConfidenceDraftStillNeedsReview() throws Exception {
        // port of test_appeals_schemas.py: needs_review always starts true regardless of confidence
        String claimId = createClaim("Aetna", "CO-50", 1_000);
        mvc.perform(withBody(as(post("/api/v1/appeals"), BILLER, "biller"),
                        Map.of("claim_id", claimId, "letter_text", "Dear Payer...", "confidence", 0.99)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.letter_text").value("Dear Payer..."))
                .andExpect(jsonPath("$.confidence").value(0.99))
                .andExpect(jsonPath("$.needs_review").value(true));
    }
}
