package com.claimshield.core.controller;

import com.claimshield.core.model.Appeal;
import com.claimshield.core.repository.AppealRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/appeals")
public class AppealController {

    private final AppealRepository appealRepository;
    private final AuditService auditService;

    public AppealController(AppealRepository appealRepository, AuditService auditService) {
        this.appealRepository = appealRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<Appeal> listAppeals(HttpServletRequest request) {
        return appealRepository.findByTenantIdOrderByCreatedAtDesc(getTenantId(request));
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

    @PostMapping("/{id}/approve")
    public ResponseEntity<Appeal> approveAppeal(@PathVariable String id, HttpServletRequest request) {
        return appealRepository.findById(id).map(appeal -> {
            String userId = getUserId(request);
            appeal.setStatus("approved");
            appeal.setApprovedBy(userId);
            appeal.setApprovedAt(LocalDateTime.now());
            Appeal saved = appealRepository.save(appeal);

            auditService.writeAudit(getTenantId(request), userId, "appeal.approved", "appeal", id, null);
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/send")
    public ResponseEntity<Appeal> sendAppeal(@PathVariable String id,
                                              @RequestBody(required = false) Map<String, String> body,
                                              HttpServletRequest request) {
        return appealRepository.findById(id).map(appeal -> {
            if (!"approved".equals(appeal.getStatus())) {
                return ResponseEntity.badRequest().body(appeal);
            }
            String userId = getUserId(request);
            appeal.setStatus("sent");
            appeal.setSentAt(LocalDateTime.now());
            appeal.setSentVia(body != null ? body.getOrDefault("via", "fax") : "fax");
            appeal.setTrackingNumber("TRK-" + UUID.randomUUID().toString().substring(0, 8));
            Appeal saved = appealRepository.save(appeal);

            auditService.writeAudit(getTenantId(request), userId, "appeal.sent", "appeal", id,
                    "{\"via\":\"" + saved.getSentVia() + "\",\"tracking\":\"" + saved.getTrackingNumber() + "\"}");
            return ResponseEntity.ok(saved);
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
