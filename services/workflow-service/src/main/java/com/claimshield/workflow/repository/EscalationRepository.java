package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.Escalation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface EscalationRepository extends JpaRepository<Escalation, String> {
    List<Escalation> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<Escalation> findByTenantIdAndStatusOrderByCreatedAtDesc(String tenantId, String status);
    List<Escalation> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
}
