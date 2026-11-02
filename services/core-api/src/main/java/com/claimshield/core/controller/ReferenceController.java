package com.claimshield.core.controller;

import com.claimshield.core.service.ReferenceDataService;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class ReferenceController {

    private final ReferenceDataService referenceDataService;

    public ReferenceController(ReferenceDataService referenceDataService) {
        this.referenceDataService = referenceDataService;
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
    public List<Map<String, String>> denialPreventionTips() {
        return List.of(
                Map.of("category", "Coding", "tip", "Verify CPT/HCPCS codes match documentation before submission", "source", "AMA CPT Guidelines"),
                Map.of("category", "Timely Filing", "tip", "Track filing deadlines per payer and submit at least 2 weeks early", "source", "Payer contract terms"),
                Map.of("category", "Authorization", "tip", "Obtain and document prior auth before services are rendered", "source", "ERISA §503"),
                Map.of("category", "Medical Necessity", "tip", "Include detailed clinical notes supporting medical necessity", "source", "CMS Claims Manual Ch. 1 §60"),
                Map.of("category", "Duplicate", "tip", "Check for existing claims before resubmitting to avoid duplicate flags", "source", "CMS IOM Pub. 100-04"),
                Map.of("category", "Coverage", "tip", "Verify patient eligibility and coverage before rendering services", "source", "Patient's Summary of Benefits")
        );
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
}
