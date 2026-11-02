package com.claimshield.core.repository;

import com.claimshield.core.model.ClaimAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClaimAssignmentRepository extends JpaRepository<ClaimAssignment, String> {
    List<ClaimAssignment> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
    List<ClaimAssignment> findByTenantIdAndAssignedToOrderByCreatedAtDesc(String tenantId, String assignedTo);
    List<ClaimAssignment> findByTenantIdOrderByCreatedAtDesc(String tenantId);
}
