package com.claimshield.core.repository;

import com.claimshield.core.model.Document;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocumentRepository extends JpaRepository<Document, String> {
    List<Document> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<Document> findByClaimIdOrderByCreatedAtDesc(String claimId);
}
