package com.claimshield.core.controller;

import com.claimshield.core.service.RulesEngineService;
import com.claimshield.core.service.RulesEngineService.RuleResult;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

/** Deterministic pre/post-LLM checks used by the agent pipeline (ported from the Python rules-engine service). */
@RestController
@RequestMapping("/api/v1/rules")
public class RulesEngineController {

    public record RuleCheckRequest(String payerName, String denialCode, LocalDate dateOfService,
                                   String primaryCpt, List<String> secondaryCpts) {}

    private final RulesEngineService rulesEngine;

    public RulesEngineController(RulesEngineService rulesEngine) {
        this.rulesEngine = rulesEngine;
    }

    @PostMapping("/check")
    public Map<String, Object> checkRules(@RequestBody RuleCheckRequest body) {
        List<RuleResult> results = rulesEngine.runAllRules(body.payerName(), body.denialCode(), body.dateOfService(),
                body.primaryCpt(), body.secondaryCpts(), LocalDate.now());

        List<Map<String, Object>> serialized = results.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rule_id", r.ruleId());
            m.put("passed", r.passed());
            m.put("severity", r.severity().value());
            m.put("message", r.message());
            m.put("source", r.source());
            m.put("details", r.details());
            return m;
        }).toList();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", serialized);
        response.put("has_blockers", results.stream().anyMatch(RuleResult::isBlocker));
        return response;
    }
}
