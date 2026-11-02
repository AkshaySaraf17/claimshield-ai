package com.claimshield.core.service;

import com.claimshield.core.model.AuditLog;
import com.claimshield.core.repository.AuditLogRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.*;

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

        entry.setEntryHash(computeHash(entry));

        return auditLogRepository.save(entry);
    }

    public String computeHash(AuditLog entry) {
        String payload = String.join("|", entry.getTenantId(), entry.getActorId(), entry.getAction(),
                entry.getResourceType(),
                entry.getResourceId() != null ? entry.getResourceId() : "",
                entry.getDetail() != null ? entry.getDetail() : "",
                entry.getPrevHash());
        return sha256(payload);
    }

    /** Walks the tenant's chain oldest-first; checks each prev_hash link and recomputes each entry hash. */
    public Map<String, Object> verifyChain(String tenantId, int limit) {
        List<AuditLog> rows = auditLogRepository.findByTenantIdOrderByCreatedAtAsc(tenantId);
        if (rows.size() > limit) rows = rows.subList(0, limit);

        String brokenAt = null;
        String reason = null;
        String expectedPrev = "GENESIS";
        for (AuditLog row : rows) {
            if (!expectedPrev.equals(row.getPrevHash())) { brokenAt = row.getId(); reason = "prev_hash_mismatch"; break; }
            if (!computeHash(row).equals(row.getEntryHash())) { brokenAt = row.getId(); reason = "entry_hash_mismatch"; break; }
            expectedPrev = row.getEntryHash();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("entries_checked", rows.size());
        result.put("chain_valid", brokenAt == null);
        result.put("valid", brokenAt == null);
        result.put("broken_at_id", brokenAt);
        result.put("first_broken_id", brokenAt);
        result.put("reason", reason);
        return result;
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
