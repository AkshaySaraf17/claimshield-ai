package com.claimshield.core.controller;

import com.claimshield.core.model.Appeal;
import com.claimshield.core.model.Claim;
import com.claimshield.core.repository.AppealRepository;
import com.claimshield.core.repository.ClaimRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/appeals")
public class AppealController {

    private final AppealRepository appealRepository;
    private final AuditService auditService;
    private final ClaimRepository claimRepository;

    public AppealController(AppealRepository appealRepository, AuditService auditService,
                            ClaimRepository claimRepository) {
        this.appealRepository = appealRepository;
        this.auditService = auditService;
        this.claimRepository = claimRepository;
    }

    @GetMapping
    public List<Appeal> listAppeals(@RequestParam(name = "claim_id", required = false) String claimId,
                                    @RequestParam(name = "needs_review", required = false) Boolean needsReview,
                                    @RequestParam(defaultValue = "50") int limit,
                                    @RequestParam(defaultValue = "0") int offset,
                                    HttpServletRequest request) {
        return appealRepository.findByTenantIdOrderByCreatedAtDesc(getTenantId(request)).stream()
                .filter(a -> claimId == null || claimId.equals(a.getClaimId()))
                .filter(a -> needsReview == null || needsReview == a.getNeedsReview())
                .skip(Math.max(offset, 0))
                .limit(Math.min(Math.max(limit, 1), 200))
                .toList();
    }

    @GetMapping("/{id}/preview")
    public ResponseEntity<?> previewAppeal(@PathVariable String id, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        Optional<Appeal> found = appealRepository.findById(id).filter(a -> a.getTenantId().equals(tenantId));
        if (found.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Appeal not found"));
        Appeal appeal = found.get();
        Claim claim = claimRepository.findById(appeal.getClaimId()).orElse(null);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("appeal_id", appeal.getId());
        m.put("claim_id", appeal.getClaimId());
        m.put("claim_number", claim != null ? claim.getClaimNumber() : null);
        m.put("payer_name", claim != null ? claim.getPayer() : null);
        m.put("denial_code", claim != null ? claim.getDenialCode() : null);
        m.put("denial_reason", claim != null ? claim.getDenialReason() : null);
        m.put("amount_denied_cents", claim != null ? claim.getAmountDeniedCents() : null);
        m.put("letter_body", appeal.getLetterBody());
        m.put("template_used", appeal.getTemplateUsed());
        m.put("needs_review", appeal.getNeedsReview());
        m.put("approved_by", appeal.getApprovedBy());
        m.put("approved_at", appeal.getApprovedAt() != null ? appeal.getApprovedAt().toString() : null);
        m.put("created_at", appeal.getCreatedAt() != null ? appeal.getCreatedAt().toString() : null);
        return ResponseEntity.ok(m);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Appeal> getAppeal(@PathVariable String id) {
        return appealRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Appeal createAppeal(@RequestBody Appeal appeal, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        appeal.setId(UUID.randomUUID().toString());
        appeal.setTenantId(tenantId);
        appeal.setCreatedBy(userId);
        if (appeal.getStatus() == null) appeal.setStatus("draft");

        Appeal saved = appealRepository.save(appeal);
        auditService.writeAudit(tenantId, userId, "appeal.created", "appeal", saved.getId(),
                "{\"claim_id\":\"" + saved.getClaimId() + "\"}");
        return saved;
    }

    @RequestMapping(value = "/{id}/approve", method = {RequestMethod.POST, RequestMethod.PATCH})
    public ResponseEntity<?> approveAppeal(@PathVariable String id,
                                           @RequestBody(required = false) Map<String, String> body,
                                           HttpServletRequest request) {
        return appealRepository.findById(id).map(appeal -> {
            if (!appeal.getNeedsReview()) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body((Object) Map.of("detail", "Already approved"));
            }
            String userId = getUserId(request);
            String approvedBy = body != null && body.get("approved_by") != null ? body.get("approved_by") : userId;
            appeal.setStatus("approved");
            appeal.setApprovedBy(approvedBy);
            appeal.setApprovedAt(LocalDateTime.now());
            Appeal saved = appealRepository.save(appeal);

            auditService.writeAudit(getTenantId(request), userId, "appeal.approved", "appeal", id,
                    "{\"approved_by\":\"" + approvedBy + "\"}");
            return ResponseEntity.ok((Object) saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @RequestMapping(value = "/{id}/send", method = {RequestMethod.POST, RequestMethod.PATCH})
    public ResponseEntity<?> sendAppeal(@PathVariable String id,
                                        @RequestBody(required = false) Map<String, String> body,
                                        HttpServletRequest request) {
        return appealRepository.findById(id).map(appeal -> {
            if (!"approved".equals(appeal.getStatus())) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body((Object) Map.of("detail",
                        "Appeal must be approved before sending. Nothing is sent without server-enforced human approval."));
            }
            String userId = getUserId(request);
            appeal.setStatus("sent");
            appeal.setSentAt(LocalDateTime.now());
            appeal.setSentVia(body != null ? body.getOrDefault("via", "fax") : "fax");
            appeal.setTrackingNumber("TRK-" + UUID.randomUUID().toString().substring(0, 8));
            Appeal saved = appealRepository.save(appeal);

            auditService.writeAudit(getTenantId(request), userId, "appeal.sent", "appeal", id,
                    "{\"via\":\"" + saved.getSentVia() + "\",\"tracking\":\"" + saved.getTrackingNumber() + "\"}");
            return ResponseEntity.ok((Object) saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/claim/{claimId}")
    public List<Appeal> getAppealsByClaim(@PathVariable String claimId) {
        return appealRepository.findByClaimIdOrderByCreatedAtDesc(claimId);
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
