package com.claimshield.core.service;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class ReferenceDataService {

    public static final Map<String, Set<String>> ALLOWED_TRANSITIONS = Map.of(
            "pending_review", Set.of("in_progress", "cancelled"),
            "in_progress", Set.of("needs_review", "cancelled"),
            "needs_review", Set.of("approved", "in_progress", "cancelled"),
            "approved", Set.of("sent", "cancelled"),
            "sent", Set.of("won", "lost"),
            "won", Set.of(),
            "lost", Set.of("in_progress"),
            "cancelled", Set.of()
    );

    public static final Map<String, Integer> PAYER_FILING_DAYS = Map.of(
            "aetna", 90,
            "unitedhealthcare", 90,
            "bcbs", 120,
            "blue cross blue shield", 120,
            "cigna", 90,
            "humana", 365,
            "medicare", 120,
            "medicaid", 365
    );

    public static final int DEFAULT_FILING_DAYS = 90;

    public static final List<String> PIPELINE_STAGES = List.of(
            "pending_review", "in_progress", "needs_review", "approved", "sent", "won", "lost", "cancelled"
    );

    public static final Map<String, String> DENIAL_CODE_TO_CATEGORY = Map.ofEntries(
            Map.entry("CO-4", "Coding"),
            Map.entry("CO-16", "Information"),
            Map.entry("CO-18", "Duplicate"),
            Map.entry("CO-29", "Timely Filing"),
            Map.entry("CO-45", "Fee Schedule"),
            Map.entry("CO-50", "Medical Necessity"),
            Map.entry("CO-97", "Bundling"),
            Map.entry("CO-109", "Coverage"),
            Map.entry("CO-197", "Authorization"),
            Map.entry("CO-204", "Coverage"),
            Map.entry("CO-236", "Coding")
    );

    private static final List<Map<String, String>> DENIAL_CODES = List.of(
            Map.of("code", "CO-4", "group", "CO", "reason", "4", "description", "The procedure code is inconsistent with the modifier used or a required modifier is missing.", "category", "Coding", "source", "CMS CARC List"),
            Map.of("code", "CO-16", "group", "CO", "reason", "16", "description", "Claim/service lacks information or has submission/billing error(s).", "category", "Information", "source", "CMS CARC List"),
            Map.of("code", "CO-18", "group", "CO", "reason", "18", "description", "Exact duplicate claim/service.", "category", "Duplicate", "source", "CMS CARC List"),
            Map.of("code", "CO-29", "group", "CO", "reason", "29", "description", "The time limit for filing has expired.", "category", "Timely Filing", "source", "CMS CARC List"),
            Map.of("code", "CO-45", "group", "CO", "reason", "45", "description", "Charge exceeds fee schedule/maximum allowable or contracted/legislated fee arrangement.", "category", "Fee Schedule", "source", "CMS CARC List"),
            Map.of("code", "CO-50", "group", "CO", "reason", "50", "description", "These are non-covered services because this is not deemed a 'medical necessity' by the payer.", "category", "Medical Necessity", "source", "CMS CARC List"),
            Map.of("code", "CO-97", "group", "CO", "reason", "97", "description", "The benefit for this service is included in the payment/allowance for another service/procedure that has already been adjudicated.", "category", "Bundling", "source", "CMS CARC List"),
            Map.of("code", "CO-109", "group", "CO", "reason", "109", "description", "Claim/service not covered by this payer/contractor. You must send the claim/service to the correct payer/contractor.", "category", "Coverage", "source", "CMS CARC List"),
            Map.of("code", "CO-197", "group", "CO", "reason", "197", "description", "Precertification/authorization/notification/pre-treatment absent.", "category", "Authorization", "source", "CMS CARC List"),
            Map.of("code", "CO-204", "group", "CO", "reason", "204", "description", "This service/equipment/drug is not covered under the patient's current benefit plan.", "category", "Coverage", "source", "CMS CARC List"),
            Map.of("code", "CO-236", "group", "CO", "reason", "236", "description", "This procedure or procedure/modifier combination is not compatible with another procedure or procedure/modifier combination provided on the same day.", "category", "Coding", "source", "CMS CARC List"),
            Map.of("code", "PR-1", "group", "PR", "reason", "1", "description", "Deductible amount.", "category", "Patient Responsibility", "source", "CMS CARC List"),
            Map.of("code", "PR-2", "group", "PR", "reason", "2", "description", "Coinsurance amount.", "category", "Patient Responsibility", "source", "CMS CARC List"),
            Map.of("code", "PR-3", "group", "PR", "reason", "3", "description", "Co-payment amount.", "category", "Patient Responsibility", "source", "CMS CARC List"),
            Map.of("code", "PR-96", "group", "PR", "reason", "96", "description", "Non-covered charge(s). At least one Remark Code must be provided.", "category", "Coverage", "source", "CMS CARC List"),
            Map.of("code", "OA-23", "group", "OA", "reason", "23", "description", "The impact of prior payer(s) adjudication including payments and/or adjustments.", "category", "Coordination of Benefits", "source", "CMS CARC List")
    );

    public record AppealTemplate(String category, List<String> sections, String source) {}

    public static final Map<String, AppealTemplate> APPEAL_TEMPLATES = Map.of(
            "Medical Necessity", new AppealTemplate("Medical Necessity",
                    List.of("patient_info", "denial_summary", "medical_necessity_argument", "clinical_evidence", "regulatory_citations", "closing"),
                    "CMS Medicare Claims Processing Manual Ch. 1 §60"),
            "Timely Filing", new AppealTemplate("Timely Filing",
                    List.of("patient_info", "denial_summary", "timely_filing_argument", "proof_of_timely_submission", "closing"),
                    "42 CFR §405.980(b)(2)"),
            "Authorization", new AppealTemplate("Authorization",
                    List.of("patient_info", "denial_summary", "authorization_argument", "auth_reference_numbers", "closing"),
                    "ERISA §503; 29 CFR §2560.503-1"),
            "Coding", new AppealTemplate("Coding",
                    List.of("patient_info", "denial_summary", "coding_correction_argument", "supporting_documentation", "closing"),
                    "AMA CPT Guidelines; CMS NCCI Policy Manual"),
            "Coverage", new AppealTemplate("Coverage",
                    List.of("patient_info", "denial_summary", "coverage_argument", "plan_documentation", "closing"),
                    "Patient's Summary of Benefits; State Insurance Code"),
            "Duplicate", new AppealTemplate("Duplicate",
                    List.of("patient_info", "denial_summary", "duplicate_rebuttal", "service_differentiation", "closing"),
                    "CMS IOM Pub. 100-04 Ch. 1 §80.3.2.2")
    );

    public List<Map<String, String>> getDenialCodes(String search) {
        if (search == null || search.isBlank()) return DENIAL_CODES;
        String q = search.toLowerCase();
        return DENIAL_CODES.stream()
                .filter(c -> c.get("code").toLowerCase().contains(q)
                        || c.get("description").toLowerCase().contains(q)
                        || c.get("category").toLowerCase().contains(q))
                .toList();
    }

    // Same roster as workflow-service WorkflowReferenceController
    public static final Map<String, String> TEAM_MEMBERS = Map.of(
            "dev-user-001", "Demo Biller",
            "dev-user-002", "Sarah Johnson",
            "dev-user-003", "Mike Chen",
            "dev-user-004", "Lisa Park"
    );

    // Ported from Python dev_server HISTORICAL_WIN_RATES / PAYER_MODIFIER (deterministic prediction model)
    public static final Map<String, Double> HISTORICAL_WIN_RATES = Map.ofEntries(
            Map.entry("CO-4", 0.35), Map.entry("CO-16", 0.55), Map.entry("CO-18", 0.20), Map.entry("CO-29", 0.40),
            Map.entry("CO-45", 0.30), Map.entry("CO-50", 0.65), Map.entry("CO-97", 0.45), Map.entry("CO-109", 0.25),
            Map.entry("CO-197", 0.60), Map.entry("CO-204", 0.30), Map.entry("CO-236", 0.40),
            Map.entry("PR-1", 0.15), Map.entry("PR-2", 0.20), Map.entry("PR-3", 0.10)
    );
    public static final double DEFAULT_WIN_RATE = 0.30;

    public static final Map<String, Double> PAYER_MODIFIER = Map.of(
            "Aetna", 0.05, "BCBS", 0.0, "Blue Cross Blue Shield", 0.0,
            "Cigna", -0.05, "UnitedHealthcare", -0.10,
            "Medicare", 0.10, "Medicaid", 0.05, "Humana", 0.0
    );

    public static final List<String> LINK_TYPES = List.of("related", "duplicate", "parent", "child", "follow_up", "rebill");

    public static String teamMemberName(String userId) {
        if (userId == null) return null;
        return TEAM_MEMBERS.getOrDefault(userId, userId);
    }

    public int filingDaysFor(String payerName) {
        if (payerName != null) {
            String normalized = payerName.toLowerCase().trim();
            for (Map.Entry<String, Integer> entry : PAYER_FILING_DAYS.entrySet()) {
                if (normalized.contains(entry.getKey())) return entry.getValue();
            }
        }
        return DEFAULT_FILING_DAYS;
    }

    public LocalDateTime computeDeadline(String payerName) {
        return LocalDateTime.now().plusDays(filingDaysFor(payerName));
    }

    public String generateAppealLetter(Map<String, Object> claimData, String templateCategory) {
        AppealTemplate template = APPEAL_TEMPLATES.get(templateCategory);
        if (template == null) {
            template = APPEAL_TEMPLATES.get("Medical Necessity");
            templateCategory = "Medical Necessity";
        }

        String today = LocalDateTime.now().format(DateTimeFormatter.ofPattern("MMMM dd, yyyy"));
        long deniedCents = claimData.get("amount_denied_cents") instanceof Number n ? n.longValue() : 0L;
        String amount = String.format("$%,.2f", deniedCents / 100.0);

        StringBuilder sb = new StringBuilder();
        sb.append("Date: ").append(today).append("\n\n");
        sb.append("Re: Appeal of Denied Claim — ").append(claimData.getOrDefault("claim_number", "N/A")).append("\n");
        sb.append("Patient ID: ").append(claimData.getOrDefault("patient_id", "N/A")).append("\n");
        sb.append("Payer: ").append(claimData.getOrDefault("payer_name", "Unknown Payer")).append("\n");
        sb.append("Denial Code: ").append(claimData.getOrDefault("denial_code", "N/A")).append("\n");
        sb.append("Amount Denied: ").append(amount).append("\n\n");
        sb.append("Dear Claims Review Department,\n\n");
        sb.append("I am writing to formally appeal the denial of the above-referenced claim. ");
        sb.append("The claim was denied under code ").append(claimData.getOrDefault("denial_code", "N/A"));
        sb.append(" (").append(claimData.getOrDefault("denial_reason", "reason not specified")).append(").\n\n");

        String divider = "─".repeat(40);
        switch (templateCategory) {
            case "Medical Necessity" -> {
                sb.append("MEDICAL NECESSITY ARGUMENT\n").append(divider).append("\n");
                sb.append("The services rendered were medically necessary as documented in the ");
                sb.append("patient's clinical records. The treating physician determined that ");
                sb.append("the procedure/service was required to diagnose or treat the patient's ");
                sb.append("condition based on accepted standards of medical practice.\n\n");
                sb.append("The clinical evidence supporting this determination includes:\n");
                sb.append("  • Clinical notes: ").append(claimData.getOrDefault("raw_clinical_notes", "See attached")).append("\n\n");
                sb.append("Source: ").append(template.source()).append("\n");
            }
            case "Timely Filing" -> {
                sb.append("TIMELY FILING ARGUMENT\n").append(divider).append("\n");
                sb.append("This claim was submitted within the required timely filing period. ");
                sb.append("Evidence of original submission date is attached. Per the applicable ");
                sb.append("filing deadline requirements, this claim remains within the allowable ");
                sb.append("window for consideration.\n\n");
                sb.append("Source: ").append(template.source()).append("\n");
            }
            case "Authorization" -> {
                sb.append("PRIOR AUTHORIZATION ARGUMENT\n").append(divider).append("\n");
                sb.append("Prior authorization was obtained for the services in question. ");
                sb.append("The authorization reference information is documented in the ");
                sb.append("patient's records. We request that this claim be reprocessed ");
                sb.append("with the authorization information on file.\n\n");
                sb.append("Source: ").append(template.source()).append("\n");
            }
            case "Coding" -> {
                sb.append("CODING CORRECTION ARGUMENT\n").append(divider).append("\n");
                sb.append("Upon review, the procedure codes billed accurately reflect the ");
                sb.append("services provided. The coding is consistent with the clinical ");
                sb.append("documentation and follows current CPT/HCPCS guidelines. ");
                sb.append("The modifier(s) used are appropriate for the services rendered.\n\n");
                sb.append("Source: ").append(template.source()).append("\n");
            }
            case "Coverage" -> {
                sb.append("COVERAGE ARGUMENT\n").append(divider).append("\n");
                sb.append("The denied services are covered under the patient's current ");
                sb.append("benefit plan. The Summary of Benefits and Coverage confirms that ");
                sb.append("the service category in question is an included benefit. We ");
                sb.append("request reprocessing of this claim under the correct benefit category.\n\n");
                sb.append("Source: ").append(template.source()).append("\n");
            }
            case "Duplicate" -> {
                sb.append("DUPLICATE CLAIM REBUTTAL\n").append(divider).append("\n");
                sb.append("This claim is not a duplicate. The services billed represent ");
                sb.append("distinct encounters or procedures that are separately billable. ");
                sb.append("Supporting documentation differentiating these services from any ");
                sb.append("previously adjudicated claims is attached.\n\n");
                sb.append("Source: ").append(template.source()).append("\n");
            }
        }

        sb.append("\nREQUESTED ACTION\n").append(divider).append("\n");
        sb.append("We respectfully request that this denial be overturned and the claim ");
        sb.append("be reprocessed for payment of ").append(amount).append(".\n\n");
        sb.append("Supporting documentation is enclosed. Please do not hesitate to contact ");
        sb.append("our office if additional information is required.\n\n");
        sb.append("Sincerely,\n[Provider Name]\n[Provider NPI]\n[Contact Information]\n\n");
        sb.append("--- Template: ").append(templateCategory).append(" | Source: ").append(template.source()).append(" ---");

        return sb.toString();
    }
}
