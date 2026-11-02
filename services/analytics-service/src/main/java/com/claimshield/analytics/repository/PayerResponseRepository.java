package com.claimshield.analytics.repository;

import com.claimshield.analytics.model.PayerResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PayerResponseRepository extends JpaRepository<PayerResponse, String> {
    List<PayerResponse> findByTenantId(String tenantId);
}
