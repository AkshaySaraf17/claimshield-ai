package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.CustomTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CustomTemplateRepository extends JpaRepository<CustomTemplate, String> {
    List<CustomTemplate> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<CustomTemplate> findByTenantIdAndIsActiveTrueOrderByCreatedAtDesc(String tenantId);
    List<CustomTemplate> findByTenantIdAndCategoryOrderByCreatedAtDesc(String tenantId, String category);
}
