package com.claimshield.workflow.repository;

import com.claimshield.workflow.model.ClaimWatchlist;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ClaimWatchlistRepository extends JpaRepository<ClaimWatchlist, String> {
    List<ClaimWatchlist> findByTenantIdAndUserIdOrderByCreatedAtDesc(String tenantId, String userId);
}
