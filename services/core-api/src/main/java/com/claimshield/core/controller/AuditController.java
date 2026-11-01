package com.claimshield.core.controller;

import com.claimshield.core.model.AuditLog;
import com.claimshield.core.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private final AuditLogRepository auditLogRepository;

    public AuditController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    public List<AuditLog> listAuditLogs(HttpServletRequest request) {
        String tenantId = request.getHeader("X-Tenant-Id");
        if (tenantId == null) tenantId = "00000000-0000-0000-0000-000000000001";
        return auditLogRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @GetMapping("/resource/{resourceId}")
    public List<AuditLog> getByResource(@PathVariable String resourceId) {
        return auditLogRepository.findByResourceIdOrderByCreatedAtDesc(resourceId);
    }
}
