package com.claimshield.core.service;

import com.claimshield.core.model.AuditLog;
import com.claimshield.core.repository.AuditLogRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public AuditLog writeAudit(String tenantId, String actorId, String action,
                                String resourceType, String resourceId, String detail) {
        String prevHash = auditLogRepository.findTopByTenantIdOrderByCreatedAtDesc(tenantId)
                .map(AuditLog::getEntryHash)
                .orElse("GENESIS");

        AuditLog entry = new AuditLog();
        entry.setId(UUID.randomUUID().toString());
        entry.setTenantId(tenantId);
        entry.setActorId(actorId);
        entry.setAction(action);
        entry.setResourceType(resourceType);
        entry.setResourceId(resourceId);
        entry.setDetail(detail);
        entry.setPrevHash(prevHash);
        entry.setCreatedAt(LocalDateTime.now());

        String payload = String.join("|", tenantId, actorId, action, resourceType,
                resourceId != null ? resourceId : "", detail != null ? detail : "", prevHash);
        entry.setEntryHash(sha256(payload));

        return auditLogRepository.save(entry);
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
