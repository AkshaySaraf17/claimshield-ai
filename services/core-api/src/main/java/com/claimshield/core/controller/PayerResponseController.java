package com.claimshield.core.controller;

import com.claimshield.core.model.PayerResponse;
import com.claimshield.core.repository.PayerResponseRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claims/{claimId}/responses")
public class PayerResponseController {

    private final PayerResponseRepository responseRepository;
    private final AuditService auditService;

    public PayerResponseController(PayerResponseRepository responseRepository, AuditService auditService) {
        this.responseRepository = responseRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<PayerResponse> listResponses(@PathVariable String claimId, HttpServletRequest request) {
        return responseRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PayerResponse createResponse(@PathVariable String claimId,
                                        @RequestBody Map<String, Object> body,
                                        HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        PayerResponse resp = new PayerResponse();
        resp.setTenantId(tenantId);
        resp.setClaimId(claimId);
        resp.setRecordedBy(userId);
        resp.setResponseType((String) body.getOrDefault("response_type", "acknowledgment"));
        resp.setResponseText((String) body.get("response_text"));
        resp.setAppealId((String) body.get("appeal_id"));
        if (body.containsKey("amount_approved_cents")) {
            resp.setAmountApprovedCents(((Number) body.get("amount_approved_cents")).longValue());
        }

        PayerResponse saved = responseRepository.save(resp);
        auditService.writeAudit(tenantId, userId, "payer_response.recorded", "claim", claimId,
                "{\"response_id\":\"" + saved.getId() + "\",\"type\":\"" + saved.getResponseType() + "\"}");
        return saved;
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
