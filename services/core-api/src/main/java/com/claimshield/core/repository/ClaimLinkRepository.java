package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimLinkRepository extends JpaRepository<ClaimLink, String> {
    @Query("SELECT l FROM ClaimLink l WHERE l.tenantId = ?1 AND (l.claimIdA = ?2 OR l.claimIdB = ?2) ORDER BY l.createdAt DESC")
    List<ClaimLink> findByTenantIdAndClaimId(String tenantId, String claimId);
}
