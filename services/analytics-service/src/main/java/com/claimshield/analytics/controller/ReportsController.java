package com.claimshield.analytics.controller;

import com.claimshield.analytics.model.Appeal;
import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.model.PayerResponse;
import com.claimshield.analytics.repository.AppealRepository;
import com.claimshield.analytics.repository.AuditLogRepository;
import com.claimshield.analytics.repository.ClaimRepository;
import com.claimshield.analytics.repository.PayerResponseRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class ReportsController {

    private final ClaimRepository claimRepo;
    private final AppealRepository appealRepo;
    private final AuditLogRepository auditRepo;
    private final PayerResponseRepository responseRepo;

    public ReportsController(ClaimRepository claimRepo, AppealRepository appealRepo,
                              AuditLogRepository auditRepo, PayerResponseRepository responseRepo) {
        this.claimRepo = claimRepo;
        this.appealRepo = appealRepo;
        this.auditRepo = auditRepo;
        this.responseRepo = responseRepo;
    }

    @GetMapping("/reports/summary")
    public Map<String, Object> reportSummary(HttpServletRequest request,
                                              @RequestParam(defaultValue = "30") int period_days) {
        String tenantId = getTenantId(request);
        List<Claim> allClaims = claimRepo.findByTenantId(tenantId);
        List<Appeal> allAppeals = appealRepo.findByTenantId(tenantId);
        long totalAudit = auditRepo.countByTenantId(tenantId);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(period_days);

        List<Claim> recent = allClaims.stream().filter(c -> c.getCreatedAt() != null && c.getCreatedAt().isAfter(cutoff)).toList();
        List<Appeal> recentAppeals = allAppeals.stream().filter(a -> a.getCreatedAt() != null && a.getCreatedAt().isAfter(cutoff)).toList();

        long totalDenied = allClaims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long totalRecovered = allClaims.stream().filter(c -> "won".equals(c.getStatus())).mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long periodDenied = recent.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long periodRecovered = recent.stream().filter(c -> "won".equals(c.getStatus())).mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();

        Map<String, Integer> statusDist = new LinkedHashMap<>();
        for (Claim c : allClaims) statusDist.merge(c.getStatus(), 1, Integer::sum);

        Map<String, Integer> denialCodeDist = new LinkedHashMap<>();
        for (Claim c : allClaims) denialCodeDist.merge(c.getDenialCode() != null ? c.getDenialCode() : "unknown", 1, Integer::sum);
        List<Map<String, Object>> topCodes = denialCodeDist.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(10)
                .map(e -> Map.<String, Object>of("code", e.getKey(), "count", e.getValue())).toList();

        Map<String, Map<String, Object>> payerSummary = new LinkedHashMap<>();
        for (Claim c : allClaims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            payerSummary.computeIfAbsent(payer, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("claims", 0); m.put("denied_cents", 0L); m.put("won", 0);
                return m;
            });
            Map<String, Object> ps = payerSummary.get(payer);
            ps.put("claims", (int) ps.get("claims") + 1);
            ps.put("denied_cents", (long) ps.get("denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            if ("won".equals(c.getStatus())) ps.put("won", (int) ps.get("won") + 1);
        }
        List<Map<String, Object>> payerList = payerSummary.entrySet().stream()
                .sorted(Comparator.<Map.Entry<String, Map<String, Object>>>comparingLong(e -> (long) e.getValue().get("denied_cents")).reversed())
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("payer", e.getKey());
                    m.putAll(e.getValue());
                    int cls = (int) e.getValue().get("claims");
                    int w = (int) e.getValue().get("won");
                    m.put("win_rate", cls > 0 ? Math.round((double) w / cls * 1000.0) / 10.0 : 0);
                    return m;
                }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period_days", period_days);
        result.put("generated_at", LocalDateTime.now().toString());
        result.put("totals", Map.of("claims", allClaims.size(), "denied_cents", totalDenied, "recovered_cents", totalRecovered,
                "recovery_rate", totalDenied > 0 ? Math.round((double) totalRecovered / totalDenied * 1000.0) / 10.0 : 0,
                "appeals", allAppeals.size(), "audit_entries", totalAudit));
        result.put("period", Map.of("new_claims", recent.size(), "denied_cents", periodDenied, "recovered_cents", periodRecovered, "new_appeals", recentAppeals.size()));
        result.put("status_distribution", statusDist);
        result.put("top_denial_codes", topCodes);
        result.put("payer_summary", payerList);
        return result;
    }

    @GetMapping("/reports/summary-text")
    public Map<String, Object> summaryText(HttpServletRequest request,
                                            @RequestParam(defaultValue = "30") int period_days) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minusDays(period_days);

        long totalDenied = claims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        List<Claim> wonClaims = claims.stream().filter(c -> "won".equals(c.getStatus())).toList();
        long totalRecovered = wonClaims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        List<Claim> recentClaims = claims.stream().filter(c -> c.getCreatedAt() != null && c.getCreatedAt().isAfter(cutoff)).toList();
        long lostCount = claims.stream().filter(c -> "lost".equals(c.getStatus())).count();
        int decided = wonClaims.size() + (int) lostCount;

        Map<String, Integer> byStatus = new LinkedHashMap<>();
        for (Claim c : claims) byStatus.merge(c.getStatus(), 1, Integer::sum);

        Map<String, Integer> codeCounts = new LinkedHashMap<>();
        for (Claim c : claims) codeCounts.merge(c.getDenialCode() != null ? c.getDenialCode() : "Unknown", 1, Integer::sum);

        List<String> lines = new ArrayList<>();
        lines.add(String.format("ClaimShield AI — Summary Report (%d-day period)", period_days));
        lines.add(String.format("Generated: %s", now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) + " UTC"));
        lines.add("");
        lines.add("=== Overview ===");
        lines.add(String.format("Total Claims: %d", claims.size()));
        lines.add(String.format("Total Denied: $%,.2f", totalDenied / 100.0));
        lines.add(String.format("Total Recovered: $%,.2f", totalRecovered / 100.0));
        lines.add(String.format("Win Rate: %d%%", decided > 0 ? Math.round((double) wonClaims.size() / decided * 100) : 0));
        lines.add(String.format("Total Appeals: %d", appeals.size()));
        lines.add("");
        lines.add(String.format("=== Last %d Days ===", period_days));
        lines.add(String.format("New Claims: %d", recentClaims.size()));
        lines.add(String.format("New Denied Amount: $%,.2f", recentClaims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum() / 100.0));
        lines.add("");
        lines.add("=== Status Distribution ===");
        byStatus.entrySet().stream().sorted(Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue).reversed())
                .forEach(e -> lines.add(String.format("  %s: %d", e.getKey().replace("_", " "), e.getValue())));
        lines.add("");
        lines.add("=== Top Denial Codes ===");
        codeCounts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(10)
                .forEach(e -> lines.add(String.format("  %s: %d claims", e.getKey(), e.getValue())));

        return Map.of("text", String.join("\n", lines), "period_days", period_days);
    }

    @GetMapping("/analytics/appeal-effectiveness")
    public Map<String, Object> appealEffectiveness(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);

        Set<String> appealedClaimIds = new HashSet<>();
        for (Appeal a : appeals) appealedClaimIds.add(a.getClaimId());

        Map<String, long[]> byCode = new LinkedHashMap<>();
        Map<String, long[]> byPayer = new LinkedHashMap<>();

        for (Claim c : claims) {
            String code = c.getDenialCode() != null ? c.getDenialCode() : "UNKNOWN";
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";

            for (Map.Entry<String, Map<String, long[]>> entry : List.of(
                    Map.entry(code, byCode), Map.entry(payer, byPayer))) {
                entry.getValue().computeIfAbsent(entry.getKey(), k -> new long[7]);
                long[] b = entry.getValue().get(entry.getKey());
                b[0]++; // total
                b[5] += c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0; // denied_cents
                if (appealedClaimIds.contains(c.getId())) b[1]++; // appealed
                if ("won".equals(c.getStatus())) {
                    b[2]++; // won
                    b[6] += c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0;
                } else if ("lost".equals(c.getStatus())) b[3]++;
                else if (Set.of("in_progress", "needs_review", "approved", "sent").contains(c.getStatus())) b[4]++;
            }
        }

        return Map.of(
                "by_denial_code", makeEffectivenessList(byCode),
                "by_payer", makeEffectivenessList(byPayer),
                "total_claims", claims.size(),
                "total_appeals", appeals.size()
        );
    }

    @GetMapping("/analytics/sla")
    public Map<String, Object> slaCompliance(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();

        Map<String, Integer> slaTargets = Map.of("initial_review", 2, "appeal_draft", 5, "appeal_approval", 3, "total_cycle", 14);

        List<Map<String, Object>> metrics = new ArrayList<>();
        for (Claim c : claims) {
            if (c.getCreatedAt() == null) continue;
            long cycleDays = java.time.Duration.between(c.getCreatedAt(), now).toDays();
            boolean cycleComplete = Set.of("won", "lost", "cancelled", "sent").contains(c.getStatus());

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("claim_id", c.getId()); m.put("claim_number", c.getClaimNumber());
            m.put("payer", c.getPayer()); m.put("status", c.getStatus());
            m.put("age_days", cycleDays);
            m.put("initial_review_days", cycleDays);
            m.put("initial_review_met", false);
            m.put("cycle_met", cycleComplete ? cycleDays <= slaTargets.get("total_cycle") : null);
            metrics.add(m);
        }

        long metReview = metrics.stream().filter(m -> Boolean.TRUE.equals(m.get("initial_review_met"))).count();
        List<Map<String, Object>> completed = metrics.stream().filter(m -> m.get("cycle_met") != null).toList();
        long metCycle = completed.stream().filter(m -> Boolean.TRUE.equals(m.get("cycle_met"))).count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total_claims", metrics.size());
        summary.put("initial_review_compliance", !metrics.isEmpty() ? Math.round((double) metReview / metrics.size() * 100) : 0);
        summary.put("cycle_compliance", !completed.isEmpty() ? Math.round((double) metCycle / completed.size() * 100) : 0);
        summary.put("avg_age_days", !metrics.isEmpty() ? Math.round(metrics.stream().mapToLong(m -> (long) m.get("age_days")).average().orElse(0)) : 0);

        metrics.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("age_days")).reversed());
        return Map.of("targets", slaTargets, "summary", summary, "claims", metrics);
    }

    @GetMapping("/system/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "analytics-service", "mode", "h2-file");
    }

    private List<Map<String, Object>> makeEffectivenessList(Map<String, long[]> data) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map.Entry<String, long[]> e : data.entrySet()) {
            long[] b = e.getValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", e.getKey()); m.put("total", b[0]); m.put("appealed", b[1]);
            m.put("won", b[2]); m.put("lost", b[3]); m.put("pending", b[4]);
            m.put("denied_cents", b[5]); m.put("recovered_cents", b[6]);
            m.put("win_rate", b[1] > 0 ? Math.round((double) b[2] / b[1] * 1000.0) / 10.0 : 0.0);
            list.add(m);
        }
        list.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("total")).reversed());
        return list;
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }
}
