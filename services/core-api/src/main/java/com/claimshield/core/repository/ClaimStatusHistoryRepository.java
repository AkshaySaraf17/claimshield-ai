package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimStatusHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimStatusHistoryRepository extends JpaRepository<ClaimStatusHistory, String> {
    List<ClaimStatusHistory> findByTenantIdAndClaimIdOrderByChangedAtDesc(String tenantId, String claimId);
}
