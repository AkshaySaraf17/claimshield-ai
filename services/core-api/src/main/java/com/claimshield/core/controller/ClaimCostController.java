package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimCost;
import com.claimshield.core.repository.ClaimCostRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claims/{claimId}/costs")
public class ClaimCostController {

    private final ClaimCostRepository costRepository;
    private final AuditService auditService;

    public ClaimCostController(ClaimCostRepository costRepository, AuditService auditService) {
        this.costRepository = costRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<ClaimCost> listCosts(@PathVariable String claimId, HttpServletRequest request) {
        return costRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimCost createCost(@PathVariable String claimId,
                                @RequestBody Map<String, Object> body,
                                HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        ClaimCost cost = new ClaimCost();
        cost.setTenantId(tenantId);
        cost.setClaimId(claimId);
        cost.setRecordedBy(userId);
        cost.setCategory((String) body.getOrDefault("category", "other"));
        cost.setDescription((String) body.getOrDefault("description", ""));
        cost.setAmountCents(body.containsKey("amount_cents") ? ((Number) body.get("amount_cents")).longValue() : 0L);

        ClaimCost saved = costRepository.save(cost);
        auditService.writeAudit(tenantId, userId, "cost.recorded", "claim", claimId,
                "{\"cost_id\":\"" + saved.getId() + "\",\"amount_cents\":" + saved.getAmountCents() + "}");
        return saved;
    }

    @DeleteMapping("/{costId}")
    public ResponseEntity<?> deleteCost(@PathVariable String claimId,
                                        @PathVariable String costId,
                                        HttpServletRequest request) {
        return costRepository.findById(costId)
                .map(cost -> {
                    if (!getTenantId(request).equals(cost.getTenantId())) return ResponseEntity.notFound().build();
                    costRepository.delete(cost);
                    return ResponseEntity.noContent().build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    private String getTenantId(HttpServletRequest request) {
        String header = request.getHeader("X-Tenant-Id");
        return header != null ? header : "00000000-0000-0000-0000-000000000001";
    }

    private String getUserId(HttpServletRequest request) {
        String header = request.getHeader("X-User-Id");
        return header != null ? header : "dev-user-001";
    }
}
