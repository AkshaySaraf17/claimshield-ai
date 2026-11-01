package com.claimshield.core.repository;

import com.claimshield.core.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, String> {
    List<AuditLog> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<AuditLog> findByResourceIdOrderByCreatedAtDesc(String resourceId);
    Optional<AuditLog> findTopByTenantIdOrderByCreatedAtDesc(String tenantId);
}
