package com.claimshield.core.controller;

import com.claimshield.core.model.*;
import com.claimshield.core.repository.*;
import com.claimshield.core.service.AuditService;
import com.claimshield.core.service.ReferenceDataService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/claims")
public class ClaimController {

    private final ClaimRepository claimRepository;
    private final AppealRepository appealRepository;
    private final AuditService auditService;
    private final ReferenceDataService referenceDataService;
    private final ClaimStatusHistoryRepository statusHistoryRepository;
    private final AuditLogRepository auditLogRepository;
    private final ClaimNoteRepository noteRepository;

    public ClaimController(ClaimRepository claimRepository,
                           AppealRepository appealRepository,
                           AuditService auditService,
                           ReferenceDataService referenceDataService,
                           ClaimStatusHistoryRepository statusHistoryRepository,
                           AuditLogRepository auditLogRepository,
                           ClaimNoteRepository noteRepository) {
        this.claimRepository = claimRepository;
        this.appealRepository = appealRepository;
        this.auditService = auditService;
        this.referenceDataService = referenceDataService;
        this.statusHistoryRepository = statusHistoryRepository;
        this.auditLogRepository = auditLogRepository;
        this.noteRepository = noteRepository;
    }

    @GetMapping
    public List<Claim> listClaims(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            HttpServletRequest request) {
        String tenantId = getTenantId(request);
        if (search != null && !search.isBlank()) {
            return claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                    .filter(c -> matchesSearch(c, search.toLowerCase()))
                    .toList();
        }
        if (status != null && !status.isEmpty()) {
            return claimRepository.findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId, status);
        }
        return claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @GetMapping("/search")
    public List<Claim> searchClaims(@RequestParam String q, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String lower = q.toLowerCase();
        return claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .filter(c -> matchesSearch(c, lower))
                .toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getClaim(@PathVariable String id, HttpServletRequest request) {
        return claimRepository.findById(id)
                .map(claim -> {
                    Map<String, Object> result = claimToMap(claim);
                    Set<String> allowed = ReferenceDataService.ALLOWED_TRANSITIONS.getOrDefault(claim.getStatus(), Set.of());
                    result.put("allowed_transitions", allowed.stream().sorted().toList());
                    return ResponseEntity.ok(result);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Claim createClaim(@RequestBody Claim claim, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        claim.setId(UUID.randomUUID().toString());
        claim.setTenantId(tenantId);
        claim.setCreatedBy(userId);
        if (claim.getStatus() == null) claim.setStatus("pending_review");
        if (claim.getClaimNumber() == null) {
            claim.setClaimNumber("CLM-" + java.time.Year.now().getValue() + "-" +
                    String.format("%03d", claimRepository.countByTenantId(tenantId) + 1));
        }
        if (claim.getFilingDeadline() == null) {
            claim.setFilingDeadline(referenceDataService.computeDeadline(claim.getPayer()));
        }

        Claim saved = claimRepository.save(claim);
        auditService.writeAudit(tenantId, userId, "claim.created", "claim", saved.getId(),
                "{\"claim_number\":\"" + saved.getClaimNumber() + "\"}");
        return saved;
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Claim> updateClaim(@PathVariable String id,
                                              @RequestBody Map<String, Object> updates,
                                              HttpServletRequest request) {
        return claimRepository.findById(id).map(claim -> {
            String tenantId = getTenantId(request);
            String userId = getUserId(request);

            if (updates.containsKey("status")) {
                String oldStatus = claim.getStatus();
                String newStatus = (String) updates.get("status");
                claim.setStatus(newStatus);
                auditService.writeAudit(tenantId, userId, "status.changed", "claim", id,
                        "{\"from\":\"" + oldStatus + "\",\"to\":\"" + newStatus + "\"}");
            }
            if (updates.containsKey("assigned_to")) claim.setAssignedTo((String) updates.get("assigned_to"));
            if (updates.containsKey("denial_reason")) claim.setDenialReason((String) updates.get("denial_reason"));
            if (updates.containsKey("payer")) claim.setPayer((String) updates.get("payer"));
            if (updates.containsKey("denial_code")) claim.setDenialCode((String) updates.get("denial_code"));
            if (updates.containsKey("raw_denial_text")) claim.setRawDenialText((String) updates.get("raw_denial_text"));
            if (updates.containsKey("raw_clinical_notes")) claim.setRawClinicalNotes((String) updates.get("raw_clinical_notes"));
            if (updates.containsKey("reviewed_by")) claim.setReviewedBy((String) updates.get("reviewed_by"));

            return ResponseEntity.ok(claimRepository.save(claim));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> transitionStatus(@PathVariable String id,
                                              @RequestBody Map<String, String> body,
                                              HttpServletRequest request) {
        return claimRepository.findById(id).map(claim -> {
            String tenantId = getTenantId(request);
            String userId = getUserId(request);
            String newStatus = body.get("status");
            Set<String> allowed = ReferenceDataService.ALLOWED_TRANSITIONS.getOrDefault(claim.getStatus(), Set.of());

            if (!allowed.contains(newStatus)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("detail", "Cannot transition from '" + claim.getStatus() + "' to '" + newStatus + "'"));
            }

            String oldStatus = claim.getStatus();
            claim.setStatus(newStatus);
            if (body.containsKey("reviewed_by")) {
                claim.setReviewedBy(body.get("reviewed_by"));
                claim.setReviewedAt(LocalDateTime.now());
            }

            ClaimStatusHistory history = new ClaimStatusHistory();
            history.setTenantId(tenantId);
            history.setClaimId(id);
            history.setFromStatus(oldStatus);
            history.setToStatus(newStatus);
            history.setChangedBy(userId);
            history.setReason(body.get("reason"));
            statusHistoryRepository.save(history);

            claimRepository.save(claim);
            auditService.writeAudit(tenantId, userId, "claim.status_changed", "claim", id,
                    "{\"old_status\":\"" + oldStatus + "\",\"new_status\":\"" + newStatus + "\"}");

            return ResponseEntity.ok(claimToMap(claim));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/status-history")
    public List<ClaimStatusHistory> getStatusHistory(@PathVariable String id, HttpServletRequest request) {
        return statusHistoryRepository.findByTenantIdAndClaimIdOrderByChangedAtDesc(getTenantId(request), id);
    }

    @GetMapping("/{id}/timeline")
    public List<Map<String, Object>> getTimeline(@PathVariable String id, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Map<String, Object>> events = new ArrayList<>();

        claimRepository.findById(id).ifPresent(claim -> {
            events.add(Map.of(
                    "type", "claim_created",
                    "timestamp", claim.getCreatedAt().toString(),
                    "title", "Claim created",
                    "detail", "Claim " + (claim.getClaimNumber() != null ? claim.getClaimNumber() : id.substring(0, 8)) +
                            " created — " + claim.getPayer() + ", " + claim.getDenialCode()
            ));

            if (claim.getFilingDeadline() != null) {
                events.add(Map.of(
                        "type", "deadline",
                        "timestamp", claim.getFilingDeadline().toString(),
                        "title", "Filing deadline",
                        "detail", "Deadline for " + claim.getPayer()
                ));
            }
        });

        auditLogRepository.findByTenantIdAndResourceIdOrderByCreatedAtAsc(tenantId, id)
                .forEach(log -> events.add(Map.of(
                        "type", "audit",
                        "timestamp", log.getCreatedAt().toString(),
                        "title", log.getAction().replace(".", " ").replace("_", " "),
                        "detail", "By " + log.getActorId(),
                        "action", log.getAction()
                )));

        appealRepository.findByClaimIdOrderByCreatedAtDesc(id)
                .forEach(appeal -> {
                    events.add(Map.of(
                            "type", "appeal_created",
                            "timestamp", appeal.getCreatedAt().toString(),
                            "title", "Appeal draft",
                            "detail", "Status: " + appeal.getStatus(),
                            "appeal_id", appeal.getId()
                    ));
                    if (appeal.getApprovedBy() != null) {
                        events.add(Map.of(
                                "type", "appeal_approved",
                                "timestamp", (appeal.getApprovedAt() != null ? appeal.getApprovedAt() : appeal.getCreatedAt()).toString(),
                                "title", "Appeal approved",
                                "detail", "Approved by " + appeal.getApprovedBy(),
                                "appeal_id", appeal.getId()
                        ));
                    }
                });

        noteRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(tenantId, id)
                .forEach(note -> events.add(Map.of(
                        "type", "note",
                        "timestamp", note.getCreatedAt().toString(),
                        "title", "Note added",
                        "detail", note.getContent().length() > 120 ? note.getContent().substring(0, 120) + "..." : note.getContent(),
                        "author", note.getAuthorId()
                )));

        events.sort(Comparator.comparing(e -> e.get("timestamp").toString()));
        return events;
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);

        long totalDenied = claims.stream().mapToLong(c -> c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0).sum();
        long totalRecovered = claims.stream().mapToLong(c -> c.getAmountRecoveredCents() != null ? c.getAmountRecoveredCents() : 0).sum();
        long won = claims.stream().filter(c -> "won".equals(c.getStatus())).count();
        long lost = claims.stream().filter(c -> "lost".equals(c.getStatus())).count();
        long pendingReview = claims.stream().filter(c -> "pending_review".equals(c.getStatus()) || "needs_review".equals(c.getStatus())).count();

        return Map.of(
                "total_claims", claims.size(),
                "total_denied_cents", totalDenied,
                "total_recovered_cents", totalRecovered,
                "won", won,
                "lost", lost,
                "pending_review", pendingReview,
                "win_rate", (won + lost) > 0 ? (double) won / (won + lost) : 0.0
        );
    }

    @GetMapping("/workqueue")
    public Map<String, Object> workqueue(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        LocalDateTime now = LocalDateTime.now();
        List<Claim> claims = claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .filter(c -> Set.of("pending_review", "in_progress", "needs_review").contains(c.getStatus()))
                .toList();

        Set<String> pendingAppealClaimIds = appealRepository.findByTenantIdAndStatus(tenantId, "draft").stream()
                .map(Appeal::getClaimId)
                .collect(Collectors.toSet());

        List<Map<String, Object>> items = claims.stream().map(c -> {
            int urgency = 0;
            List<String> reasons = new ArrayList<>();

            if (c.getFilingDeadline() != null) {
                long daysLeft = ChronoUnit.DAYS.between(now, c.getFilingDeadline());
                if (daysLeft <= 3) { urgency += 100; reasons.add(daysLeft + "d to deadline"); }
                else if (daysLeft <= 7) { urgency += 50; reasons.add(daysLeft + "d to deadline"); }
            }

            long ageDays = c.getCreatedAt() != null ? ChronoUnit.DAYS.between(c.getCreatedAt(), now) : 0;
            if (ageDays >= 14) { urgency += 30; reasons.add(ageDays + "d old"); }
            else if (ageDays >= 7) { urgency += 15; reasons.add(ageDays + "d old"); }

            if ("needs_review".equals(c.getStatus())) { urgency += 20; reasons.add("needs review"); }
            if (pendingAppealClaimIds.contains(c.getId())) { urgency += 10; reasons.add("appeal pending"); }
            if (c.getAmountDeniedCents() != null && c.getAmountDeniedCents() >= 1_000_000) { urgency += 25; reasons.add("high value"); }

            Map<String, Object> item = new LinkedHashMap<>(claimToMap(c));
            item.put("urgency_score", urgency);
            item.put("urgency_reasons", reasons);
            item.put("has_pending_appeal", pendingAppealClaimIds.contains(c.getId()));
            item.put("age_days", ageDays);
            item.put("allowed_transitions", ReferenceDataService.ALLOWED_TRANSITIONS.getOrDefault(c.getStatus(), Set.of()).stream().sorted().toList());
            return item;
        }).sorted(Comparator.comparingInt((Map<String, Object> m) -> (int) m.get("urgency_score")).reversed()).toList();

        return Map.of("items", items, "total", items.size());
    }

    @GetMapping("/deadlines")
    public List<Map<String, Object>> deadlines(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        return claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .filter(c -> c.getFilingDeadline() != null && !Set.of("won", "lost", "cancelled").contains(c.getStatus()))
                .sorted(Comparator.comparing(Claim::getFilingDeadline))
                .map(c -> {
                    long daysLeft = ChronoUnit.DAYS.between(LocalDateTime.now(), c.getFilingDeadline());
                    Map<String, Object> m = new LinkedHashMap<>(claimToMap(c));
                    m.put("days_until_deadline", daysLeft);
                    m.put("is_urgent", daysLeft <= 7);
                    return m;
                })
                .toList();
    }

    @PostMapping("/batch-transition")
    @Transactional
    public List<Map<String, Object>> batchTransition(@RequestBody Map<String, Object> body,
                                                     HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        String newStatus = (String) body.get("status");
        @SuppressWarnings("unchecked")
        List<String> claimIds = (List<String>) body.get("claim_ids");

        List<Map<String, Object>> results = new ArrayList<>();
        for (String cid : claimIds) {
            claimRepository.findById(cid).ifPresentOrElse(claim -> {
                Set<String> allowed = ReferenceDataService.ALLOWED_TRANSITIONS.getOrDefault(claim.getStatus(), Set.of());
                if (allowed.contains(newStatus)) {
                    String oldStatus = claim.getStatus();
                    claim.setStatus(newStatus);
                    claimRepository.save(claim);

                    ClaimStatusHistory history = new ClaimStatusHistory();
                    history.setTenantId(tenantId);
                    history.setClaimId(cid);
                    history.setFromStatus(oldStatus);
                    history.setToStatus(newStatus);
                    history.setChangedBy(userId);
                    statusHistoryRepository.save(history);

                    auditService.writeAudit(tenantId, userId, "claim.status_changed", "claim", cid,
                            "{\"old_status\":\"" + oldStatus + "\",\"new_status\":\"" + newStatus + "\"}");
                    results.add(Map.of("claim_id", cid, "success", true, "new_status", newStatus));
                } else {
                    results.add(Map.of("claim_id", cid, "success", false, "error",
                            "Cannot transition from '" + claim.getStatus() + "' to '" + newStatus + "'"));
                }
            }, () -> results.add(Map.of("claim_id", cid, "success", false, "error", "Not found")));
        }
        return results;
    }

    @GetMapping("/duplicates")
    public List<Map<String, Object>> findDuplicates(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
        List<Map<String, Object>> groups = new ArrayList<>();

        Map<String, List<Claim>> byKey = claims.stream()
                .filter(c -> c.getPatientId() != null && c.getDenialCode() != null)
                .collect(Collectors.groupingBy(c -> c.getPatientId() + "|" + c.getDenialCode() + "|" + c.getPayer()));

        byKey.values().stream()
                .filter(group -> group.size() > 1)
                .forEach(group -> groups.add(Map.of(
                        "patient_id", group.get(0).getPatientId(),
                        "denial_code", group.get(0).getDenialCode(),
                        "payer", group.get(0).getPayer(),
                        "count", group.size(),
                        "claims", group.stream().map(this::claimToMap).toList()
                )));
        return groups;
    }

    @PostMapping("/appeal-letters/generate")
    public Map<String, Object> generateAppealLetter(@RequestBody Map<String, String> body,
                                                     HttpServletRequest request) {
        String claimId = body.get("claim_id");
        return claimRepository.findById(claimId)
                .map(claim -> {
                    String category = body.get("template_category");
                    if (category == null || category.isBlank()) {
                        category = ReferenceDataService.DENIAL_CODE_TO_CATEGORY.getOrDefault(
                                claim.getDenialCode(), "Medical Necessity");
                    }

                    Map<String, Object> claimData = claimToMap(claim);
                    String letter = referenceDataService.generateAppealLetter(claimData, category);

                    return Map.<String, Object>of(
                            "claim_id", claimId,
                            "template_category", category,
                            "letter_text", letter,
                            "source", ReferenceDataService.APPEAL_TEMPLATES.containsKey(category) ?
                                    ReferenceDataService.APPEAL_TEMPLATES.get(category).source() : "N/A",
                            "generated_at", LocalDateTime.now().toString()
                    );
                })
                .orElse(Map.of("detail", "Claim not found"));
    }

    @PostMapping("/appeal-letters/batch")
    public Map<String, Object> batchGenerateLetters(@RequestBody Map<String, Object> body,
                                                     HttpServletRequest request) {
        String tenantId = getTenantId(request);
        @SuppressWarnings("unchecked")
        List<String> claimIds = (List<String>) body.get("claim_ids");
        String templateCategory = (String) body.get("template_category");

        List<Map<String, Object>> results = new ArrayList<>();
        for (String cid : claimIds.subList(0, Math.min(claimIds.size(), 20))) {
            claimRepository.findById(cid).ifPresentOrElse(claim -> {
                if (!tenantId.equals(claim.getTenantId())) {
                    results.add(Map.of("claim_id", cid, "error", "Claim not found"));
                    return;
                }
                String category = templateCategory;
                if (category == null || category.isBlank()) {
                    category = ReferenceDataService.DENIAL_CODE_TO_CATEGORY.getOrDefault(
                            claim.getDenialCode(), "Medical Necessity");
                }
                String letter = referenceDataService.generateAppealLetter(claimToMap(claim), category);
                results.add(Map.of(
                        "claim_id", cid,
                        "claim_number", claim.getClaimNumber() != null ? claim.getClaimNumber() : "",
                        "template_category", category,
                        "letter_text", letter,
                        "source", ReferenceDataService.APPEAL_TEMPLATES.containsKey(category) ?
                                ReferenceDataService.APPEAL_TEMPLATES.get(category).source() : "N/A"
                ));
            }, () -> results.add(Map.of("claim_id", cid, "error", "Claim not found")));
        }
        return Map.of("results", results, "total", results.size());
    }

    @GetMapping("/export")
    public Map<String, Object> exportClaims(@RequestParam(required = false) String status,
                                             @RequestParam(required = false) String payer,
                                             HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
        if (status != null) claims = claims.stream().filter(c -> status.equals(c.getStatus())).toList();
        if (payer != null) claims = claims.stream().filter(c -> payer.equals(c.getPayer())).toList();

        List<Map<String, Object>> rows = claims.stream().map(this::claimToMap).toList();
        return Map.of("export_format", "json", "count", rows.size(), "claims", rows);
    }

    @GetMapping("/export/csv")
    public ResponseEntity<String> exportClaimsCsv(@RequestParam(required = false) String status,
                                                   HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<Claim> claims = claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
        if (status != null) claims = claims.stream().filter(c -> status.equals(c.getStatus())).toList();

        StringBuilder sb = new StringBuilder();
        sb.append("id,claim_number,patient_name,patient_id,payer,denial_code,denial_reason,amount_denied_cents,status,filing_deadline,created_at\n");
        for (Claim c : claims) {
            sb.append(csvEscape(c.getId())).append(",");
            sb.append(csvEscape(c.getClaimNumber())).append(",");
            sb.append(csvEscape(c.getPatientName())).append(",");
            sb.append(csvEscape(c.getPatientId())).append(",");
            sb.append(csvEscape(c.getPayer())).append(",");
            sb.append(csvEscape(c.getDenialCode())).append(",");
            sb.append(csvEscape(c.getDenialReason())).append(",");
            sb.append(c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : "").append(",");
            sb.append(csvEscape(c.getStatus())).append(",");
            sb.append(c.getFilingDeadline() != null ? c.getFilingDeadline().toString() : "").append(",");
            sb.append(c.getCreatedAt() != null ? c.getCreatedAt().toString() : "").append("\n");
        }

        return ResponseEntity.ok()
                .header("Content-Type", "text/csv")
                .header("Content-Disposition", "attachment; filename=claims_export.csv")
                .body(sb.toString());
    }

    @PostMapping("/bulk-import")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> bulkImport(@RequestBody Map<String, Object> body,
                                           HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("claims");
        if (items == null) return Map.of("imported", 0, "errors", List.of("missing 'claims' array"));

        List<Map<String, Object>> imported = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> item = items.get(i);
            try {
                Claim claim = new Claim();
                claim.setTenantId(tenantId);
                claim.setPayer((String) item.getOrDefault("payer", "Unknown"));
                claim.setPatientName((String) item.get("patient_name"));
                claim.setPatientId((String) item.get("patient_id"));
                claim.setDenialCode((String) item.get("denial_code"));
                claim.setDenialReason((String) item.get("denial_reason"));
                if (item.containsKey("amount_denied_cents"))
                    claim.setAmountDeniedCents(((Number) item.get("amount_denied_cents")).longValue());
                claim.setStatus((String) item.getOrDefault("status", "pending_review"));
                claim.setFilingDeadline(referenceDataService.computeDeadline(claim.getPayer()));
                claim.setCreatedBy(userId);
                Claim saved = claimRepository.save(claim);
                imported.add(Map.of("id", saved.getId(), "patient_name", saved.getPatientName() != null ? saved.getPatientName() : ""));
            } catch (Exception e) {
                errors.add("row " + i + ": " + e.getMessage());
            }
        }

        auditService.writeAudit(tenantId, userId, "claims.bulk_imported", "batch", tenantId,
                "{\"count\":" + imported.size() + "}");
        return Map.of("imported", imported.size(), "errors", errors, "claims", imported);
    }

    @PostMapping("/compare")
    public Map<String, Object> compareClaims(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        String tenantId = getTenantId(request);
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) body.get("claim_ids");
        if (ids == null || ids.size() < 2) return Map.of("error", "provide at least 2 claim_ids");

        List<Map<String, Object>> claimData = new ArrayList<>();
        for (String id : ids) {
            claimRepository.findById(id)
                    .filter(c -> c.getTenantId().equals(tenantId))
                    .ifPresent(c -> claimData.add(claimToMap(c)));
        }

        Map<String, Object> differences = new LinkedHashMap<>();
        if (claimData.size() >= 2) {
            Map<String, Object> first = claimData.get(0);
            for (String key : first.keySet()) {
                if ("id".equals(key) || "createdAt".equals(key) || "updatedAt".equals(key)) continue;
                Set<Object> values = claimData.stream()
                        .map(c -> c.get(key))
                        .collect(Collectors.toSet());
                if (values.size() > 1) differences.put(key, values);
            }
        }

        return Map.of("claims", claimData, "differences", differences, "identical_fields_count",
                claimData.isEmpty() ? 0 : claimData.get(0).size() - differences.size() - 3);
    }

    @PostMapping("/merge")
    public ResponseEntity<?> mergeClaims(@RequestBody Map<String, Object> body,
                                          HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        String primaryId = (String) body.get("primary_id");
        String secondaryId = (String) body.get("secondary_id");

        Optional<Claim> primaryOpt = claimRepository.findById(primaryId).filter(c -> c.getTenantId().equals(tenantId));
        Optional<Claim> secondaryOpt = claimRepository.findById(secondaryId).filter(c -> c.getTenantId().equals(tenantId));

        if (primaryOpt.isEmpty() || secondaryOpt.isEmpty())
            return ResponseEntity.notFound().build();

        Claim primary = primaryOpt.get();
        Claim secondary = secondaryOpt.get();

        if (primary.getAmountDeniedCents() == null && secondary.getAmountDeniedCents() != null)
            primary.setAmountDeniedCents(secondary.getAmountDeniedCents());
        if (primary.getDenialCode() == null && secondary.getDenialCode() != null)
            primary.setDenialCode(secondary.getDenialCode());
        if (primary.getDenialReason() == null && secondary.getDenialReason() != null)
            primary.setDenialReason(secondary.getDenialReason());
        if (primary.getPatientId() == null && secondary.getPatientId() != null)
            primary.setPatientId(secondary.getPatientId());

        claimRepository.save(primary);
        secondary.setStatus("merged");
        claimRepository.save(secondary);

        auditService.writeAudit(tenantId, userId, "claim.merged", "claim", primaryId,
                "{\"merged_from\":\"" + secondaryId + "\"}");

        return ResponseEntity.ok(Map.of("primary", claimToMap(primary), "secondary_status", "merged"));
    }

    @GetMapping("/{id}/snapshot")
    public ResponseEntity<?> claimSnapshot(@PathVariable String id, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        return claimRepository.findById(id)
                .filter(c -> c.getTenantId().equals(tenantId))
                .map(c -> {
                    Map<String, Object> snapshot = new LinkedHashMap<>();
                    snapshot.put("claim", claimToMap(c));
                    snapshot.put("notes", noteRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(tenantId, id));
                    snapshot.put("status_history", statusHistoryRepository.findByTenantIdAndClaimIdOrderByChangedAtDesc(tenantId, id));
                    snapshot.put("appeals", appealRepository.findByClaimIdOrderByCreatedAtDesc(id));
                    snapshot.put("audit_trail", auditLogRepository.findByTenantIdAndResourceIdOrderByCreatedAtAsc(tenantId, id));
                    snapshot.put("snapshot_at", LocalDateTime.now().toString());
                    return ResponseEntity.ok((Object) snapshot);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    private String csvEscape(String val) {
        if (val == null) return "";
        if (val.contains(",") || val.contains("\"") || val.contains("\n"))
            return "\"" + val.replace("\"", "\"\"") + "\"";
        return val;
    }

    private boolean matchesSearch(Claim c, String q) {
        return (c.getPayer() != null && c.getPayer().toLowerCase().contains(q))
                || (c.getDenialCode() != null && c.getDenialCode().toLowerCase().contains(q))
                || (c.getDenialReason() != null && c.getDenialReason().toLowerCase().contains(q))
                || (c.getClaimNumber() != null && c.getClaimNumber().toLowerCase().contains(q))
                || (c.getPatientName() != null && c.getPatientName().toLowerCase().contains(q))
                || (c.getPatientId() != null && c.getPatientId().toLowerCase().contains(q));
    }

    private Map<String, Object> claimToMap(Claim c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("tenantId", c.getTenantId());
        m.put("claimNumber", c.getClaimNumber());
        m.put("patientName", c.getPatientName());
        m.put("patientId", c.getPatientId());
        m.put("payer", c.getPayer());
        m.put("denialCode", c.getDenialCode());
        m.put("denialReason", c.getDenialReason());
        m.put("rawDenialText", c.getRawDenialText());
        m.put("rawClinicalNotes", c.getRawClinicalNotes());
        m.put("amountDeniedCents", c.getAmountDeniedCents());
        m.put("amountRecoveredCents", c.getAmountRecoveredCents());
        m.put("amountApprovedCents", c.getAmountApprovedCents());
        m.put("status", c.getStatus());
        m.put("reviewedBy", c.getReviewedBy());
        m.put("reviewedAt", c.getReviewedAt() != null ? c.getReviewedAt().toString() : null);
        m.put("filingDeadline", c.getFilingDeadline() != null ? c.getFilingDeadline().toString() : null);
        m.put("assignedTo", c.getAssignedTo());
        m.put("clinicId", c.getClinicId());
        m.put("clinicName", c.getClinicName());
        m.put("createdBy", c.getCreatedBy());
        m.put("createdAt", c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);
        m.put("updatedAt", c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null);
        return m;
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
