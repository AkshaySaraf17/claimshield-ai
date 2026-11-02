package com.claimshield.core.controller;

import com.claimshield.core.model.Claim;
import com.claimshield.core.model.ClaimAssignment;
import com.claimshield.core.repository.AuditLogRepository;
import com.claimshield.core.repository.ClaimAssignmentRepository;
import com.claimshield.core.repository.ClaimRepository;
import com.claimshield.core.service.ClaimMapper;
import com.claimshield.core.service.ReferenceDataService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/** Tenant-wide workspace views ported from Python dev_server (deadlines, assignments, calendar, exports, activity). */
@RestController
@RequestMapping("/api/v1")
public class WorkspaceController {

    private static final Set<String> OPEN_STATUSES = Set.of("pending_review", "in_progress", "needs_review");
    private static final Set<String> CLOSED_STATUSES = Set.of("won", "lost", "cancelled");

    private final ClaimRepository claimRepository;
    private final ClaimAssignmentRepository assignmentRepository;
    private final AuditLogRepository auditLogRepository;
    private final ReferenceDataService referenceDataService;

    public WorkspaceController(ClaimRepository claimRepository,
                               ClaimAssignmentRepository assignmentRepository,
                               AuditLogRepository auditLogRepository,
                               ReferenceDataService referenceDataService) {
        this.claimRepository = claimRepository;
        this.assignmentRepository = assignmentRepository;
        this.auditLogRepository = auditLogRepository;
        this.referenceDataService = referenceDataService;
    }

    @GetMapping("/deadlines")
    public List<Map<String, Object>> deadlines(@RequestParam(defaultValue = "50") int limit, HttpServletRequest request) {
        LocalDateTime now = LocalDateTime.now();
        return claimRepository.findByTenantIdOrderByCreatedAtDesc(getTenantId(request)).stream()
                .filter(c -> c.getFilingDeadline() != null && !CLOSED_STATUSES.contains(c.getStatus()))
                .sorted(Comparator.comparing(Claim::getFilingDeadline))
                .limit(Math.min(Math.max(limit, 1), 200))
                .map(c -> {
                    long days = ChronoUnit.DAYS.between(now, c.getFilingDeadline());
                    Map<String, Object> m = new LinkedHashMap<>(ClaimMapper.toMap(c));
                    m.put("days_remaining", Math.max(days, 0));
                    m.put("is_overdue", days < 0);
                    m.put("urgency", days < 0 ? "overdue" : days <= 7 ? "critical" : days <= 30 ? "urgent" : "normal");
                    return m;
                })
                .toList();
    }

    @GetMapping("/assignments")
    public List<Map<String, Object>> assignments(@RequestParam(name = "assigned_to", required = false) String assignedTo,
                                                 HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<ClaimAssignment> rows = assignedTo != null
                ? assignmentRepository.findByTenantIdAndAssignedToOrderByCreatedAtDesc(tenantId, assignedTo)
                : assignmentRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);

        Set<String> claimIds = rows.stream().map(ClaimAssignment::getClaimId).collect(Collectors.toSet());
        Map<String, Map<String, Object>> claims = claimRepository.findAllById(claimIds).stream()
                .collect(Collectors.toMap(Claim::getId, ClaimMapper::toMap));

        return rows.stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.getId());
            m.put("claim_id", a.getClaimId());
            m.put("assigned_to", a.getAssignedTo());
            m.put("assignee_name", ReferenceDataService.teamMemberName(a.getAssignedTo()));
            m.put("assigned_by", a.getAssignedBy());
            m.put("note", a.getNote());
            m.put("created_at", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
            m.put("claim", claims.get(a.getClaimId()));
            return m;
        }).toList();
    }

    @GetMapping("/calendar/deadlines")
    public Map<String, Object> calendarDeadlines(HttpServletRequest request) {
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> events = claimRepository.findByTenantIdOrderByCreatedAtDesc(getTenantId(request)).stream()
                .filter(c -> OPEN_STATUSES.contains(c.getStatus()))
                .map(c -> {
                    int deadlineDays = referenceDataService.filingDaysFor(c.getPayer());
                    LocalDateTime created = c.getCreatedAt() != null ? c.getCreatedAt() : now;
                    LocalDateTime deadline = c.getFilingDeadline() != null ? c.getFilingDeadline() : created.plusDays(deadlineDays);
                    long remaining = ChronoUnit.DAYS.between(now, deadline);

                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("claim_id", c.getId());
                    m.put("claim_number", c.getClaimNumber());
                    m.put("payer_name", c.getPayer());
                    m.put("denial_code", c.getDenialCode());
                    m.put("amount_denied_cents", c.getAmountDeniedCents());
                    m.put("status", c.getStatus());
                    m.put("created_at", created.toString());
                    m.put("deadline_date", deadline.toString());
                    m.put("deadline_days", deadlineDays);
                    m.put("days_remaining", remaining);
                    m.put("is_overdue", remaining < 0);
                    m.put("is_urgent", remaining >= 0 && remaining <= 14);
                    return m;
                })
                .sorted(Comparator.comparingLong(m -> (long) m.get("days_remaining")))
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("events", events);
        result.put("total", events.size());
        result.put("overdue", events.stream().filter(e -> (boolean) e.get("is_overdue")).count());
        result.put("urgent", events.stream().filter(e -> (boolean) e.get("is_urgent")).count());
        result.put("payer_deadlines", ReferenceDataService.PAYER_FILING_DAYS);
        return result;
    }

    @GetMapping("/exports")
    public List<Map<String, String>> exports() {
        return List.of(
                Map.of("id", "claims-csv", "name", "Claims CSV Export",
                        "description", "All claims with status, amounts, and denial codes",
                        "url", "/api/v1/claims/export/csv", "format", "CSV"),
                Map.of("id", "summary-text", "name", "Summary Text Report",
                        "description", "Plain-text executive summary of denial operations",
                        "url", "/api/v1/reports/summary-text", "format", "TXT"),
                Map.of("id", "scorecard-json", "name", "KPI Scorecard (JSON)",
                        "description", "Machine-readable KPI data for dashboards",
                        "url", "/api/v1/analytics/scorecard", "format", "JSON"),
                Map.of("id", "financials-json", "name", "Financial Report (JSON)",
                        "description", "Reconciliation data with monthly trends",
                        "url", "/api/v1/analytics/financials", "format", "JSON"),
                Map.of("id", "team-json", "name", "Team Performance (JSON)",
                        "description", "Per-member productivity metrics",
                        "url", "/api/v1/analytics/team-performance", "format", "JSON")
        );
    }

    @GetMapping("/my-activity")
    public List<Map<String, Object>> myActivity(@RequestParam(defaultValue = "50") int limit, HttpServletRequest request) {
        return auditLogRepository.findByTenantIdAndActorIdOrderByCreatedAtDesc(getTenantId(request), getUserId(request)).stream()
                .limit(Math.min(Math.max(limit, 1), 200))
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", a.getId());
                    m.put("action", a.getAction());
                    m.put("resource_type", a.getResourceType());
                    m.put("resource_id", a.getResourceId());
                    m.put("created_at", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
                    return m;
                })
                .toList();
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
