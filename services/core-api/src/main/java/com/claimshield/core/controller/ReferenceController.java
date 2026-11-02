package com.claimshield.core.controller;

import com.claimshield.core.model.Claim;
import com.claimshield.core.repository.ClaimRepository;
import com.claimshield.core.service.ReferenceDataService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class ReferenceController {

    private final ReferenceDataService referenceDataService;
    private final ClaimRepository claimRepository;

    public ReferenceController(ReferenceDataService referenceDataService, ClaimRepository claimRepository) {
        this.referenceDataService = referenceDataService;
        this.claimRepository = claimRepository;
    }

    @GetMapping("/denial-codes")
    public List<Map<String, String>> listDenialCodes(@RequestParam(defaultValue = "") String search) {
        return referenceDataService.getDenialCodes(search);
    }

    @GetMapping("/denial-code-reference")
    public List<Map<String, String>> denialCodeReference() {
        return ReferenceDataService.DENIAL_CODE_TO_CATEGORY.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> Map.of("denial_code", e.getKey(), "category", e.getValue()))
                .toList();
    }

    @GetMapping("/denial-prevention-tips")
    public List<Map<String, Object>> denialPreventionTips(HttpServletRequest request) {
        Map<String, Long> counts = claimRepository.findByTenantIdOrderByCreatedAtDesc(getTenantId(request)).stream()
                .filter(c -> c.getDenialCode() != null && !c.getDenialCode().isBlank())
                .collect(Collectors.groupingBy(Claim::getDenialCode, Collectors.counting()));

        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> {
                    boolean known = ReferenceDataService.PREVENTION_TIPS.containsKey(e.getKey());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("denial_code", e.getKey());
                    m.put("occurrence_count", e.getValue());
                    m.put("tips", known ? ReferenceDataService.PREVENTION_TIPS.get(e.getKey()) : ReferenceDataService.DEFAULT_PREVENTION_TIPS);
                    m.put("source", known ? "CMS/AMA guidelines" : "general best practice");
                    return m;
                })
                .toList();
    }

    @GetMapping("/appeal-templates")
    public List<Map<String, Object>> listAppealTemplates() {
        return ReferenceDataService.APPEAL_TEMPLATES.entrySet().stream()
                .map(e -> Map.<String, Object>of(
                        "category", e.getValue().category(),
                        "sections", e.getValue().sections(),
                        "source", e.getValue().source()))
                .toList();
    }

    @GetMapping("/rules/config")
    public Map<String, Object> rulesConfig() {
        Map<String, List<String>> transitions = new LinkedHashMap<>();
        ReferenceDataService.ALLOWED_TRANSITIONS.forEach((status, targets) ->
                transitions.put(status, targets.stream().sorted().toList()));

        List<Map<String, String>> codeMappings = ReferenceDataService.DENIAL_CODE_TO_CATEGORY.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> Map.of("denial_code", e.getKey(), "category", e.getValue()))
                .toList();

        List<Map<String, String>> pipelineStages = ReferenceDataService.PIPELINE_STAGES.stream()
                .map(s -> Map.of("name", s, "label", Arrays.stream(s.split("_"))
                        .map(w -> w.substring(0, 1).toUpperCase() + w.substring(1))
                        .collect(Collectors.joining(" "))))
                .toList();

        return Map.of(
                "transitions", transitions,
                "denial_code_mappings", codeMappings,
                "pipeline_stages", pipelineStages,
                "appeal_template_categories", ReferenceDataService.APPEAL_TEMPLATES.keySet().stream().sorted().toList()
        );
    }

    @GetMapping("/system/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "core-api", "mode", "h2-file");
    }

    private String getTenantId(HttpServletRequest request) {
        String header = request.getHeader("X-Tenant-Id");
        return header != null ? header : "00000000-0000-0000-0000-000000000001";
    }
}
