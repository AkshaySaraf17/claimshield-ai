package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.PayerContact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PayerContactRepository extends JpaRepository<PayerContact, String> {
    List<PayerContact> findByTenantIdOrderByPayerNameAsc(String tenantId);
    List<PayerContact> findByTenantIdAndPayerNameOrderByContactNameAsc(String tenantId, String payerName);
}
