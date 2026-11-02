package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.Claim;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ClaimRepository extends JpaRepository<Claim, String> {
    List<Claim> findByTenantId(String tenantId);
}
