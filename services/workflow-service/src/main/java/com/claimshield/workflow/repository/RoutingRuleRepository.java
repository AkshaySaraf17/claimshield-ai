package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.RoutingRule;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface RoutingRuleRepository extends JpaRepository<RoutingRule, String> {
    List<RoutingRule> findByTenantIdOrderByPriorityDesc(String tenantId);
    List<RoutingRule> findByTenantIdAndIsActiveTrueOrderByPriorityDesc(String tenantId);
}
