package com.claimshield.core.controller;

import com.claimshield.core.model.AuditLog;
import com.claimshield.core.repository.AuditLogRepository;
import com.claimshield.core.service.AuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private final AuditLogRepository auditLogRepository;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    public AuditController(AuditLogRepository auditLogRepository, AuditService auditService, ObjectMapper objectMapper) {
        this.auditLogRepository = auditLogRepository;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public List<AuditLog> listAuditLogs(HttpServletRequest request) {
        String tenantId = request.getHeader("X-Tenant-Id");
        if (tenantId == null) tenantId = "00000000-0000-0000-0000-000000000001";
        return auditLogRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @GetMapping("/entries")
    public List<Map<String, Object>> listEntries(@RequestParam(name = "resource_type", required = false) String resourceType,
                                                 @RequestParam(name = "resource_id", required = false) String resourceId,
                                                 @RequestParam(defaultValue = "50") int limit,
                                                 HttpServletRequest request) {
        return auditLogRepository.findByTenantIdOrderByCreatedAtDesc(getTenantId(request)).stream()
                .filter(r -> resourceType == null || resourceType.equals(r.getResourceType()))
                .filter(r -> resourceId == null || resourceId.equals(r.getResourceId()))
                .limit(Math.min(Math.max(limit, 1), 500))
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.getId());
                    m.put("action", r.getAction());
                    m.put("actor_id", r.getActorId());
                    m.put("actor_role", null);
                    m.put("resource_type", r.getResourceType());
                    m.put("resource_id", r.getResourceId());
                    m.put("detail", parseDetail(r.getDetail()));
                    m.put("prev_hash", r.getPrevHash());
                    m.put("entry_hash", r.getEntryHash());
                    m.put("hash", r.getEntryHash());
                    m.put("created_at", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
                    return m;
                }).toList();
    }

    @GetMapping("/verify")
    public Map<String, Object> verifyChain(@RequestParam(defaultValue = "100") int limit, HttpServletRequest request) {
        return auditService.verifyChain(getTenantId(request), Math.max(limit, 1));
    }

    @GetMapping("/resource/{resourceId}")
    public List<AuditLog> getByResource(@PathVariable String resourceId) {
        return auditLogRepository.findByResourceIdOrderByCreatedAtDesc(resourceId);
    }

    private Object parseDetail(String detail) {
        if (detail == null || detail.isBlank()) return null;
        try {
            return objectMapper.readValue(detail, Object.class);
        } catch (Exception e) {
            return detail;
        }
    }

    private String getTenantId(HttpServletRequest request) {
        String header = request.getHeader("X-Tenant-Id");
        return header != null ? header : "00000000-0000-0000-0000-000000000001";
    }
}
