package com.claimshield.core.service;

import com.claimshield.core.model.Claim;

import java.util.LinkedHashMap;
import java.util.Map;

/** Serializes a Claim to the snake_case shape the frontend expects (mirrors Python _claim_dict). */
public final class ClaimMapper {

    private ClaimMapper() {}

    public static Map<String, Object> toMap(Claim c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("tenant_id", c.getTenantId());
        m.put("claim_number", c.getClaimNumber());
        m.put("patient_name", c.getPatientName());
        m.put("patient_id", c.getPatientId());
        m.put("payer_name", c.getPayer());
        m.put("denial_code", c.getDenialCode());
        m.put("denial_reason", c.getDenialReason());
        m.put("raw_denial_text", c.getRawDenialText());
        m.put("raw_clinical_notes", c.getRawClinicalNotes());
        m.put("amount_denied_cents", c.getAmountDeniedCents());
        m.put("amount_recovered_cents", c.getAmountRecoveredCents());
        m.put("amount_approved_cents", c.getAmountApprovedCents());
        m.put("status", c.getStatus());
        m.put("reviewed_by", c.getReviewedBy());
        m.put("reviewed_at", c.getReviewedAt() != null ? c.getReviewedAt().toString() : null);
        m.put("filing_deadline", c.getFilingDeadline() != null ? c.getFilingDeadline().toString() : null);
        m.put("assigned_to", c.getAssignedTo());
        m.put("clinic_id", c.getClinicId());
        m.put("clinic_name", c.getClinicName());
        m.put("created_by", c.getCreatedBy());
        m.put("created_at", c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);
        m.put("updated_at", c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null);
        return m;
    }
}
