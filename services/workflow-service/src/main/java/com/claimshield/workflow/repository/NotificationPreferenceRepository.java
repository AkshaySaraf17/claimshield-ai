package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.NotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, String> {
    List<NotificationPreference> findByTenantIdAndUserId(String tenantId, String userId);
}
