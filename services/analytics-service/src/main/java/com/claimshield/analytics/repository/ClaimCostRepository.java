package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.ClaimCost;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ClaimCostRepository extends JpaRepository<ClaimCost, String> {
    List<ClaimCost> findByTenantId(String tenantId);
}
