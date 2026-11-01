package com.claimshield.core.repository;

import com.claimshield.core.model.Claim;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimRepository extends JpaRepository<Claim, String> {
    List<Claim> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<Claim> findByTenantIdAndStatusOrderByCreatedAtDesc(String tenantId, String status);
    List<Claim> findByTenantIdAndPayerContainingIgnoreCase(String tenantId, String payer);
    long countByTenantId(String tenantId);
    long countByTenantIdAndStatus(String tenantId, String status);
}
