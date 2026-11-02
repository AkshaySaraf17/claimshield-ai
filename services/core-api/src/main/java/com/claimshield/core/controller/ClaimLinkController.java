package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimLink;
import com.claimshield.core.repository.ClaimLinkRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claim-links")
public class ClaimLinkController {

    private final ClaimLinkRepository linkRepository;
    private final AuditService auditService;

    public ClaimLinkController(ClaimLinkRepository linkRepository, AuditService auditService) {
        this.linkRepository = linkRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<ClaimLink> listLinksForClaim(@RequestParam String claimId, HttpServletRequest request) {
        return linkRepository.findByTenantIdAndClaimId(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimLink createLink(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        ClaimLink link = new ClaimLink();
        link.setTenantId(tenantId);
        link.setClaimIdA(body.get("claim_id_a"));
        link.setClaimIdB(body.get("claim_id_b"));
        link.setLinkType(body.getOrDefault("link_type", "related"));
        link.setCreatedBy(userId);

        ClaimLink saved = linkRepository.save(link);
        auditService.writeAudit(tenantId, userId, "link.created", "claim", body.get("claim_id_a"),
                "{\"linked_to\":\"" + body.get("claim_id_b") + "\",\"type\":\"" + link.getLinkType() + "\"}");
        return saved;
    }

    @DeleteMapping("/{linkId}")
    public ResponseEntity<?> deleteLink(@PathVariable String linkId, HttpServletRequest request) {
        return linkRepository.findById(linkId)
                .map(link -> {
                    if (!getTenantId(request).equals(link.getTenantId())) return ResponseEntity.notFound().build();
                    linkRepository.delete(link);
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
