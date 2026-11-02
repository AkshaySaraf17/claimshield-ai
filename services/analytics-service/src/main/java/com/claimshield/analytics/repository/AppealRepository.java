package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.Appeal;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AppealRepository extends JpaRepository<Appeal, String> {
    List<Appeal> findByTenantId(String tenantId);
}
