package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimCost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimCostRepository extends JpaRepository<ClaimCost, String> {
    List<ClaimCost> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
}
