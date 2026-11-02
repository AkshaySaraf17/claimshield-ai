package com.claimshield.analytics.controller;

import com.claimshield.analytics.model.AuditLog;
import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.model.ClaimAssignment;
import com.claimshield.analytics.model.Clinic;
import com.claimshield.analytics.repository.AuditLogRepository;
import com.claimshield.analytics.repository.ClaimAssignmentRepository;
import com.claimshield.analytics.repository.ClaimRepository;
import com.claimshield.analytics.repository.ClinicRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics")
public class TeamController {

    private static final Map<String, String> TEAM_MEMBERS = Map.of(
            "dev-user-001", "Alice Chen", "dev-user-002", "Bob Martinez",
            "dev-user-003", "Carol Williams", "dev-user-004", "David Kim"
    );

    private final ClaimRepository claimRepo;
    private final ClaimAssignmentRepository assignmentRepo;
    private final AuditLogRepository auditRepo;
    private final ClinicRepository clinicRepo;

    public TeamController(ClaimRepository claimRepo, ClaimAssignmentRepository assignmentRepo,
                          AuditLogRepository auditRepo, ClinicRepository clinicRepo) {
        this.claimRepo = claimRepo;
        this.assignmentRepo = assignmentRepo;
        this.auditRepo = auditRepo;
        this.clinicRepo = clinicRepo;
    }

    @GetMapping("/team-performance")
    public List<Map<String, Object>> teamPerformance(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<ClaimAssignment> assignments = assignmentRepo.findByTenantId(tenantId);
        List<AuditLog> audits = auditRepo.findByTenantIdOrderByCreatedAtDesc(tenantId);

        Map<String, Claim> claimMap = new LinkedHashMap<>();
        for (Claim c : claims) claimMap.put(c.getId(), c);

        Map<String, String> latestAssignment = new LinkedHashMap<>();
        assignments.stream().sorted(Comparator.comparing(ClaimAssignment::getCreatedAt))
                .forEach(a -> latestAssignment.put(a.getClaimId(), a.getAssignedTo()));

        Map<String, Integer> actionsByUser = new LinkedHashMap<>();
        for (AuditLog a : audits) actionsByUser.merge(a.getActorId(), 1, Integer::sum);

        Map<String, Map<String, Object>> byUser = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : latestAssignment.entrySet()) {
            Claim claim = claimMap.get(entry.getKey());
            if (claim == null) continue;
            String userId = entry.getValue();
            byUser.computeIfAbsent(userId, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("user_id", k); m.put("user_name", TEAM_MEMBERS.getOrDefault(k, k));
                m.put("claims_assigned", 0); m.put("won", 0); m.put("lost", 0); m.put("pending", 0);
                m.put("recovered_cents", 0L); m.put("actions", actionsByUser.getOrDefault(k, 0));
                return m;
            });
            Map<String, Object> u = byUser.get(userId);
            u.put("claims_assigned", (int) u.get("claims_assigned") + 1);
            if ("won".equals(claim.getStatus())) {
                u.put("won", (int) u.get("won") + 1);
                u.put("recovered_cents", (long) u.get("recovered_cents") + (claim.getAmountApprovedCents() != null ? claim.getAmountApprovedCents() : 0));
            } else if ("lost".equals(claim.getStatus())) u.put("lost", (int) u.get("lost") + 1);
            else u.put("pending", (int) u.get("pending") + 1);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (String userId : TEAM_MEMBERS.keySet()) {
            Map<String, Object> u = byUser.getOrDefault(userId, new LinkedHashMap<>(Map.of(
                    "user_id", userId, "user_name", TEAM_MEMBERS.get(userId),
                    "claims_assigned", 0, "won", 0, "lost", 0, "pending", 0,
                    "recovered_cents", 0L, "actions", actionsByUser.getOrDefault(userId, 0)
            )));
            int w = (int) u.get("won"), l = (int) u.get("lost");
            u.put("win_rate", (w + l) > 0 ? Math.round((double) w / (w + l) * 1000.0) / 10.0 : null);
            result.add(u);
        }
        result.sort(Comparator.<Map<String, Object>>comparingInt(m -> (int) m.get("claims_assigned")).reversed());
        return result;
    }

    @GetMapping("/workload")
    public List<Map<String, Object>> workload(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<ClaimAssignment> assignments = assignmentRepo.findByTenantId(tenantId);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);

        Map<String, Claim> claimMap = new LinkedHashMap<>();
        for (Claim c : claims) claimMap.put(c.getId(), c);

        Map<String, String> latest = new LinkedHashMap<>();
        assignments.stream().sorted(Comparator.comparing(ClaimAssignment::getCreatedAt))
                .forEach(a -> latest.put(a.getClaimId(), a.getAssignedTo()));

        Map<String, Map<String, Object>> byUser = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : latest.entrySet()) {
            Claim claim = claimMap.get(entry.getKey());
            if (claim == null) continue;
            String userId = entry.getValue();
            byUser.computeIfAbsent(userId, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("user_id", k); m.put("user_name", TEAM_MEMBERS.getOrDefault(k, k));
                m.put("total", 0); m.put("active", 0); m.put("pending_review", 0); m.put("total_value_cents", 0L);
                return m;
            });
            Map<String, Object> u = byUser.get(userId);
            u.put("total", (int) u.get("total") + 1);
            if (Set.of("pending_review", "in_progress", "needs_review", "approved").contains(claim.getStatus()))
                u.put("active", (int) u.get("active") + 1);
            if ("pending_review".equals(claim.getStatus())) u.put("pending_review", (int) u.get("pending_review") + 1);
            u.put("total_value_cents", (long) u.get("total_value_cents") + (claim.getAmountDeniedCents() != null ? claim.getAmountDeniedCents() : 0));
        }

        List<Map<String, Object>> result = new ArrayList<>(byUser.values());
        result.sort(Comparator.<Map<String, Object>>comparingInt(m -> (int) m.get("active")).reversed());
        return result;
    }

    @GetMapping("/user-activity")
    public Map<String, Object> userActivity(HttpServletRequest request,
                                             @RequestParam(defaultValue = "30") int days) {
        String tenantId = getTenantId(request);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(days);
        List<AuditLog> allAudits = auditRepo.findByTenantIdOrderByCreatedAtDesc(tenantId);
        List<AuditLog> entries = allAudits.stream().filter(a -> a.getCreatedAt() != null && a.getCreatedAt().isAfter(cutoff)).toList();

        Map<String, Map<String, Object>> byUser = new LinkedHashMap<>();
        Map<String, Integer> byAction = new LinkedHashMap<>();
        Map<String, Integer> daily = new TreeMap<>();

        for (AuditLog e : entries) {
            String uid = e.getActorId();
            byUser.computeIfAbsent(uid, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("user_id", k); m.put("role", "user"); m.put("actions", 0); m.put("last_action", null);
                return m;
            });
            Map<String, Object> u = byUser.get(uid);
            u.put("actions", (int) u.get("actions") + 1);
            if (u.get("last_action") == null) u.put("last_action", e.getCreatedAt().toString());

            byAction.merge(e.getAction(), 1, Integer::sum);
            if (e.getCreatedAt() != null) {
                String dayKey = e.getCreatedAt().toLocalDate().toString();
                daily.merge(dayKey, 1, Integer::sum);
            }
        }

        List<Map<String, Object>> recent = entries.stream().limit(50).map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId()); m.put("actor_id", e.getActorId()); m.put("action", e.getAction());
            m.put("resource_type", e.getResourceType()); m.put("resource_id", e.getResourceId());
            m.put("detail", e.getDetail()); m.put("created_at", e.getCreatedAt().toString());
            return m;
        }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period_days", days);
        result.put("total_actions", entries.size());
        result.put("users", byUser.values().stream().sorted(Comparator.<Map<String, Object>>comparingInt(m -> (int) m.get("actions")).reversed()).toList());
        result.put("actions", byAction.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(e -> Map.of("action", e.getKey(), "count", e.getValue())).toList());
        result.put("daily", daily.entrySet().stream().map(e -> Map.of("date", e.getKey(), "count", e.getValue())).toList());
        result.put("recent", recent);
        return result;
    }

    @GetMapping("/clinics")
    public List<Map<String, Object>> clinicAnalytics(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Clinic> clinics = clinicRepo.findByTenantId(tenantId);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);

        Map<String, Clinic> clinicMap = new LinkedHashMap<>();
        for (Clinic c : clinics) clinicMap.put(c.getId(), c);

        Map<String, Map<String, Object>> stats = new LinkedHashMap<>();
        for (Claim c : claims) {
            String cid = c.getClinicId();
            stats.computeIfAbsent(cid, k -> {
                Clinic clinic = clinicMap.get(k);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("clinic_id", k); m.put("clinic_name", clinic != null ? clinic.getName() : "Unknown");
                m.put("npi", clinic != null ? clinic.getNpi() : null);
                m.put("total_claims", 0); m.put("total_denied_cents", 0L); m.put("total_recovered_cents", 0L);
                m.put("won", 0); m.put("lost", 0); m.put("pending", 0);
                m.put("_codes", new LinkedHashMap<String, Integer>());
                return m;
            });
            Map<String, Object> s = stats.get(cid);
            s.put("total_claims", (int) s.get("total_claims") + 1);
            s.put("total_denied_cents", (long) s.get("total_denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            if ("won".equals(c.getStatus())) {
                s.put("won", (int) s.get("won") + 1);
                s.put("total_recovered_cents", (long) s.get("total_recovered_cents") + (c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0));
            } else if ("lost".equals(c.getStatus())) s.put("lost", (int) s.get("lost") + 1);
            else if (Set.of("pending_review", "in_progress", "needs_review").contains(c.getStatus()))
                s.put("pending", (int) s.get("pending") + 1);
            if (c.getDenialCode() != null) {
                @SuppressWarnings("unchecked") Map<String, Integer> codes = (Map<String, Integer>) s.get("_codes");
                codes.merge(c.getDenialCode(), 1, Integer::sum);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> s : stats.values()) {
            int w = (int) s.get("won"), l = (int) s.get("lost");
            s.put("win_rate", (w + l) > 0 ? Math.round((double) w / (w + l) * 100.0) / 100.0 : null);
            @SuppressWarnings("unchecked") Map<String, Integer> codes = (Map<String, Integer>) s.remove("_codes");
            s.put("top_denial_codes", codes.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(5)
                    .map(e -> Map.of("code", e.getKey(), "count", e.getValue())).toList());
            result.add(s);
        }
        result.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("total_denied_cents")).reversed());
        return result;
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }
}
