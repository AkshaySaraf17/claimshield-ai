package com.claimshield.core;

import com.claimshield.core.service.RulesEngineService;
import com.claimshield.core.service.RulesEngineService.RuleResult;
import com.claimshield.core.service.RulesEngineService.Severity;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/** One-to-one port of tests/test_rules_engine.py (the Python rules engine's tests). */
class RulesEngineServiceTest {

    private final RulesEngineService rules = new RulesEngineService();

    @Test
    void timelyFilingPassed() {
        RuleResult r = rules.checkTimelyFiling("Medicare", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 15));
        assertThat(r.passed()).isTrue();
        assertThat(r.severity()).isEqualTo(Severity.INFO);
    }

    @Test
    void timelyFilingExpired() {
        RuleResult r = rules.checkTimelyFiling("Aetna", LocalDate.of(2026, 1, 1), LocalDate.of(2026, 10, 30));
        assertThat(r.passed()).isFalse();
        assertThat(r.severity()).isEqualTo(Severity.BLOCK);
        assertThat(r.message()).contains("deadline passed");
    }

    @Test
    void timelyFilingWarning() {
        RuleResult r = rules.checkTimelyFiling("Aetna", LocalDate.of(2026, 8, 15), LocalDate.of(2026, 10, 30));
        assertThat(r.passed()).isTrue();
        assertThat(r.severity()).isEqualTo(Severity.WARN);
    }

    @Test
    void knownDenialCode() {
        RuleResult r = rules.validateDenialCode("CO-50");
        assertThat(r.passed()).isTrue();
        assertThat(r.message().toLowerCase()).contains("medically necessary");
        assertThat(r.details()).containsEntry("category", "medical_necessity");
        assertThat(r.source()).isNotBlank();
    }

    @Test
    void unknownDenialCode() {
        RuleResult r = rules.validateDenialCode("XX-999");
        assertThat(r.passed()).isTrue();
        assertThat(r.severity()).isEqualTo(Severity.WARN);
        assertThat(r.message().toLowerCase()).contains("unrecognized");
    }

    @Test
    void nullDenialCode() {
        assertThat(rules.validateDenialCode(null).severity()).isEqualTo(Severity.WARN);
    }

    @Test
    void bundlingViolation() {
        RuleResult r = rules.checkBundling("99213", List.of("36415", "90471"));
        assertThat(r.passed()).isFalse();
        assertThat(r.message()).contains("36415");
    }

    @Test
    void bundlingClean() {
        assertThat(rules.checkBundling("99213", List.of("90471")).passed()).isTrue();
    }

    @Test
    void allRulesHaveSource() {
        List<RuleResult> results = rules.runAllRules("Medicare", "CO-50", LocalDate.of(2026, 10, 1),
                null, null, LocalDate.of(2026, 10, 15));
        assertThat(results).allSatisfy(r -> assertThat(r.source()).as("source of %s", r.ruleId()).isNotBlank());
    }

    @Test
    void runAllRulesReturnsMultiple() {
        List<RuleResult> results = rules.runAllRules("Aetna", "CO-97", LocalDate.of(2026, 10, 1),
                "99213", List.of("36415"), LocalDate.of(2026, 10, 15));
        Set<String> ids = results.stream().map(RuleResult::ruleId).collect(Collectors.toSet());
        assertThat(ids).containsExactlyInAnyOrder("denial_code_validation", "timely_filing", "bundling_check");
    }
}
