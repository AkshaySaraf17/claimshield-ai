package com.claimshield.core.service;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Deterministic rules — code decides; LLMs only draft/explain.
 * Ported from the Python rules-engine service. Every rule result carries a source
 * documenting the regulation, CMS guideline, or payer policy it implements.
 */
@Service
public class RulesEngineService {

    public enum Severity {
        BLOCK("block"), WARN("warn"), INFO("info");

        private final String value;

        Severity(String value) { this.value = value; }

        public String value() { return value; }
    }

    public record RuleResult(String ruleId, boolean passed, Severity severity, String message,
                             String source, Map<String, Object> details) {

        RuleResult(String ruleId, boolean passed, Severity severity, String message, String source) {
            this(ruleId, passed, severity, message, source, Map.of());
        }

        public boolean isBlocker() { return !passed && severity == Severity.BLOCK; }
    }

    private static final String TIMELY_FILING_SOURCE = "42 CFR § 424.44 (Medicare); payer-specific contract terms";
    private static final String CARC_SOURCE = "CARC/RARC code set (X12 835)";

    // Timely filing deadlines (days from date of service). Keys are lower-case payer names with spaces → underscores.
    public static final Map<String, Integer> TIMELY_FILING_DAYS = Map.ofEntries(
            Map.entry("medicare", 365), Map.entry("medicaid", 365),
            Map.entry("aetna", 90), Map.entry("cigna", 90),
            Map.entry("unitedhealthcare", 90), Map.entry("uhc", 90),
            Map.entry("blue_cross", 365), Map.entry("bcbs", 365),
            Map.entry("humana", 365)
    );
    public static final int DEFAULT_TIMELY_FILING_DAYS = 180;

    private record DenialCodeInfo(String category, String description, String source) {}

    private static final Map<String, DenialCodeInfo> DENIAL_CODE_CATEGORIES = Map.ofEntries(
            Map.entry("CO-4", new DenialCodeInfo("coding", "Procedure code inconsistent with modifier or missing modifier", CARC_SOURCE)),
            Map.entry("CO-16", new DenialCodeInfo("missing_info", "Claim lacks information needed for adjudication", CARC_SOURCE)),
            Map.entry("CO-18", new DenialCodeInfo("duplicate", "Exact duplicate claim/service", CARC_SOURCE)),
            Map.entry("CO-29", new DenialCodeInfo("timely_filing", "Timely filing limit has expired", CARC_SOURCE)),
            Map.entry("CO-45", new DenialCodeInfo("fee_schedule", "Charges exceed fee schedule/maximum allowable amount", CARC_SOURCE)),
            Map.entry("CO-50", new DenialCodeInfo("medical_necessity", "Non-covered service — not deemed medically necessary", CARC_SOURCE)),
            Map.entry("CO-97", new DenialCodeInfo("bundling", "Payment included in allowance for another service/procedure", CARC_SOURCE + "; CCI edits")),
            Map.entry("CO-109", new DenialCodeInfo("not_covered", "Claim not covered by this payer/contractor", CARC_SOURCE)),
            Map.entry("CO-197", new DenialCodeInfo("precertification", "Precertification/authorization/notification absent", CARC_SOURCE)),
            Map.entry("PR-1", new DenialCodeInfo("deductible", "Deductible amount", CARC_SOURCE)),
            Map.entry("PR-2", new DenialCodeInfo("coinsurance", "Coinsurance amount", CARC_SOURCE)),
            Map.entry("PR-3", new DenialCodeInfo("copay", "Co-payment amount", CARC_SOURCE))
    );

    // CMS Correct Coding Initiative bundles: primary CPT → codes included in its payment
    private static final Map<String, Set<String>> CCI_BUNDLES = Map.of(
            "99213", Set.of("36415", "81002", "81003"),
            "99214", Set.of("36415", "81002", "81003"),
            "99215", Set.of("36415", "81002", "81003"),
            "99291", Set.of("99292")
    );

    public RuleResult checkTimelyFiling(String payerName, LocalDate dateOfService, LocalDate today) {
        String key = (payerName != null ? payerName : "").toLowerCase().replace(" ", "_");
        int deadlineDays = TIMELY_FILING_DAYS.getOrDefault(key, DEFAULT_TIMELY_FILING_DAYS);
        LocalDate deadline = dateOfService.plusDays(deadlineDays);
        long daysRemaining = ChronoUnit.DAYS.between(today, deadline);
        Map<String, Object> details = Map.of("deadline", deadline.toString(), "days_remaining", daysRemaining);

        if (daysRemaining < 0) {
            return new RuleResult("timely_filing", false, Severity.BLOCK,
                    "Timely filing deadline passed " + Math.abs(daysRemaining) + " days ago for "
                            + (payerName != null && !payerName.isEmpty() ? payerName : "unknown payer"),
                    TIMELY_FILING_SOURCE, details);
        }
        if (daysRemaining <= 30) {
            return new RuleResult("timely_filing", true, Severity.WARN,
                    "Only " + daysRemaining + " days remaining before timely filing deadline", TIMELY_FILING_SOURCE, details);
        }
        return new RuleResult("timely_filing", true, Severity.INFO,
                daysRemaining + " days remaining before timely filing deadline", TIMELY_FILING_SOURCE, details);
    }

    public RuleResult validateDenialCode(String denialCode) {
        if (denialCode == null || denialCode.isEmpty()) {
            return new RuleResult("denial_code_validation", true, Severity.WARN,
                    "No denial code provided — needs manual review", "Internal policy: all claims should have a denial code");
        }
        String codeUpper = denialCode.toUpperCase().strip();
        DenialCodeInfo info = DENIAL_CODE_CATEGORIES.get(codeUpper);
        if (info != null) {
            return new RuleResult("denial_code_validation", true, Severity.INFO,
                    "Known denial code " + codeUpper + ": " + info.description(), info.source(),
                    Map.of("category", info.category(), "description", info.description()));
        }
        return new RuleResult("denial_code_validation", true, Severity.WARN,
                "Unrecognized denial code '" + denialCode + "' — may need manual lookup", CARC_SOURCE);
    }

    public RuleResult checkBundling(String primaryCpt, List<String> secondaryCpts) {
        if (primaryCpt == null || primaryCpt.isEmpty() || secondaryCpts == null || secondaryCpts.isEmpty()) {
            return new RuleResult("bundling_check", true, Severity.INFO,
                    "Insufficient CPT data for bundling check", "CMS Correct Coding Initiative (CCI) edits");
        }
        Set<String> bundled = CCI_BUNDLES.getOrDefault(primaryCpt, Set.of());
        List<String> violations = secondaryCpts.stream().filter(bundled::contains).toList();
        if (!violations.isEmpty()) {
            return new RuleResult("bundling_check", false, Severity.WARN,
                    "CPT " + primaryCpt + " bundles with " + String.join(", ", violations)
                            + " per CCI edits — modifier 59/XE/XS/XP/XU may be needed",
                    "CMS Correct Coding Initiative (CCI) edits, quarterly update",
                    Map.of("primary", primaryCpt, "bundled_codes", violations));
        }
        return new RuleResult("bundling_check", true, Severity.INFO,
                "No CCI bundling conflicts detected", "CMS Correct Coding Initiative (CCI) edits, quarterly update");
    }

    public List<RuleResult> runAllRules(String payerName, String denialCode, LocalDate dateOfService,
                                        String primaryCpt, List<String> secondaryCpts, LocalDate today) {
        List<RuleResult> results = new ArrayList<>();
        results.add(validateDenialCode(denialCode));
        if (dateOfService != null) results.add(checkTimelyFiling(payerName, dateOfService, today));
        results.add(checkBundling(primaryCpt, secondaryCpts));
        return results;
    }
}
