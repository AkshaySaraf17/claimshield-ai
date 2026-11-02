package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimAttachmentRepository extends JpaRepository<ClaimAttachment, String> {
    List<ClaimAttachment> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
}
