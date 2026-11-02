package com.claimshield.core.repository;

import com.claimshield.core.model.PayerResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PayerResponseRepository extends JpaRepository<PayerResponse, String> {
    List<PayerResponse> findByTenantIdAndClaimIdOrderByCreatedAtDesc(String tenantId, String claimId);
}
