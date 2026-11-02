package com.claimshield.core.repository;

import com.claimshield.core.model.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, String> {
    Optional<Tenant> findBySlug(String slug);
    List<Tenant> findByIsActiveTrue();
}
