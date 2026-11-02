package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimCommentRepository extends JpaRepository<ClaimComment, String> {
    List<ClaimComment> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
}
