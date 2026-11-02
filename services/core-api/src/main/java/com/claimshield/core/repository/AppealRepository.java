package com.claimshield.core.repository;

import com.claimshield.core.model.Appeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AppealRepository extends JpaRepository<Appeal, String> {
    List<Appeal> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<Appeal> findByClaimIdOrderByCreatedAtDesc(String claimId);
    List<Appeal> findByTenantIdAndStatus(String tenantId, String status);
    long countByTenantIdAndStatus(String tenantId, String status);
    List<Appeal> findByTenantIdAndClaimIdOrderByVersionAsc(String tenantId, String claimId);
}
