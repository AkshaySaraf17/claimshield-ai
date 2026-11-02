package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.Escalation;
import com.claimshield.workflow.repository.EscalationRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class EscalationController {

    private final EscalationRepository repository;

    public EscalationController(EscalationRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/escalations")
    public List<Escalation> list(@RequestParam(required = false) String status, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        if (status != null) return repository.findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId, status);
        return repository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @PostMapping("/claims/{claimId}/escalate")
    @ResponseStatus(HttpStatus.CREATED)
    public Escalation escalate(@PathVariable String claimId,
                                @RequestBody(required = false) Map<String, String> body,
                                HttpServletRequest request) {
        Escalation e = new Escalation();
        e.setTenantId(getTenantId(request));
        e.setClaimId(claimId);
        e.setEscalatedBy(getUserId(request));
        if (body != null) {
            e.setEscalatedTo(body.get("escalated_to"));
            e.setReason(body.get("reason"));
        }
        return repository.save(e);
    }

    @PatchMapping("/escalations/{id}/resolve")
    public ResponseEntity<?> resolve(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(e -> e.getTenantId().equals(getTenantId(request)))
                .map(e -> {
                    e.setStatus("resolved");
                    e.setResolvedAt(LocalDateTime.now());
                    return ResponseEntity.ok(repository.save(e));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }

    private String getUserId(HttpServletRequest request) {
        String h = request.getHeader("X-User-Id");
        return h != null ? h : "dev-user-001";
    }
}
