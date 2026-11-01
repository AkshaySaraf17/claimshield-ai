package com.claimshield.core.config;

import com.claimshield.core.model.Claim;
import com.claimshield.core.repository.ClaimRepository;
import com.claimshield.core.service.AuditService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.util.UUID;

@Configuration
public class DataSeeder {

    @Bean
    CommandLineRunner seedData(ClaimRepository claimRepo, AuditService auditService) {
        return args -> {
            if (claimRepo.count() > 0) return;

            String tenantId = "00000000-0000-0000-0000-000000000001";
            String[][] seeds = {
                {"Aetna", "CO-50", "Not medically necessary", "245000", "pending_review", "John Smith"},
                {"UnitedHealthcare", "CO-4", "Procedure code inconsistent", "1850000", "in_progress", "Jane Doe"},
                {"Blue Cross Blue Shield", "CO-29", "Filing deadline exceeded", "1282500", "pending_review", "Robert Johnson"},
                {"Cigna", "CO-197", "Precertification not obtained", "425000", "approved", "Maria Garcia"},
                {"Humana", "PR-1", "Patient responsibility deductible", "18500", "won", "Alice Chen"},
                {"UnitedHealthcare", "CO-109", "Not covered by plan", "175000", "in_progress", "Bob Martinez"},
                {"Aetna", "CO-97", "Payment adjusted", "890000", "needs_review", "Carol Williams"},
                {"Medicare", "CO-16", "Missing information", "67500", "sent", "David Kim"},
                {"Cigna", "PR-2", "Coinsurance amount", "54000", "lost", "John Smith"},
                {"Blue Cross Blue Shield", "CO-29", "Late filing", "32500", "pending_review", "Jane Doe"},
            };

            for (int i = 0; i < seeds.length; i++) {
                Claim c = new Claim();
                c.setId(UUID.randomUUID().toString());
                c.setTenantId(tenantId);
                c.setClaimNumber("CLM-2024-" + String.format("%03d", i + 1));
                c.setPayer(seeds[i][0]);
                c.setDenialCode(seeds[i][1]);
                c.setDenialReason(seeds[i][2]);
                c.setAmountDeniedCents(Long.parseLong(seeds[i][3]));
                c.setAmountRecoveredCents("won".equals(seeds[i][4]) ? Long.parseLong(seeds[i][3]) / 2 : 0L);
                c.setStatus(seeds[i][4]);
                c.setPatientName(seeds[i][5]);
                c.setCreatedBy("dev-user-001");
                c.setCreatedAt(LocalDateTime.now().minusDays(seeds.length - i));
                claimRepo.save(c);
            }

            auditService.writeAudit(tenantId, "system", "seed.completed", "system", null,
                    "{\"claims_seeded\":10}");
        };
    }
}
