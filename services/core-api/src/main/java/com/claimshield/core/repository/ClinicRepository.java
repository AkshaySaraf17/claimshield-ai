package com.claimshield.core.repository;

import com.claimshield.core.model.Clinic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClinicRepository extends JpaRepository<Clinic, String> {
    List<Clinic> findByTenantIdOrderByNameAsc(String tenantId);
    Optional<Clinic> findByNpi(String npi);
}
