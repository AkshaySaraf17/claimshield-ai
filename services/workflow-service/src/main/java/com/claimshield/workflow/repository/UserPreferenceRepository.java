package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.UserPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface UserPreferenceRepository extends JpaRepository<UserPreference, String> {
    List<UserPreference> findByTenantIdAndUserId(String tenantId, String userId);
    Optional<UserPreference> findByTenantIdAndUserIdAndPrefKey(String tenantId, String userId, String prefKey);
}
