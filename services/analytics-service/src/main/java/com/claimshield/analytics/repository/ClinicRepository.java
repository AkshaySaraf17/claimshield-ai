package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.Clinic;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ClinicRepository extends JpaRepository<Clinic, String> {
    List<Clinic> findByTenantId(String tenantId);
}
