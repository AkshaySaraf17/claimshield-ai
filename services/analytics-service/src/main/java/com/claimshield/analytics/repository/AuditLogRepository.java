package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {
    List<AuditLog> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    long countByTenantId(String tenantId);
}
