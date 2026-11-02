package com.claimshield.analytics.controller;

import com.claimshield.analytics.model.Appeal;
import com.claimshield.analytics.model.Claim;
import com.claimshield.analytics.model.PayerResponse;
import com.claimshield.analytics.repository.AppealRepository;
import com.claimshield.analytics.repository.ClaimRepository;
import com.claimshield.analytics.repository.PayerResponseRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics")
public class PayerAnalyticsController {

    private static final Map<String, Integer> PAYER_DEADLINES_DAYS = Map.of(
            "Aetna", 90, "BCBS", 365, "Blue Cross Blue Shield", 365,
            "Cigna", 90, "UnitedHealthcare", 90, "Medicare", 120, "Medicaid", 365, "Humana", 180
    );

    private final ClaimRepository claimRepo;
    private final AppealRepository appealRepo;
    private final PayerResponseRepository responseRepo;

    public PayerAnalyticsController(ClaimRepository claimRepo, AppealRepository appealRepo, PayerResponseRepository responseRepo) {
        this.claimRepo = claimRepo;
        this.appealRepo = appealRepo;
        this.responseRepo = responseRepo;
    }

    @GetMapping("/payers")
    public List<Map<String, Object>> payerAnalytics(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);

        Map<String, List<Appeal>> appealByClaim = new LinkedHashMap<>();
        for (Appeal a : appeals) appealByClaim.computeIfAbsent(a.getClaimId(), k -> new ArrayList<>()).add(a);

        Map<String, Map<String, Object>> data = new LinkedHashMap<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            data.computeIfAbsent(payer, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("payer", k); m.put("total_claims", 0); m.put("total_denied_cents", 0L);
                m.put("won", 0); m.put("lost", 0); m.put("denial_codes", new LinkedHashMap<String, Integer>());
                return m;
            });
            Map<String, Object> pd = data.get(payer);
            pd.put("total_claims", (int) pd.get("total_claims") + 1);
            pd.put("total_denied_cents", (long) pd.get("total_denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            if ("won".equals(c.getStatus())) pd.put("won", (int) pd.get("won") + 1);
            if ("lost".equals(c.getStatus())) pd.put("lost", (int) pd.get("lost") + 1);
            if (c.getDenialCode() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Integer> codes = (Map<String, Integer>) pd.get("denial_codes");
                codes.merge(c.getDenialCode(), 1, Integer::sum);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> pd : data.values()) {
            int w = (int) pd.get("won"), l = (int) pd.get("lost");
            int decided = w + l;
            pd.put("win_rate", decided > 0 ? Math.round((double) w / decided * 1000.0) / 10.0 : null);
            @SuppressWarnings("unchecked")
            Map<String, Integer> codes = (Map<String, Integer>) pd.remove("denial_codes");
            List<Map<String, Object>> topCodes = codes.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(5)
                    .map(e -> Map.<String, Object>of("code", e.getKey(), "count", e.getValue()))
                    .toList();
            pd.put("top_denial_codes", topCodes);
            result.add(pd);
        }
        result.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("total_denied_cents")).reversed());
        return result;
    }

    @GetMapping("/payer-performance")
    public List<Map<String, Object>> payerPerformance(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<Appeal> appeals = appealRepo.findByTenantId(tenantId);

        Map<String, List<Appeal>> appealByClaim = new LinkedHashMap<>();
        for (Appeal a : appeals) appealByClaim.computeIfAbsent(a.getClaimId(), k -> new ArrayList<>()).add(a);

        Map<String, Map<String, Object>> data = new LinkedHashMap<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            data.computeIfAbsent(payer, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("payer", k); m.put("total_claims", 0); m.put("total_denied_cents", 0L);
                m.put("total_recovered_cents", 0L); m.put("statuses", new LinkedHashMap<>());
                m.put("appeals_filed", 0); m.put("appeals_won", 0); m.put("appeals_lost", 0);
                m.put("_appeal_days", new ArrayList<Integer>());
                return m;
            });
            Map<String, Object> pd = data.get(payer);
            pd.put("total_claims", (int) pd.get("total_claims") + 1);
            pd.put("total_denied_cents", (long) pd.get("total_denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            pd.put("total_recovered_cents", (long) pd.get("total_recovered_cents") + (c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0));

            @SuppressWarnings("unchecked")
            Map<String, Integer> statuses = (Map<String, Integer>) pd.get("statuses");
            statuses.merge(c.getStatus() != null ? c.getStatus() : "unknown", 1, Integer::sum);

            List<Appeal> claimAppeals = appealByClaim.getOrDefault(c.getId(), List.of());
            pd.put("appeals_filed", (int) pd.get("appeals_filed") + claimAppeals.size());
            if ("won".equals(c.getStatus())) pd.put("appeals_won", (int) pd.get("appeals_won") + claimAppeals.size());
            else if ("lost".equals(c.getStatus())) pd.put("appeals_lost", (int) pd.get("appeals_lost") + claimAppeals.size());

            @SuppressWarnings("unchecked")
            List<Integer> appealDays = (List<Integer>) pd.get("_appeal_days");
            for (Appeal ap : claimAppeals) {
                if (ap.getCreatedAt() != null && c.getCreatedAt() != null) {
                    long days = Duration.between(c.getCreatedAt(), ap.getCreatedAt()).toDays();
                    if (days >= 0) appealDays.add((int) days);
                }
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> pd : data.values()) {
            @SuppressWarnings("unchecked")
            List<Integer> days = (List<Integer>) pd.remove("_appeal_days");
            pd.put("avg_days_to_appeal", !days.isEmpty() ? Math.round(days.stream().mapToInt(Integer::intValue).average().orElse(0) * 10.0) / 10.0 : null);
            int aw = (int) pd.get("appeals_won"), al = (int) pd.get("appeals_lost");
            int decided = aw + al;
            pd.put("win_rate", decided > 0 ? Math.round((double) aw / decided * 1000.0) / 10.0 : null);
            long denied = (long) pd.get("total_denied_cents"), recovered = (long) pd.get("total_recovered_cents");
            pd.put("recovery_rate", denied > 0 ? Math.round((double) recovered / denied * 1000.0) / 10.0 : null);
            result.add(pd);
        }
        result.sort(Comparator.<Map<String, Object>>comparingLong(m -> (long) m.get("total_denied_cents")).reversed());
        return result;
    }

    @GetMapping("/payer-sla")
    public List<Map<String, Object>> payerSla(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<PayerResponse> responses = responseRepo.findByTenantId(tenantId);

        Map<String, java.time.LocalDateTime> firstResponse = new LinkedHashMap<>();
        for (PayerResponse r : responses) {
            firstResponse.merge(r.getClaimId(), r.getReceivedAt(), (a, b) -> a.isBefore(b) ? a : b);
        }

        Map<String, Map<String, Object>> byPayer = new LinkedHashMap<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            byPayer.computeIfAbsent(payer, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("total", 0); m.put("responded", 0);
                m.put("_days", new ArrayList<Integer>());
                m.put("sla_target_days", PAYER_DEADLINES_DAYS.getOrDefault(k, 45));
                m.put("within_sla", 0); m.put("overdue", 0);
                return m;
            });
            Map<String, Object> b = byPayer.get(payer);
            b.put("total", (int) b.get("total") + 1);
            if (firstResponse.containsKey(c.getId()) && c.getCreatedAt() != null) {
                b.put("responded", (int) b.get("responded") + 1);
                int days = (int) Duration.between(c.getCreatedAt(), firstResponse.get(c.getId())).toDays();
                @SuppressWarnings("unchecked")
                List<Integer> daysList = (List<Integer>) b.get("_days");
                daysList.add(days);
                if (days <= (int) b.get("sla_target_days")) b.put("within_sla", (int) b.get("within_sla") + 1);
                else b.put("overdue", (int) b.get("overdue") + 1);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> entry : byPayer.entrySet()) {
            Map<String, Object> d = entry.getValue();
            @SuppressWarnings("unchecked")
            List<Integer> days = (List<Integer>) d.remove("_days");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("payer", entry.getKey());
            row.put("total_claims", d.get("total"));
            row.put("responded", d.get("responded"));
            row.put("avg_response_days", !days.isEmpty() ? Math.round(days.stream().mapToInt(Integer::intValue).average().orElse(0) * 10.0) / 10.0 : null);
            row.put("sla_target_days", d.get("sla_target_days"));
            row.put("within_sla", d.get("within_sla"));
            row.put("overdue", d.get("overdue"));
            int responded = (int) d.get("responded");
            row.put("sla_compliance_rate", responded > 0 ? Math.round((double) (int) d.get("within_sla") / responded * 1000.0) / 10.0 : null);
            result.add(row);
        }
        result.sort(Comparator.<Map<String, Object>>comparingInt(m -> (int) m.get("total_claims")).reversed());
        return result;
    }

    @GetMapping("/payer-intelligence")
    public List<Map<String, Object>> payerIntelligence(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepo.findByTenantId(tenantId);
        List<PayerResponse> responses = responseRepo.findByTenantId(tenantId);

        Map<String, List<PayerResponse>> respByClaim = new LinkedHashMap<>();
        for (PayerResponse r : responses) respByClaim.computeIfAbsent(r.getClaimId(), k -> new ArrayList<>()).add(r);

        Map<String, Map<String, Object>> byPayer = new LinkedHashMap<>();
        for (Claim c : claims) {
            String payer = c.getPayer() != null ? c.getPayer() : "Unknown";
            byPayer.computeIfAbsent(payer, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("payer", k); m.put("total_claims", 0); m.put("won", 0); m.put("lost", 0); m.put("pending", 0);
                m.put("total_denied_cents", 0L); m.put("total_recovered_cents", 0L);
                m.put("denial_codes", new LinkedHashMap<String, Integer>());
                m.put("_days", new ArrayList<Integer>());
                return m;
            });
            Map<String, Object> p = byPayer.get(payer);
            p.put("total_claims", (int) p.get("total_claims") + 1);
            p.put("total_denied_cents", (long) p.get("total_denied_cents") + (c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0));
            if ("won".equals(c.getStatus())) {
                p.put("won", (int) p.get("won") + 1);
                p.put("total_recovered_cents", (long) p.get("total_recovered_cents") + (c.getAmountApprovedCents() != null ? c.getAmountApprovedCents() : 0));
            } else if ("lost".equals(c.getStatus())) p.put("lost", (int) p.get("lost") + 1);
            else p.put("pending", (int) p.get("pending") + 1);

            String code = c.getDenialCode() != null ? c.getDenialCode() : "Unknown";
            @SuppressWarnings("unchecked")
            Map<String, Integer> codes = (Map<String, Integer>) p.get("denial_codes");
            codes.merge(code, 1, Integer::sum);

            if (respByClaim.containsKey(c.getId()) && c.getCreatedAt() != null) {
                for (PayerResponse r : respByClaim.get(c.getId())) {
                    if (r.getReceivedAt() != null) {
                        @SuppressWarnings("unchecked")
                        List<Integer> days = (List<Integer>) p.get("_days");
                        days.add((int) Duration.between(c.getCreatedAt(), r.getReceivedAt()).toDays());
                    }
                }
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> pd : byPayer.values()) {
            @SuppressWarnings("unchecked")
            List<Integer> days = (List<Integer>) pd.remove("_days");
            @SuppressWarnings("unchecked")
            Map<String, Integer> codes = (Map<String, Integer>) pd.remove("denial_codes");

            int w = (int) pd.get("won"), l = (int) pd.get("lost");
            pd.put("win_rate", (w + l) > 0 ? Math.round((double) w / (w + l) * 1000.0) / 10.0 : null);
            pd.put("avg_response_days", !days.isEmpty() ? Math.round(days.stream().mapToInt(Integer::intValue).average().orElse(0) * 10.0) / 10.0 : null);
            pd.put("top_denial_codes", codes.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(5)
                    .map(e -> Map.<String, Object>of("code", e.getKey(), "count", e.getValue())).toList());
            pd.put("contacts", List.of());
            pd.put("deadline_days", PAYER_DEADLINES_DAYS.getOrDefault(pd.get("payer"), 90));
            result.add(pd);
        }
        result.sort(Comparator.<Map<String, Object>>comparingInt(m -> (int) m.get("total_claims")).reversed());
        return result;
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }
}
