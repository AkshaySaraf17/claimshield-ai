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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
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
        ParsedERA era = parserService.parse835(rawEdi(body));
        List<Map<String, Object>> summaries = parserService.eraToSummaries(era);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("payer_name", era.payerName());
        result.put("payee_name", era.payeeName());
        result.put("check_number", era.checkNumber());
        result.put("check_date", era.checkDate() != null ? era.checkDate().toString() : null);
        result.put("total_paid_cents", era.totalPaidCents());
        result.put("segment_count", era.rawSegmentCount());
        result.put("claims_found", summaries.size());
        result.put("claim_count", summaries.size());
        result.put("claims", summaries);
        result.put("errors", era.errors());
        return result;
    }

    /** Creates one workable claim (status pending_review) per remitted claim, as the Python import did. */
    @PostMapping("/import")
    @Transactional
    public ResponseEntity<Map<String, Object>> importEdi835(@RequestBody Map<String, String> body,
                                                             HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        ParsedERA era = parserService.parse835(rawEdi(body));

        List<String> createdIds = new ArrayList<>();
        for (ClaimRemittance cr : era.claims()) {
            String payer = cr.payerName() != null ? cr.payerName() : era.payerName();
            List<String> codes = cr.denialCodes();
            String denialCode = codes.isEmpty() ? null : codes.get(0);

            List<String> reasonParts = new ArrayList<>();
            cr.serviceLines().forEach(svc -> svc.adjustments().forEach(adj -> reasonParts.add(
                    adj.groupCode() + "-" + adj.reasonCode() + ": $" + dollars(adj.amountCents()))));

            Claim claim = new Claim();
            claim.setTenantId(tenantId);
            claim.setClaimNumber(cr.claimId());
            claim.setPatientName(cr.patientName());
            claim.setPayer(payer != null ? payer : "Unknown");
            claim.setDenialCode(denialCode);
            claim.setDenialReason(reasonParts.isEmpty() ? null : String.join("; ", reasonParts));
            claim.setRawDenialText("EDI 835 Remittance — Payer: " + (payer != null ? payer : "Unknown")
                    + ", Claim ID: " + (cr.claimId() != null ? cr.claimId() : "N/A")
                    + ", Denial code: " + (denialCode != null ? denialCode : "N/A")
                    + ", Charged: $" + dollars(cr.totalChargeCents())
                    + ", Paid: $" + dollars(cr.totalPaidCents())
                    + ", Denied: $" + dollars(cr.totalDeniedCents()));
            claim.setRawClinicalNotes("Imported from EDI 835 remittance advice");
            claim.setAmountDeniedCents(cr.totalDeniedCents());
            claim.setStatus("pending_review");
            claim.setFilingDeadline(referenceDataService.computeDeadline(claim.getPayer()));
            claim.setCreatedBy(userId);
            Claim saved = claimRepository.save(claim);
            auditService.writeAudit(tenantId, userId, "claim.created", "claim", saved.getId(),
                    "{\"source\":\"edi835\"}");
            createdIds.add(saved.getId());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("imported", createdIds.size());
        result.put("imported_count", createdIds.size());
        result.put("claim_ids", createdIds);
        result.put("payer_name", era.payerName());
        result.put("check_number", era.checkNumber());
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    /** The dashboard sends raw_edi (Python contract); content is still accepted. */
    private String rawEdi(Map<String, String> body) {
        String raw = body.get("raw_edi") != null ? body.get("raw_edi") : body.get("content");
        return raw != null ? raw : "";
    }

    private static String dollars(long cents) {
        return BigDecimal.valueOf(cents, 2).toPlainString();
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
