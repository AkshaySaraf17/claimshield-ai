package com.claimshield.core.config;

import com.claimshield.core.model.*;
import com.claimshield.core.repository.*;
import com.claimshield.core.service.AuditService;
import com.claimshield.core.service.ReferenceDataService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Configuration
public class DataSeeder {

    @Bean
    CommandLineRunner seedData(ClaimRepository claimRepo,
                               AuditService auditService,
                               ReferenceDataService referenceDataService,
                               TenantRepository tenantRepo,
                               ClinicRepository clinicRepo,
                               ClaimNoteRepository noteRepo,
                               ClaimCommentRepository commentRepo,
                               ClaimTagRepository tagRepo,
                               ClaimAssignmentRepository assignmentRepo,
                               ClaimCostRepository costRepo,
                               ClaimStatusHistoryRepository statusHistoryRepo) {
        return args -> {
            if (claimRepo.count() > 0) return;

            String tenantId = "00000000-0000-0000-0000-000000000001";

            Tenant tenant = new Tenant();
            tenant.setId(tenantId);
            tenant.setName("ClaimShield Demo");
            tenant.setSlug("demo");
            tenant.setIsActive(true);
            tenantRepo.save(tenant);

            String clinicId = UUID.randomUUID().toString();
            Clinic clinic = new Clinic();
            clinic.setId(clinicId);
            clinic.setTenantId(tenantId);
            clinic.setName("Metro Health Clinic");
            clinic.setNpi("1234567890");
            clinicRepo.save(clinic);

            String clinic2Id = UUID.randomUUID().toString();
            Clinic clinic2 = new Clinic();
            clinic2.setId(clinic2Id);
            clinic2.setTenantId(tenantId);
            clinic2.setName("Westside Medical Group");
            clinic2.setNpi("0987654321");
            clinicRepo.save(clinic2);

            String[][] seeds = {
                {"Aetna", "CO-50", "Not medically necessary", "245000", "pending_review", "John Smith", "PT-001"},
                {"UnitedHealthcare", "CO-4", "Procedure code inconsistent", "1850000", "in_progress", "Jane Doe", "PT-002"},
                {"Blue Cross Blue Shield", "CO-29", "Filing deadline exceeded", "1282500", "pending_review", "Robert Johnson", "PT-003"},
                {"Cigna", "CO-197", "Precertification not obtained", "425000", "approved", "Maria Garcia", "PT-004"},
                {"Humana", "PR-1", "Patient responsibility deductible", "18500", "won", "Alice Chen", "PT-005"},
                {"UnitedHealthcare", "CO-109", "Not covered by plan", "175000", "in_progress", "Bob Martinez", "PT-006"},
                {"Aetna", "CO-97", "Payment adjusted", "890000", "needs_review", "Carol Williams", "PT-007"},
                {"Medicare", "CO-16", "Missing information", "67500", "sent", "David Kim", "PT-008"},
                {"Cigna", "PR-2", "Coinsurance amount", "54000", "lost", "John Smith", "PT-001"},
                {"Blue Cross Blue Shield", "CO-29", "Late filing", "32500", "pending_review", "Jane Doe", "PT-002"},
            };

            String[] users = {"dev-user-001", "dev-user-002", "dev-user-003"};
            String[] tagOptions = {"urgent", "high-value", "follow-up", "escalated", "pending-docs", "auto-routed"};

            for (int i = 0; i < seeds.length; i++) {
                Claim c = new Claim();
                String claimId = UUID.randomUUID().toString();
                c.setId(claimId);
                c.setTenantId(tenantId);
                c.setClaimNumber("CLM-2024-" + String.format("%03d", i + 1));
                c.setPayer(seeds[i][0]);
                c.setDenialCode(seeds[i][1]);
                c.setDenialReason(seeds[i][2]);
                c.setAmountDeniedCents(Long.parseLong(seeds[i][3]));
                c.setAmountRecoveredCents("won".equals(seeds[i][4]) ? Long.parseLong(seeds[i][3]) / 2 : 0L);
                c.setStatus(seeds[i][4]);
                c.setPatientName(seeds[i][5]);
                c.setPatientId(seeds[i][6]);
                c.setClinicId(i % 2 == 0 ? clinicId : clinic2Id);
                c.setClinicName(i % 2 == 0 ? "Metro Health Clinic" : "Westside Medical Group");
                c.setCreatedBy(users[i % users.length]);
                c.setFilingDeadline(referenceDataService.computeDeadline(seeds[i][0]));
                c.setCreatedAt(LocalDateTime.now().minusDays(seeds.length - i));
                claimRepo.save(c);

                ClaimNote note = new ClaimNote();
                note.setTenantId(tenantId);
                note.setClaimId(claimId);
                note.setAuthorId(users[i % users.length]);
                note.setContent("Initial review note for " + c.getClaimNumber() + ". Denial code " + c.getDenialCode() + " — " + c.getDenialReason());
                noteRepo.save(note);

                if (i % 3 == 0) {
                    ClaimComment comment = new ClaimComment();
                    comment.setTenantId(tenantId);
                    comment.setClaimId(claimId);
                    comment.setAuthorId(users[(i + 1) % users.length]);
                    comment.setBody("Reviewed the denial details. Recommend proceeding with appeal.");
                    commentRepo.save(comment);
                }

                ClaimTag tag = new ClaimTag();
                tag.setTenantId(tenantId);
                tag.setClaimId(claimId);
                tag.setCreatedBy(users[i % users.length]);
                tag.setTag(tagOptions[i % tagOptions.length]);
                tagRepo.save(tag);

                if (Long.parseLong(seeds[i][3]) >= 500000) {
                    ClaimTag hvTag = new ClaimTag();
                    hvTag.setTenantId(tenantId);
                    hvTag.setClaimId(claimId);
                    hvTag.setCreatedBy("system");
                    hvTag.setTag("high-value");
                    tagRepo.save(hvTag);
                }

                if (i < 5) {
                    ClaimAssignment assignment = new ClaimAssignment();
                    assignment.setTenantId(tenantId);
                    assignment.setClaimId(claimId);
                    assignment.setAssignedTo(users[(i + 1) % users.length]);
                    assignment.setAssignedBy("system");
                    assignment.setNote("Auto-assigned based on workload");
                    assignmentRepo.save(assignment);
                }

                if (i % 2 == 0) {
                    ClaimCost cost = new ClaimCost();
                    cost.setTenantId(tenantId);
                    cost.setClaimId(claimId);
                    cost.setCategory("appeal_processing");
                    cost.setDescription("Staff time for appeal preparation");
                    cost.setAmountCents(7500L);
                    cost.setRecordedBy(users[i % users.length]);
                    costRepo.save(cost);
                }

                if (!seeds[i][4].equals("pending_review")) {
                    ClaimStatusHistory sh = new ClaimStatusHistory();
                    sh.setTenantId(tenantId);
                    sh.setClaimId(claimId);
                    sh.setFromStatus("pending_review");
                    sh.setToStatus(seeds[i][4]);
                    sh.setChangedBy(users[i % users.length]);
                    sh.setReason("Initial triage");
                    statusHistoryRepo.save(sh);
                }
            }

            auditService.writeAudit(tenantId, "system", "seed.completed", "tenant", tenantId,
                    "{\"claims_seeded\":10,\"notes\":10,\"tags\":10,\"assignments\":5,\"costs\":5}");
        };
    }
}
