package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.DashboardBookmark;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DashboardBookmarkRepository extends JpaRepository<DashboardBookmark, String> {
    List<DashboardBookmark> findByTenantIdAndUserIdOrderBySortOrderAsc(String tenantId, String userId);
}
