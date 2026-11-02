package com.claimshield.analytics.controller;

import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.repository.ClaimRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics")
public class PatternsController {

    private static final Map<String, String> DENIAL_CODE_TO_CATEGORY = Map.ofEntries(
            Map.entry("CO-4", "Coding"), Map.entry("CO-16", "Information"), Map.entry("CO-18", "Duplicate"),
            Map.entry("CO-29", "Timely Filing"), Map.entry("CO-45", "Fee Schedule"), Map.entry("CO-50", "Coverage"),
            Map.entry("CO-97", "Bundling"), Map.entry("CO-109", "Coverage"), Map.entry("CO-197", "Authorization"),
            Map.entry("CO-204", "Authorization"), Map.entry("CO-236", "Authorization"),
            Map.entry("PR-1", "Coverage"), Map.entry("PR-2", "Coverage"), Map.entry("PR-3", "Coverage")
    );

    private final ClaimRepository claimRepo;

    public PatternsController(ClaimRepository claimRepo) {
        this.claimRepo = claimRepo;
    }

    @GetMapping("/patterns")
    public List<Map<String, Object>> denialPatterns(HttpServletRequest request,
                                                     @RequestParam(defaultValue = "2") int min_count) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);

        Map<String, List<Claim>> combos = new LinkedHashMap<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            String code = c.getDenialCode() != null ? c.getDenialCode() : "unknown";
            combos.computeIfAbsent(payer + "|" + code, k -> new ArrayList<>()).add(c);
        }

        List<Map<String, Object>> patterns = new ArrayList<>();
        for (Map.Entry<String, List<Claim>> entry : combos.entrySet()) {
            List<Claim> group = entry.getValue();
            if (group.size() < min_count) continue;
            String[] parts = entry.getKey().split("\\|", 2);
            String payer = parts[0], code = parts[1];
            long totalDenied = group.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
            Map<String, Integer> statuses = new LinkedHashMap<>();
            for (Claim c : group) statuses.merge(c.getStatus(), 1, Integer::sum);
            int won = statuses.getOrDefault("won", 0), lost = statuses.getOrDefault("lost", 0);
            int decided = won + lost;
            String category = DENIAL_CODE_TO_CATEGORY.getOrDefault(code, "Other");

            Map<String, Object> p = new LinkedHashMap<>();
            p.put("payer", payer); p.put("denial_code", code); p.put("category", category);
            p.put("count", group.size()); p.put("total_denied_cents", totalDenied);
            p.put("avg_denied_cents", group.isEmpty() ? 0 : totalDenied / group.size());
            p.put("statuses", statuses);
            p.put("win_rate", decided > 0 ? Math.round((double) won / decided * 1000.0) / 10.0 : null);
            p.put("claim_ids", group.stream().map(Claim::getId).toList());
            p.put("recommendation", patternRecommendation(category, won, lost, group.size()));
            patterns.add(p);
        }
        patterns.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("total_denied_cents")).reversed());
        return patterns;
    }

    @GetMapping("/denial-codes")
    public Map<String, Object> denialCodeAnalytics(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);

        Map<String, Map<String, Object>> codes = new LinkedHashMap<>();
        for (Claim c : claims) {
            String code = c.getDenialCode() != null ? c.getDenialCode() : "Unknown";
            codes.computeIfAbsent(code, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("code", k); m.put("category", DENIAL_CODE_TO_CATEGORY.getOrDefault(k, "Other"));
                m.put("total_claims", 0); m.put("total_denied_cents", 0L);
                m.put("won", 0); m.put("lost", 0); m.put("pending", 0);
                m.put("payers", new LinkedHashMap<String, Integer>());
                return m;
            });
            Map<String, Object> d = codes.get(code);
            d.put("total_claims", (int) d.get("total_claims") + 1);
            d.put("total_denied_cents", (long) d.get("total_denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            if ("won".equals(c.getStatus())) d.put("won", (int) d.get("won") + 1);
            else if ("lost".equals(c.getStatus())) d.put("lost", (int) d.get("lost") + 1);
            else if (Set.of("pending_review", "in_progress", "needs_review", "approved", "sent").contains(c.getStatus()))
                d.put("pending", (int) d.get("pending") + 1);
            @SuppressWarnings("unchecked")
            Map<String, Integer> payers = (Map<String, Integer>) d.get("payers");
            payers.merge(c.getPayer() != null ? c.getPayer() : "Unknown", 1, Integer::sum);
        }

        List<Map<String, Object>> codeList = new ArrayList<>();
        for (Map<String, Object> d : codes.values()) {
            int w = (int) d.get("won"), l = (int) d.get("lost"), total = (int) d.get("total_claims");
            d.put("win_rate", (w + l) > 0 ? Math.round((double) w / (w + l) * 100) : 0);
            d.put("avg_amount_cents", total > 0 ? (long) d.get("total_denied_cents") / total : 0);
            @SuppressWarnings("unchecked")
            Map<String, Integer> payers = (Map<String, Integer>) d.get("payers");
            d.put("payers", payers.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                    .map(e -> Map.<String, Object>of("payer", e.getKey(), "count", e.getValue())).toList());
            codeList.add(d);
        }
        codeList.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("total_denied_cents")).reversed());
        return Map.of("codes", codeList, "total_codes", codeList.size());
    }

    @GetMapping("/heatmap")
    public Map<String, Object> heatmap(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);

        Map<String, Map<String, Integer>> matrix = new LinkedHashMap<>();
        Set<String> payersSet = new TreeSet<>(), codesSet = new TreeSet<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            String code = c.getDenialCode() != null ? c.getDenialCode() : "Unknown";
            payersSet.add(payer); codesSet.add(code);
            matrix.computeIfAbsent(payer, k -> new LinkedHashMap<>()).merge(code, 1, Integer::sum);
        }

        List<String> payers = new ArrayList<>(payersSet);
        List<String> codesList = new ArrayList<>(codesSet);
        int maxVal = 0;
        List<Map<String, Object>> cells = new ArrayList<>();
        for (String p : payers) {
            for (String code : codesList) {
                int count = matrix.getOrDefault(p, Map.of()).getOrDefault(code, 0);
                if (count > maxVal) maxVal = count;
                cells.add(Map.of("payer", p, "code", code, "count", count));
            }
        }
        return Map.of("payers", payers, "codes", codesList, "cells", cells, "max_count", maxVal);
    }

    @GetMapping("/trends")
    public List<Map<String, Object>> denialTrends(HttpServletRequest request,
                                                    @RequestParam(defaultValue = "6") int months) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM");

        Map<String, Map<String, Object>> buckets = new LinkedHashMap<>();
        for (int i = 0; i < months; i++) {
            String key = now.minusDays(30L * i).format(fmt);
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("month", key); b.put("new_claims", 0); b.put("total_denied_cents", 0L);
            b.put("total_recovered_cents", 0L); b.put("won", 0); b.put("lost", 0);
            b.put("_by_code", new LinkedHashMap<String, Integer>());
            b.put("_by_payer", new LinkedHashMap<String, Integer>());
            buckets.put(key, b);
        }

        for (Claim c : claims) {
            if (c.getCreatedAt() == null) continue;
            String key = c.getCreatedAt().format(fmt);
            if (!buckets.containsKey(key)) continue;
            Map<String, Object> b = buckets.get(key);
            b.put("new_claims", (int) b.get("new_claims") + 1);
            b.put("total_denied_cents", (long) b.get("total_denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            if ("won".equals(c.getStatus())) {
                b.put("won", (int) b.get("won") + 1);
                b.put("total_recovered_cents", (long) b.get("total_recovered_cents") + (c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0));
            } else if ("lost".equals(c.getStatus())) b.put("lost", (int) b.get("lost") + 1);
            if (c.getDenialCode() != null) {
                @SuppressWarnings("unchecked") Map<String, Integer> bc = (Map<String, Integer>) b.get("_by_code");
                bc.merge(c.getDenialCode(), 1, Integer::sum);
            }
            if (c.getPayer() != null) {
                @SuppressWarnings("unchecked") Map<String, Integer> bp = (Map<String, Integer>) b.get("_by_payer");
                bp.merge(c.getPayer(), 1, Integer::sum);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (String key : buckets.keySet().stream().sorted().toList()) {
            Map<String, Object> b = buckets.get(key);
            @SuppressWarnings("unchecked") Map<String, Integer> bc = (Map<String, Integer>) b.remove("_by_code");
            @SuppressWarnings("unchecked") Map<String, Integer> bp = (Map<String, Integer>) b.remove("_by_payer");
            b.put("top_codes", bc.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(5)
                    .map(e -> Map.of("code", e.getKey(), "count", e.getValue())).toList());
            b.put("top_payers", bp.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(5)
                    .map(e -> Map.of("payer", e.getKey(), "count", e.getValue())).toList());
            result.add(b);
        }
        return result;
    }

    @GetMapping("/aging")
    public Map<String, Object> aging(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        LocalDateTime now = LocalDateTime.now();

        String[] bucketNames = {"0-7d", "8-14d", "15-30d", "31-60d", "61-90d", "90d+"};
        Map<String, Integer> buckets = new LinkedHashMap<>();
        Map<String, Long> bucketCents = new LinkedHashMap<>();
        Map<String, Map<String, Integer>> byStatus = new LinkedHashMap<>();
        for (String b : bucketNames) { buckets.put(b, 0); bucketCents.put(b, 0L); }

        Set<String> terminal = Set.of("won", "lost", "cancelled");
        for (Claim c : claims) {
            if (terminal.contains(c.getStatus())) continue;
            long age = c.getCreatedAt() != null ? Duration.between(c.getCreatedAt(), now).toDays() : 0;
            String b;
            if (age <= 7) b = "0-7d"; else if (age <= 14) b = "8-14d"; else if (age <= 30) b = "15-30d";
            else if (age <= 60) b = "31-60d"; else if (age <= 90) b = "61-90d"; else b = "90d+";
            buckets.merge(b, 1, Integer::sum);
            bucketCents.merge(b, c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0, Long::sum);
            byStatus.computeIfAbsent(c.getStatus(), k -> { Map<String, Integer> m = new LinkedHashMap<>(); for (String bn : bucketNames) m.put(bn, 0); return m; });
            byStatus.get(c.getStatus()).merge(b, 1, Integer::sum);
        }

        List<Map<String, Object>> bucketList = new ArrayList<>();
        for (String b : bucketNames) bucketList.add(Map.of("range", b, "count", buckets.get(b), "amount_cents", bucketCents.get(b)));

        Map<String, List<Map<String, Object>>> statusBuckets = new LinkedHashMap<>();
        byStatus.forEach((status, ranges) -> {
            List<Map<String, Object>> list = new ArrayList<>();
            ranges.forEach((range, count) -> list.add(Map.of("range", range, "count", count)));
            statusBuckets.put(status, list);
        });

        return Map.of("buckets", bucketList, "by_status", statusBuckets, "total_open", buckets.values().stream().mapToInt(Integer::intValue).sum());
    }

    private String patternRecommendation(String category, int won, int lost, int total) {
        int decided = won + lost;
        if (decided >= 2 && (double) won / decided >= 0.7) return "Strong appeal history — continue appealing similar denials.";
        if (decided >= 2 && (double) lost / decided >= 0.7) return "Low win rate — consider process changes or pre-authorization before service.";
        Map<String, String> recs = Map.of(
                "Medical Necessity", "Ensure clinical documentation clearly supports necessity before billing.",
                "Timely Filing", "Review submission workflows and track filing deadlines proactively.",
                "Authorization", "Verify prior authorization status before rendering services.",
                "Coding", "Audit coding practices and consider a coding review for these claim types.",
                "Coverage", "Confirm benefit eligibility and coverage before scheduling services.",
                "Duplicate", "Review claim submission process for duplicate prevention.",
                "Bundling", "Review NCCI edits and modifier usage for these procedure combinations.",
                "Fee Schedule", "Review contracted rates and ensure charges align with fee schedules.",
                "Information", "Implement pre-submission checks for required claim data elements."
        );
        return recs.getOrDefault(category, "Review denial pattern and consider targeted process improvements.");
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }
}
