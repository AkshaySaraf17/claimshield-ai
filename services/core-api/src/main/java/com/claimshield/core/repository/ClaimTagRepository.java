package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimTagRepository extends JpaRepository<ClaimTag, String> {
    List<ClaimTag> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
    void deleteByTenantIdAndClaimIdAndTag(String tenantId, String claimId, String tag);
    List<ClaimTag> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<ClaimTag> findByTenantIdAndClaimIdAndTag(String tenantId, String claimId, String tag);
}
