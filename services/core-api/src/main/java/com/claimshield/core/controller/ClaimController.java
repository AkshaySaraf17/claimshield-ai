package com.claimshield.core.controller;

import com.claimshield.core.model.Claim;
import com.claimshield.core.repository.ClaimRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/claims")
public class ClaimController {

    private final ClaimRepository claimRepository;
    private final AuditService auditService;

    public ClaimController(ClaimRepository claimRepository, AuditService auditService) {
        this.claimRepository = claimRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<Claim> listClaims(
            @RequestParam(required = false) String status,
            HttpServletRequest request) {
        String tenantId = getTenantId(request);
        if (status != null && !status.isEmpty()) {
            return claimRepository.findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId, status);
        }
        return claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Claim> getClaim(@PathVariable String id) {
        return claimRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Claim createClaim(@RequestBody Claim claim, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        claim.setId(UUID.randomUUID().toString());
        claim.setTenantId(tenantId);
        claim.setCreatedBy(userId);
        if (claim.getStatus() == null) claim.setStatus("pending_review");
        if (claim.getClaimNumber() == null) {
            claim.setClaimNumber("CLM-" + java.time.Year.now().getValue() + "-" +
                    String.format("%03d", claimRepository.countByTenantId(tenantId) + 1));
        }

        Claim saved = claimRepository.save(claim);
        auditService.writeAudit(tenantId, userId, "claim.created", "claim", saved.getId(),
                "{\"claim_number\":\"" + saved.getClaimNumber() + "\"}");
        return saved;
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Claim> updateClaim(@PathVariable String id,
                                              @RequestBody Map<String, Object> updates,
                                              HttpServletRequest request) {
        return claimRepository.findById(id).map(claim -> {
            String tenantId = getTenantId(request);
            String userId = getUserId(request);

            if (updates.containsKey("status")) {
                String oldStatus = claim.getStatus();
                String newStatus = (String) updates.get("status");
                claim.setStatus(newStatus);
                auditService.writeAudit(tenantId, userId, "status.changed", "claim", id,
                        "{\"from\":\"" + oldStatus + "\",\"to\":\"" + newStatus + "\"}");
            }
            if (updates.containsKey("assigned_to")) claim.setAssignedTo((String) updates.get("assigned_to"));
            if (updates.containsKey("denial_reason")) claim.setDenialReason((String) updates.get("denial_reason"));
            if (updates.containsKey("payer")) claim.setPayer((String) updates.get("payer"));

            return ResponseEntity.ok(claimRepository.save(claim));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);

        long totalDenied = claims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long totalRecovered = claims.stream().mapToLong(c -> c.getAmountRecoveredCents() != null ? c.getAmountRecoveredCents() : 0).sum();
        long won = claims.stream().filter(c -> "won".equals(c.getStatus())).count();
        long lost = claims.stream().filter(c -> "lost".equals(c.getStatus())).count();
        long pendingReview = claims.stream().filter(c -> "pending_review".equals(c.getStatus()) || "needs_review".equals(c.getStatus())).count();

        return Map.of(
            "total_claims", claims.size(),
            "total_denied_cents", totalDenied,
            "total_recovered_cents", totalRecovered,
            "won", won,
            "lost", lost,
            "pending_review", pendingReview,
            "win_rate", (won + lost) > 0 ? (double) won / (won + lost) : 0.0
        );
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
