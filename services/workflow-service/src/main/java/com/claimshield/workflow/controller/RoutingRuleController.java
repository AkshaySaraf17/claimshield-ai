package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.RoutingRule;
import com.claimshield.workflow.repository.RoutingRuleRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/routing-rules")
public class RoutingRuleController {

    private final RoutingRuleRepository repository;

    public RoutingRuleController(RoutingRuleRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<RoutingRule> list(@RequestParam(required = false, defaultValue = "false") boolean activeOnly,
                                  HttpServletRequest request) {
        String tenantId = getTenantId(request);
        return activeOnly
                ? repository.findByTenantIdAndIsActiveTrueOrderByPriorityDesc(tenantId)
                : repository.findByTenantIdOrderByPriorityDesc(tenantId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RoutingRule create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        RoutingRule rule = new RoutingRule();
        rule.setTenantId(getTenantId(request));
        rule.setName((String) body.get("name"));
        rule.setDescription((String) body.get("description"));
        rule.setMatchField((String) body.getOrDefault("match_field", "payer"));
        rule.setMatchOperator((String) body.getOrDefault("match_operator", "equals"));
        rule.setMatchValue((String) body.get("match_value"));
        rule.setAssignTo((String) body.get("assign_to"));
        if (body.containsKey("priority")) rule.setPriority(((Number) body.get("priority")).intValue());
        rule.setCreatedBy(getUserId(request));
        return repository.save(rule);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(r -> r.getTenantId().equals(getTenantId(request)))
                .map(r -> { repository.delete(r); return ResponseEntity.noContent().build(); })
                .orElse(ResponseEntity.notFound().build());
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }

    private String getUserId(HttpServletRequest request) {
        String h = request.getHeader("X-User-Id");
        return h != null ? h : "dev-user-001";
    }
}
