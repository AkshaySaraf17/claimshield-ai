package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimNoteRepository extends JpaRepository<ClaimNote, String> {
    List<ClaimNote> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
}
