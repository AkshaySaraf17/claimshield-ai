package com.claimshield.analytics.controller;

import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.model.ClaimCost;
import com.claimshield.analytics.repository.ClaimCostRepository;
import com.claimshield.analytics.repository.ClaimRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics")
public class FinancialController {

    private final ClaimRepository claimRepo;
    private final ClaimCostRepository costRepo;

    public FinancialController(ClaimRepository claimRepo, ClaimCostRepository costRepo) {
        this.claimRepo = claimRepo;
        this.costRepo = costRepo;
    }

    @GetMapping("/financials")
    public Map<String, Object> financials(HttpServletRequest request,
                                           @RequestParam(defaultValue = "90") int period_days) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(period_days);

        long totalDenied = 0, totalRecovered = 0, totalLost = 0, totalPending = 0, totalCancelled = 0;
        long periodDenied = 0, periodRecovered = 0;
        Map<String, long[]> byPayer = new LinkedHashMap<>();
        Map<String, long[]> monthly = new TreeMap<>();

        for (Claim c : claims) {
            long denied = c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0;
            totalDenied += denied;
            String status = c.getStatus();
            if ("won".equals(status)) totalRecovered += denied;
            else if ("lost".equals(status)) totalLost += denied;
            else if ("cancelled".equals(status)) totalCancelled += denied;
            else totalPending += denied;

            if (c.getCreatedAt() != null && c.getCreatedAt().isAfter(cutoff)) {
                periodDenied += denied;
                if ("won".equals(status)) periodRecovered += denied;
            }

            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            byPayer.computeIfAbsent(payer, k -> new long[4]);
            long[] pv = byPayer.get(payer);
            pv[0] += denied;
            if ("won".equals(status)) pv[1] += denied;
            else if ("lost".equals(status)) pv[2] += denied;
            else if (!"cancelled".equals(status)) pv[3] += denied;

            if (c.getCreatedAt() != null) {
                String month = c.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM"));
                monthly.computeIfAbsent(month, k -> new long[3]);
                long[] mv = monthly.get(month);
                mv[0] += denied;
                if ("won".equals(status)) mv[1] += denied;
                mv[2]++;
            }
        }

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("denied_cents", totalDenied); totals.put("recovered_cents", totalRecovered);
        totals.put("lost_cents", totalLost); totals.put("pending_cents", totalPending);
        totals.put("cancelled_cents", totalCancelled);
        totals.put("net_recovery_rate", totalDenied > 0 ? Math.round((double) totalRecovered / totalDenied * 100) : 0);

        List<Map<String, Object>> payerList = new ArrayList<>();
        byPayer.entrySet().stream().sorted(Comparator.<Map.Entry<String, long[]>>comparingLong(e -> e.getValue()[0]).reversed())
                .forEach(e -> payerList.add(Map.of("payer", e.getKey(), "denied", e.getValue()[0], "recovered", e.getValue()[1], "lost", e.getValue()[2], "pending", e.getValue()[3])));

        List<Map<String, Object>> monthlyTrend = new ArrayList<>();
        monthly.forEach((m, v) -> monthlyTrend.add(Map.of("month", m, "denied", v[0], "recovered", v[1], "claims", v[2])));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totals", totals);
        result.put("period", Map.of("days", period_days, "denied_cents", periodDenied, "recovered_cents", periodRecovered));
        result.put("by_payer", payerList);
        result.put("monthly_trend", monthlyTrend);
        return result;
    }

    @GetMapping("/recovery")
    public Map<String, Object> recovery(HttpServletRequest request,
                                         @RequestParam(defaultValue = "90") int period_days) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(period_days);

        List<Claim> periodClaims = claims.stream().filter(c -> c.getCreatedAt() != null && c.getCreatedAt().isAfter(cutoff)).toList();

        Map<String, long[]> weekly = new TreeMap<>();
        for (Claim c : periodClaims) {
            String weekStart = c.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-'W'ww"));
            weekly.computeIfAbsent(weekStart, k -> new long[3]);
            long[] wv = weekly.get(weekStart);
            wv[0] += c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0;
            wv[1] += c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0;
            wv[2]++;
        }

        List<Map<String, Object>> weeklyTrend = new ArrayList<>();
        for (Map.Entry<String, long[]> e : weekly.entrySet()) {
            long denied = e.getValue()[0], recovered = e.getValue()[1];
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("week", e.getKey()); w.put("denied_cents", denied); w.put("recovered_cents", recovered);
            w.put("claims", e.getValue()[2]);
            w.put("recovery_pct", denied > 0 ? Math.round((double) recovered / denied * 1000.0) / 10.0 : 0.0);
            weeklyTrend.add(w);
        }

        long totalDenied = periodClaims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long totalRecovered = periodClaims.stream().mapToLong(c -> c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0).sum();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period_days", period_days);
        result.put("total_denied_cents", totalDenied);
        result.put("total_recovered_cents", totalRecovered);
        result.put("recovery_rate", totalDenied > 0 ? Math.round((double) totalRecovered / totalDenied * 1000.0) / 10.0 : 0.0);
        result.put("total_claims", periodClaims.size());
        result.put("weekly_trend", weeklyTrend);
        return result;
    }

    @GetMapping("/cost-summary")
    public Map<String, Object> costSummary(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<ClaimCost> costs = costRepo.findByTenantId(tenantId);

        Map<String, Long> byCategory = new LinkedHashMap<>();
        Set<String> claimIds = new HashSet<>();
        long total = 0;
        for (ClaimCost c : costs) {
            byCategory.merge(c.getCategory(), c.getAmountCents(), Long::sum);
            claimIds.add(c.getClaimId());
            total += c.getAmountCents();
        }

        List<Map<String, Object>> catList = byCategory.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> Map.<String, Object>of("category", e.getKey(), "total_cents", e.getValue()))
                .toList();

        return Map.of("total_cents", total, "total_entries", costs.size(), "by_category", catList, "claims_with_costs", claimIds.size());
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }
}
