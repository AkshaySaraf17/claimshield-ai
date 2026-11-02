package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimAttachment;
import com.claimshield.core.repository.ClaimAttachmentRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claims/{claimId}/attachments")
public class ClaimAttachmentController {

    private final ClaimAttachmentRepository attachmentRepository;
    private final AuditService auditService;

    public ClaimAttachmentController(ClaimAttachmentRepository attachmentRepository, AuditService auditService) {
        this.attachmentRepository = attachmentRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<ClaimAttachment> listAttachments(@PathVariable String claimId, HttpServletRequest request) {
        return attachmentRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimAttachment createAttachment(@PathVariable String claimId,
                                            @RequestBody Map<String, Object> body,
                                            HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        ClaimAttachment att = new ClaimAttachment();
        att.setTenantId(tenantId);
        att.setClaimId(claimId);
        att.setUploadedBy(userId);
        att.setFilename((String) body.getOrDefault("filename", "untitled"));
        att.setFileType((String) body.getOrDefault("file_type", "application/octet-stream"));
        att.setSizeBytes(body.containsKey("size_bytes") ? ((Number) body.get("size_bytes")).longValue() : 0);
        att.setDescription((String) body.get("description"));

        ClaimAttachment saved = attachmentRepository.save(att);
        auditService.writeAudit(tenantId, userId, "attachment.created", "claim", claimId,
                "{\"attachment_id\":\"" + saved.getId() + "\",\"filename\":\"" + saved.getFilename() + "\"}");
        return saved;
    }

    @DeleteMapping("/{attachmentId}")
    public ResponseEntity<?> deleteAttachment(@PathVariable String claimId,
                                              @PathVariable String attachmentId,
                                              HttpServletRequest request) {
        return attachmentRepository.findById(attachmentId)
                .map(att -> {
                    String tenantId = getTenantId(request);
                    if (!tenantId.equals(att.getTenantId())) return ResponseEntity.notFound().build();
                    attachmentRepository.delete(att);
                    auditService.writeAudit(tenantId, getUserId(request), "attachment.deleted", "claim", claimId,
                            "{\"attachment_id\":\"" + attachmentId + "\"}");
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
