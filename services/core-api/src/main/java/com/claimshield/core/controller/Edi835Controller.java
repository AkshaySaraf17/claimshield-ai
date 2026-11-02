package com.claimshield.core.controller;

import com.claimshield.core.model.Claim;
import com.claimshield.core.repository.ClaimRepository;
import com.claimshield.core.service.AuditService;
import com.claimshield.core.service.Edi835ParserService;
import com.claimshield.core.service.Edi835ParserService.*;
import com.claimshield.core.service.ReferenceDataService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/edi835")
public class Edi835Controller {

    private final Edi835ParserService parserService;
    private final ClaimRepository claimRepository;
    private final AuditService auditService;
    private final ReferenceDataService referenceDataService;

    public Edi835Controller(Edi835ParserService parserService,
                            ClaimRepository claimRepository,
                            AuditService auditService,
                            ReferenceDataService referenceDataService) {
        this.parserService = parserService;
        this.claimRepository = claimRepository;
        this.auditService = auditService;
        this.referenceDataService = referenceDataService;
    }

    @PostMapping("/parse")
    public Map<String, Object> parseEdi835(@RequestBody Map<String, String> body) {
        String ediContent = body.get("content");
        if (ediContent == null || ediContent.isBlank()) {
            return Map.of("error", "content is required");
        }

        ParsedERA era = parserService.parse835(ediContent);
        List<Map<String, Object>> summaries = parserService.eraToSummaries(era);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("payer_name", era.payerName());
        result.put("payee_name", era.payeeName());
        result.put("check_number", era.checkNumber());
        result.put("check_date", era.checkDate() != null ? era.checkDate().toString() : null);
        result.put("total_paid_cents", era.totalPaidCents());
        result.put("claim_count", era.claims().size());
        result.put("segment_count", era.rawSegmentCount());
        result.put("errors", era.errors());
        result.put("claims", summaries);
        return result;
    }

    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> importEdi835(@RequestBody Map<String, String> body,
                                                             HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        String ediContent = body.get("content");

        if (ediContent == null || ediContent.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "content is required"));
        }

        ParsedERA era = parserService.parse835(ediContent);
        List<Map<String, Object>> imported = new ArrayList<>();

        for (ClaimRemittance cr : era.claims()) {
            Claim claim = new Claim();
            claim.setTenantId(tenantId);
            claim.setPatientName(cr.patientName());
            claim.setPayer(cr.payerName() != null ? cr.payerName() : era.payerName());
            claim.setAmountDeniedCents(cr.totalDeniedCents());

            List<String> denialCodes = cr.denialCodes();
            if (!denialCodes.isEmpty()) {
                claim.setDenialCode(denialCodes.get(0));
                claim.setDenialReason(String.join(", ", denialCodes));
                claim.setStatus("denied");
            } else {
                claim.setStatus("paid");
            }

            claim.setFilingDeadline(referenceDataService.computeDeadline(claim.getPayer()));
            claim.setCreatedBy(userId);

            Claim saved = claimRepository.save(claim);

            auditService.writeAudit(tenantId, userId, "claim.imported_from_edi",
                    "claim", saved.getId(),
                    "{\"source\":\"edi_835\",\"payer\":\"" + claim.getPayer() + "\"}");

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", saved.getId());
            entry.put("patient_name", saved.getPatientName());
            entry.put("payer_name", saved.getPayer());
            entry.put("amount_denied_cents", saved.getAmountDeniedCents());
            entry.put("status", saved.getStatus());
            entry.put("denial_code", saved.getDenialCode());
            imported.add(entry);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("imported_count", imported.size());
        result.put("payer_name", era.payerName());
        result.put("check_number", era.checkNumber());
        result.put("claims", imported);

        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    private String getTenantId(HttpServletRequest request) {
        String header = request.getHeader("X-Tenant-Id");
        return header != null ? header : "00000000-0000-0000-0000-000000000001";
    }

    private String getUserId(HttpServletRequest request) {
        String header = request.getHeader("X-User-Id");
        return header != null ? header : "dev-user-001";
    }
}
