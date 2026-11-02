package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.ClaimAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ClaimAssignmentRepository extends JpaRepository<ClaimAssignment, String> {
    List<ClaimAssignment> findByTenantId(String tenantId);
}
