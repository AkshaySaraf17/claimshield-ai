package com.claimshield.analytics.controller;

import com.claimshield.analytics.model.Appeal;
import com.claimshield.analytics.model.AuditLog;
import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.repository.AppealRepository;
import com.claimshield.analytics.repository.AuditLogRepository;
import com.claimshield.analytics.repository.ClaimRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class StatsController {

    private final ClaimRepository claimRepo;
    private final AppealRepository appealRepo;
    private final AuditLogRepository auditRepo;

    public StatsController(ClaimRepository claimRepo, AppealRepository appealRepo, AuditLogRepository auditRepo) {
        this.claimRepo = claimRepo;
        this.appealRepo = appealRepo;
        this.auditRepo = auditRepo;
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);

        Map<String, Integer> byStatus = new LinkedHashMap<>();
        for (Claim c : claims) {
            byStatus.merge(c.getStatus(), 1, Integer::sum);
        }
        int total = claims.size();

        long totalDeniedCents = claims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long wonCents = claims.stream().filter(c -> "won".equals(c.getStatus())).mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();

        long pendingReview = appeals.stream().filter(a -> "draft".equals(a.getStatus()) || "needs_review".equals(a.getStatus())).count();

        List<AuditLog> recentAudits = auditRepo.findByTenantIdOrderByCreatedAtDesc(tenantId);
        List<Map<String, Object>> recentActivity = recentAudits.stream().limit(10).map(a -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.getId());
            m.put("action", a.getAction());
            m.put("resource_type", a.getResourceType());
            m.put("resource_id", a.getResourceId());
            m.put("actor_id", a.getActorId());
            m.put("created_at", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
            return m;
        }).collect(Collectors.toList());

        Map<String, long[]> payerMap = new LinkedHashMap<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            payerMap.computeIfAbsent(payer, k -> new long[2]);
            payerMap.get(payer)[0]++;
            payerMap.get(payer)[1] += c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0;
        }
        List<Map<String, Object>> byPayer = new ArrayList<>();
        payerMap.forEach((payer, vals) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("payer", payer);
            m.put("count", vals[0]);
            m.put("total_denied_cents", vals[1]);
            byPayer.add(m);
        });

        int wonCount = byStatus.getOrDefault("won", 0);
        int lostCount = byStatus.getOrDefault("lost", 0);
        int decided = wonCount + lostCount;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("claims_total", total);
        result.put("claims_by_status", byStatus);
        result.put("total_denied_cents", totalDeniedCents);
        result.put("total_recovered_cents", wonCents);
        result.put("win_rate", decided > 0 ? Math.round((double) wonCount / decided * 100.0) / 100.0 : null);
        result.put("appeals_total", appeals.size());
        result.put("appeals_pending_review", pendingReview);
        result.put("by_payer", byPayer);
        result.put("recent_activity", recentActivity);
        return result;
    }

    @GetMapping("/analytics/quick-stats")
    public Map<String, Object> quickStats(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();

        long totalClaims = claims.size();
        Set<String> activeStatuses = Set.of("pending_review", "in_progress", "needs_review", "approved", "sent");
        long activeClaims = claims.stream().filter(c -> activeStatuses.contains(c.getStatus())).count();
        long wonClaims = claims.stream().filter(c -> "won".equals(c.getStatus())).count();
        long totalDenied = claims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long totalRecovered = claims.stream().filter(c -> "won".equals(c.getStatus())).mapToLong(c -> c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0).sum();

        Set<String> overdueStatuses = Set.of("pending_review", "in_progress", "needs_review");
        long overdue = claims.stream().filter(c -> c.getFilingDeadline() != null && c.getFilingDeadline().isBefore(now) && overdueStatuses.contains(c.getStatus())).count();
        long pendingAppeals = appeals.stream().filter(a -> ("draft".equals(a.getStatus()) || "needs_review".equals(a.getStatus())) && a.getApprovedAt() == null).count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_claims", totalClaims);
        result.put("active_claims", activeClaims);
        result.put("won_claims", wonClaims);
        result.put("total_denied_cents", totalDenied);
        result.put("total_recovered_cents", totalRecovered);
        result.put("recovery_rate", totalDenied > 0 ? Math.round((double) totalRecovered / totalDenied * 1000.0) / 10.0 : 0);
        result.put("overdue_claims", overdue);
        result.put("pending_appeals", pendingAppeals);
        return result;
    }

    @GetMapping("/analytics/status-distribution")
    public List<Map<String, Object>> statusDistribution(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Claim c : claims) {
            counts.merge(c.getStatus(), 1, Integer::sum);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        counts.forEach((status, count) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("status", status);
            m.put("count", count);
            result.add(m);
        });
        return result;
    }

    @GetMapping("/analytics/scorecard")
    public Map<String, Object> scorecard(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();

        int total = claims.size();
        int won = 0, lost = 0, pending = 0;
        long totalDenied = 0, totalRecovered = 0, totalLost = 0;
        Set<String> openStatuses = Set.of("pending_review", "in_progress", "needs_review", "approved", "sent");
        Set<String> pendingStatuses = Set.of("pending_review", "in_progress", "needs_review");
        List<Claim> openClaims = new ArrayList<>();
        int overdue = 0;

        for (Claim c : claims) {
            totalDenied += c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0;
            if ("won".equals(c.getStatus())) {
                won++;
                totalRecovered += c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0;
            } else if ("lost".equals(c.getStatus())) {
                lost++;
                totalLost += c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0;
            }
            if (pendingStatuses.contains(c.getStatus())) pending++;
            if (openStatuses.contains(c.getStatus())) openClaims.add(c);
            if (c.getFilingDeadline() != null && c.getFilingDeadline().isBefore(now) && openStatuses.contains(c.getStatus()) && !"sent".equals(c.getStatus())) {
                overdue++;
            }
        }

        double avgAge = 0;
        if (!openClaims.isEmpty()) {
            long totalDays = 0;
            for (Claim c : openClaims) {
                if (c.getCreatedAt() != null) {
                    totalDays += java.time.Duration.between(c.getCreatedAt(), now).toDays();
                }
            }
            avgAge = Math.round((double) totalDays / openClaims.size() * 10.0) / 10.0;
        }

        int decided = won + lost;
        long appealsPending = appeals.stream().filter(a -> "draft".equals(a.getStatus()) || "needs_review".equals(a.getStatus())).count();
        long appealsApproved = appeals.stream().filter(a -> a.getApprovedBy() != null).count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_claims", total);
        result.put("won", won);
        result.put("lost", lost);
        result.put("pending", pending);
        result.put("win_rate", decided > 0 ? Math.round((double) won / decided * 1000.0) / 1000.0 : null);
        result.put("total_denied_cents", totalDenied);
        result.put("total_recovered_cents", totalRecovered);
        result.put("total_lost_cents", totalLost);
        result.put("recovery_rate", totalDenied > 0 ? Math.round((double) totalRecovered / totalDenied * 1000.0) / 1000.0 : null);
        result.put("open_claims", openClaims.size());
        result.put("avg_open_age_days", avgAge);
        result.put("appeals_pending_review", appealsPending);
        result.put("appeals_approved", appealsApproved);
        result.put("overdue_claims", overdue);
        return result;
    }

    @GetMapping("/analytics/pipeline")
    public Map<String, Object> pipeline(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();

        String[] stages = {"pending_review", "in_progress", "needs_review", "approved", "sent", "won", "lost", "cancelled"};
        Map<String, List<Map<String, Object>>> stageMap = new LinkedHashMap<>();
        for (String s : stages) stageMap.put(s, new ArrayList<>());

        for (Claim c : claims) {
            String status = c.getStatus() != null ? c.getStatus() : "pending_review";
            stageMap.computeIfAbsent(status, k -> new ArrayList<>());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", c.getId());
            item.put("claim_number", c.getClaimNumber());
            item.put("payer", c.getPayer());
            item.put("denial_code", c.getDenialCode());
            item.put("amount_cents", c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0);
            item.put("days_old", c.getCreatedAt() != null ? java.time.Duration.between(c.getCreatedAt(), now).toDays() : 0);
            stageMap.get(status).add(item);
        }

        List<Map<String, Object>> stageList = new ArrayList<>();
        for (String s : stages) {
            List<Map<String, Object>> items = stageMap.getOrDefault(s, List.of());
            long totalCents = items.stream().mapToLong(m -> ((Number) m.get("amount_cents")).longValue()).sum();
            Map<String, Object> stage = new LinkedHashMap<>();
            stage.put("name", s);
            stage.put("label", s.replace("_", " ").substring(0, 1).toUpperCase() + s.replace("_", " ").substring(1));
            stage.put("count", items.size());
            stage.put("total_cents", totalCents);
            stage.put("claims", items);
            stageList.add(stage);
        }

        return Map.of("stages", stageList);
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }
}
