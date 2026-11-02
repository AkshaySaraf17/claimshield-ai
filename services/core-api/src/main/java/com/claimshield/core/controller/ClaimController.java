package com.claimshield.core.controller;

import com.claimshield.core.model.*;
import com.claimshield.core.repository.*;
import com.claimshield.core.service.AuditService;
import com.claimshield.core.service.ClaimMapper;
import com.claimshield.core.service.ReferenceDataService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
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
    private final ClaimAssignmentRepository assignmentRepository;
    private final ClaimLinkRepository linkRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ClaimTagRepository tagRepository;
    private final ClaimCostRepository costRepository;
    private final ClaimAttachmentRepository attachmentRepository;

    public ClaimController(ClaimRepository claimRepository,
                           AppealRepository appealRepository,
                           AuditService auditService,
                           ReferenceDataService referenceDataService,
                           ClaimStatusHistoryRepository statusHistoryRepository,
                           AuditLogRepository auditLogRepository,
                           ClaimNoteRepository noteRepository,
                           ClaimAssignmentRepository assignmentRepository,
                           ClaimLinkRepository linkRepository,
                           JdbcTemplate jdbcTemplate,
                           ClaimTagRepository tagRepository,
                           ClaimCostRepository costRepository,
                           ClaimAttachmentRepository attachmentRepository) {
        this.claimRepository = claimRepository;
        this.appealRepository = appealRepository;
        this.auditService = auditService;
        this.referenceDataService = referenceDataService;
        this.statusHistoryRepository = statusHistoryRepository;
        this.auditLogRepository = auditLogRepository;
        this.noteRepository = noteRepository;
        this.assignmentRepository = assignmentRepository;
        this.linkRepository = linkRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.tagRepository = tagRepository;
        this.costRepository = costRepository;
        this.attachmentRepository = attachmentRepository;
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
    public Map<String, Object> batchTransition(@RequestBody Map<String, Object> body,
                                               HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        // Pages send new_status (Python contract); status is accepted too
        String newStatus = (String) (body.get("new_status") != null ? body.get("new_status") : body.get("status"));
        @SuppressWarnings("unchecked")
        List<String> claimIds = (List<String>) body.getOrDefault("claim_ids", List.of());

        List<Map<String, Object>> results = new ArrayList<>();
        for (String cid : claimIds) {
            Optional<Claim> found = claimRepository.findById(cid).filter(c -> tenantId.equals(c.getTenantId()));
            if (found.isEmpty()) {
                results.add(Map.of("id", cid, "claim_id", cid, "success", false, "error", "not found"));
                continue;
            }
            Claim claim = found.get();
            Set<String> allowed = ReferenceDataService.ALLOWED_TRANSITIONS.getOrDefault(claim.getStatus(), Set.of());
            if (newStatus == null || !allowed.contains(newStatus)) {
                results.add(Map.of("id", cid, "claim_id", cid, "success", false,
                        "error", "cannot transition from " + claim.getStatus() + " to " + newStatus));
                continue;
            }
            String oldStatus = claim.getStatus();
            claim.setStatus(newStatus);
            claimRepository.save(claim);

            ClaimStatusHistory history = new ClaimStatusHistory();
            history.setTenantId(tenantId);
            history.setClaimId(cid);
            history.setFromStatus(oldStatus);
            history.setToStatus(newStatus);
            history.setChangedBy(userId);
            history.setReason("batch");
            statusHistoryRepository.save(history);

            auditService.writeAudit(tenantId, userId, "claim.status_changed", "claim", cid,
                    "{\"old_status\":\"" + oldStatus + "\",\"new_status\":\"" + newStatus + "\",\"source\":\"batch\"}");
            results.add(Map.of("id", cid, "claim_id", cid, "success", true, "new_status", newStatus));
        }

        List<Map<String, Object>> errors = results.stream().filter(r -> !Boolean.TRUE.equals(r.get("success"))).toList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", results);
        response.put("transitioned", results.size() - errors.size());
        response.put("failed", errors.size());
        response.put("errors", errors);
        return response;
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
    @Transactional
    public Map<String, Object> batchGenerateLetters(@RequestBody Map<String, Object> body,
                                                     HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        @SuppressWarnings("unchecked")
        List<String> claimIds = (List<String>) body.getOrDefault("claim_ids", List.of());
        String templateCategory = (String) body.get("template_category");
        boolean saveAsDraft = Boolean.TRUE.equals(body.get("save_as_draft"));

        List<Map<String, Object>> results = new ArrayList<>();
        for (String cid : claimIds.subList(0, Math.min(claimIds.size(), 20))) {
            Optional<Claim> found = claimRepository.findById(cid).filter(c -> tenantId.equals(c.getTenantId()));
            if (found.isEmpty()) {
                results.add(Map.of("claim_id", cid, "error", "Claim not found"));
                continue;
            }
            Claim claim = found.get();
            String category = templateCategory;
            if (category == null || category.isBlank()) {
                category = ReferenceDataService.DENIAL_CODE_TO_CATEGORY.getOrDefault(
                        claim.getDenialCode(), "Medical Necessity");
            }
            String letter = referenceDataService.generateAppealLetter(claimToMap(claim), category);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("claim_id", cid);
            entry.put("claim_number", claim.getClaimNumber());
            entry.put("template_category", category);
            entry.put("letter_text", letter);
            entry.put("source", ReferenceDataService.APPEAL_TEMPLATES.containsKey(category) ?
                    ReferenceDataService.APPEAL_TEMPLATES.get(category).source() : "N/A");

            if (saveAsDraft) {
                // Drafts stay needs_review until a human approves (server-enforced in AppealController)
                Appeal appeal = new Appeal();
                appeal.setTenantId(tenantId);
                appeal.setClaimId(cid);
                appeal.setStatus("draft");
                appeal.setLetterBody(letter);
                appeal.setConfidence(0.85);
                appeal.setTemplateUsed(category);
                appeal.setVersion(appealRepository.findByTenantIdAndClaimIdOrderByVersionAsc(tenantId, cid).size() + 1);
                appeal.setCreatedBy(userId);
                Appeal saved = appealRepository.save(appeal);
                auditService.writeAudit(tenantId, userId, "appeal.drafted", "appeal", saved.getId(),
                        "{\"source\":\"batch\",\"category\":\"" + category + "\"}");
                entry.put("appeal_id", saved.getId());
            }
            results.add(entry);
        }

        long errors = results.stream().filter(r -> r.containsKey("error")).count();
        return Map.of("generated", results.size() - errors, "errors", errors, "results", results);
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
                if ("id".equals(key) || "created_at".equals(key) || "updated_at".equals(key)) continue;
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
    @Transactional
    public ResponseEntity<?> mergeClaims(@RequestBody Map<String, Object> body,
                                         HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        // Python contract: primary_claim_id + secondary_claim_ids[]; primary_id + secondary_id also accepted
        String primaryId = (String) (body.get("primary_claim_id") != null ? body.get("primary_claim_id") : body.get("primary_id"));
        List<String> secondaryIds = new ArrayList<>();
        if (body.get("secondary_claim_ids") instanceof List<?> ids) ids.forEach(i -> secondaryIds.add(String.valueOf(i)));
        if (body.get("secondary_id") != null) secondaryIds.add(body.get("secondary_id").toString());

        Optional<Claim> primaryOpt = Optional.ofNullable(primaryId).flatMap(claimRepository::findById)
                .filter(c -> c.getTenantId().equals(tenantId));
        if (primaryOpt.isEmpty())
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Primary claim not found"));
        Claim primary = primaryOpt.get();
        String primaryLabel = primary.getClaimNumber() != null ? primary.getClaimNumber() : primary.getId();

        List<String> mergedIds = new ArrayList<>();
        for (String secId : secondaryIds) {
            Optional<Claim> secOpt = claimRepository.findById(secId).filter(c -> c.getTenantId().equals(tenantId));
            if (secOpt.isEmpty() || secId.equals(primary.getId())) continue;
            Claim sec = secOpt.get();
            String secLabel = sec.getClaimNumber() != null ? sec.getClaimNumber() : sec.getId();

            if (primary.getAmountDeniedCents() == null) primary.setAmountDeniedCents(sec.getAmountDeniedCents());
            if (primary.getDenialCode() == null) primary.setDenialCode(sec.getDenialCode());
            if (primary.getDenialReason() == null) primary.setDenialReason(sec.getDenialReason());
            if (primary.getPatientId() == null) primary.setPatientId(sec.getPatientId());
            primary.setRawClinicalNotes(appendMerged(primary.getRawClinicalNotes(), sec.getRawClinicalNotes(), secLabel));
            primary.setRawDenialText(appendMerged(primary.getRawDenialText(), sec.getRawDenialText(), secLabel));

            sec.setStatus("cancelled");
            claimRepository.save(sec);
            addNote(tenantId, sec.getId(), userId, "Merged into " + primaryLabel);
            mergedIds.add(sec.getId());
        }
        claimRepository.save(primary);
        addNote(tenantId, primary.getId(), userId, "Absorbed " + mergedIds.size() + " claim(s): "
                + String.join(", ", mergedIds.subList(0, Math.min(5, mergedIds.size()))));
        auditService.writeAudit(tenantId, userId, "claim.merged", "claim", primary.getId(),
                "{\"merged_ids\":[" + mergedIds.stream().map(i -> "\"" + i + "\"").collect(Collectors.joining(",")) + "]}");

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("primary_id", primary.getId());
        response.put("merged_count", mergedIds.size());
        response.put("merged_ids", mergedIds);
        return ResponseEntity.ok(response);
    }

    private String appendMerged(String existing, String incoming, String fromLabel) {
        if (incoming == null || incoming.equals(existing)) return existing;
        return (existing != null ? existing : "") + "\n\n--- merged from " + fromLabel + " ---\n" + incoming;
    }

    private void addNote(String tenantId, String claimId, String userId, String content) {
        ClaimNote note = new ClaimNote();
        note.setTenantId(tenantId);
        note.setClaimId(claimId);
        note.setAuthorId(userId);
        note.setContent(content);
        noteRepository.save(note);
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
                    snapshot.put("tags", tagRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(tenantId, id).stream()
                            .map(ClaimTag::getTag).toList());
                    long costsTotal = costRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(tenantId, id).stream()
                            .mapToLong(cost -> cost.getAmountCents() != null ? cost.getAmountCents() : 0).sum();
                    snapshot.put("costs_total_cents", costsTotal);
                    snapshot.put("total_cost_cents", costsTotal);
                    snapshot.put("attachments_count", attachmentRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(tenantId, id).size());
                    snapshot.put("snapshot_at", LocalDateTime.now().toString());
                    return ResponseEntity.ok((Object) snapshot);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/priority-scores")
    public List<Map<String, Object>> priorityScores(HttpServletRequest request) {
        String tenantId = getTenantId(request);
        LocalDateTime now = LocalDateTime.now();
        Set<String> active = Set.of("pending_review", "in_progress", "needs_review", "approved");

        return claimRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .filter(c -> active.contains(c.getStatus()))
                .map(c -> {
                    int score = 0;
                    List<String> reasons = new ArrayList<>();

                    long amount = c.getAmountDeniedCents() != null ? c.getAmountDeniedCents() : 0;
                    if (amount >= 50_000) { score += 30; reasons.add("high_value"); }
                    else if (amount >= 10_000) { score += 15; reasons.add("medium_value"); }

                    if (c.getFilingDeadline() != null) {
                        long daysLeft = ChronoUnit.DAYS.between(now, c.getFilingDeadline());
                        if (daysLeft < 0) { score += 50; reasons.add("overdue"); }
                        else if (daysLeft <= 7) { score += 40; reasons.add("deadline_urgent"); }
                        else if (daysLeft <= 30) { score += 20; reasons.add("deadline_approaching"); }
                    }

                    if ("pending_review".equals(c.getStatus()) && c.getCreatedAt() != null) {
                        long ageDays = ChronoUnit.DAYS.between(c.getCreatedAt(), now);
                        if (ageDays > 14) { score += 20; reasons.add("stale"); }
                        else if (ageDays > 7) { score += 10; reasons.add("aging"); }
                    }

                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("claim_id", c.getId());
                    m.put("claim_number", c.getClaimNumber());
                    m.put("payer_name", c.getPayer());
                    m.put("denial_code", c.getDenialCode());
                    m.put("status", c.getStatus());
                    m.put("amount_denied_cents", c.getAmountDeniedCents());
                    m.put("filing_deadline", c.getFilingDeadline() != null ? c.getFilingDeadline().toString() : null);
                    m.put("priority_score", score);
                    m.put("reasons", reasons);
                    return m;
                })
                .sorted(Comparator.comparingInt((Map<String, Object> m) -> (int) m.get("priority_score")).reversed())
                .toList();
    }

    @PostMapping("/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> bulkCreate(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.getOrDefault("claims", List.of());

        List<String> created = new ArrayList<>();
        for (Map<String, Object> item : items) {
            Claim claim = new Claim();
            claim.setTenantId(tenantId);
            claim.setPatientId((String) item.get("patient_id"));
            claim.setClaimNumber((String) item.get("claim_number"));
            claim.setPayer((String) item.getOrDefault("payer_name", item.getOrDefault("payer", "Unknown")));
            claim.setDenialCode((String) item.get("denial_code"));
            claim.setDenialReason((String) item.get("denial_reason"));
            claim.setRawDenialText((String) item.get("raw_denial_text"));
            claim.setRawClinicalNotes((String) item.get("raw_clinical_notes"));
            if (item.get("amount_denied_cents") instanceof Number n) claim.setAmountDeniedCents(n.longValue());
            claim.setFilingDeadline(referenceDataService.computeDeadline(claim.getPayer()));
            claim.setCreatedBy(userId);
            Claim saved = claimRepository.save(claim);
            auditService.writeAudit(tenantId, userId, "claim.created", "claim", saved.getId(), "{\"source\":\"bulk\"}");
            created.add(saved.getId());
        }
        return Map.of("created", created.size(), "claim_ids", created);
    }

    @PostMapping("/{id}/assign")
    public ResponseEntity<?> assignClaim(@PathVariable String id, @RequestBody Map<String, String> body,
                                         HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        Optional<Claim> claim = claimRepository.findById(id).filter(c -> c.getTenantId().equals(tenantId));
        if (claim.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Claim not found"));

        ClaimAssignment assignment = new ClaimAssignment();
        assignment.setTenantId(tenantId);
        assignment.setClaimId(id);
        assignment.setAssignedTo(body.get("assigned_to"));
        assignment.setAssignedBy(userId);
        assignment.setNote(body.get("note"));
        ClaimAssignment saved = assignmentRepository.save(assignment);

        Claim c = claim.get();
        c.setAssignedTo(body.get("assigned_to"));
        claimRepository.save(c);
        auditService.writeAudit(tenantId, userId, "claim.assigned", "claim", id,
                "{\"assigned_to\":\"" + body.get("assigned_to") + "\"}");

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", saved.getId());
        m.put("claim_id", id);
        m.put("assigned_to", saved.getAssignedTo());
        m.put("assignee_name", ReferenceDataService.teamMemberName(saved.getAssignedTo()));
        m.put("assigned_by", userId);
        m.put("note", saved.getNote());
        m.put("created_at", saved.getCreatedAt().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(m);
    }

    @GetMapping("/{id}/predict")
    public ResponseEntity<?> predictAppealSuccess(@PathVariable String id, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        Optional<Claim> found = claimRepository.findById(id).filter(c -> c.getTenantId().equals(tenantId));
        if (found.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Claim not found"));
        Claim claim = found.get();

        String code = claim.getDenialCode() != null ? claim.getDenialCode() : "";
        String payer = claim.getPayer() != null ? claim.getPayer() : "";
        long amount = claim.getAmountDeniedCents() != null ? claim.getAmountDeniedCents() : 0;

        double baseRate = ReferenceDataService.HISTORICAL_WIN_RATES.getOrDefault(code, ReferenceDataService.DEFAULT_WIN_RATE);
        double payerAdj = ReferenceDataService.PAYER_MODIFIER.getOrDefault(payer, 0.0);
        double amountAdj = 0.0;
        if (amount < 50_000) amountAdj = 0.05;
        else if (amount > 500_000) amountAdj = -0.10;
        else if (amount > 200_000) amountAdj = -0.05;
        boolean hasClinical = claim.getRawClinicalNotes() != null && claim.getRawClinicalNotes().length() > 50;
        double docAdj = hasClinical ? 0.10 : -0.15;

        double score = Math.max(0.05, Math.min(0.95, baseRate + payerAdj + amountAdj + docAdj));

        List<Map<String, Object>> factors = new ArrayList<>();
        factors.add(Map.of("factor", "Denial code history", "code", code,
                "impact", pct(baseRate) + " base win rate", "direction", "neutral"));
        if (payerAdj != 0) {
            factors.add(Map.of("factor", "Payer favorability", "payer", payer,
                    "impact", signedPct(payerAdj), "direction", payerAdj > 0 ? "positive" : "negative"));
        }
        if (amountAdj != 0) {
            factors.add(Map.of("factor", "Claim amount", "impact", signedPct(amountAdj),
                    "direction", amountAdj > 0 ? "positive" : "negative"));
        }
        factors.add(Map.of("factor", "Clinical documentation", "impact", signedPct(docAdj),
                "direction", docAdj > 0 ? "positive" : "negative"));

        String risk = score >= 0.6 ? "low" : score >= 0.35 ? "medium" : "high";
        String recommendation = score >= 0.6 ? "Strong case — proceed with appeal"
                : score >= 0.35 ? "Moderate case — consider strengthening documentation before appeal"
                : "Weak case — review denial reason carefully before investing appeal resources";

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("claim_id", id);
        m.put("predicted_win_probability", Math.round(score * 100) / 100.0);
        m.put("risk_level", risk);
        m.put("factors", factors);
        m.put("recommendation", recommendation);
        m.put("source", "Deterministic model based on historical win rates by denial code, payer, amount, and documentation quality");
        return ResponseEntity.ok(m);
    }

    @PostMapping("/{id}/escalate")
    public ResponseEntity<?> escalateClaim(@PathVariable String id,
                                           @RequestBody(required = false) Map<String, String> body,
                                           HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        if (claimRepository.findById(id).filter(c -> c.getTenantId().equals(tenantId)).isEmpty())
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Claim not found"));

        String reason = body != null && body.get("reason") != null ? body.get("reason") : "Escalated for review";
        ClaimNote note = new ClaimNote();
        note.setTenantId(tenantId);
        note.setClaimId(id);
        note.setAuthorId(userId);
        note.setContent("[ESCALATION] " + reason);
        ClaimNote saved = noteRepository.save(note);
        auditService.writeAudit(tenantId, userId, "escalate", "claim", id,
                "{\"reason\":\"" + reason.replace("\"", "\\\"") + "\"}");

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("status", "escalated", "claim_id", id, "note_id", saved.getId()));
    }

    @PostMapping("/{id}/auto-route")
    public ResponseEntity<?> autoRoute(@PathVariable String id, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        Optional<Claim> found = claimRepository.findById(id).filter(c -> c.getTenantId().equals(tenantId));
        if (found.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "claim not found"));
        Claim claim = found.get();

        // routing_rules is owned by workflow-service; read it from the shared DB (highest priority wins)
        List<Map<String, Object>> rules = jdbcTemplate.queryForList(
                "SELECT id, name, match_field, match_operator, match_value, match_payer, match_denial_code, " +
                "min_amount_cents, max_amount_cents, assign_to FROM routing_rules " +
                "WHERE tenant_id = ? AND is_active = TRUE ORDER BY priority DESC", tenantId);

        Map<String, Object> matched = rules.stream().filter(r -> ruleMatches(r, claim)).findFirst().orElse(null);
        if (matched == null) return ResponseEntity.ok(Map.of("routed", false, "reason", "no matching rule"));

        String assignTo = String.valueOf(col(matched, "assign_to"));
        String ruleId = String.valueOf(col(matched, "id"));
        String ruleName = String.valueOf(col(matched, "name"));

        ClaimAssignment assignment = new ClaimAssignment();
        assignment.setTenantId(tenantId);
        assignment.setClaimId(id);
        assignment.setAssignedTo(assignTo);
        assignment.setAssignedBy("system:auto-route");
        assignment.setNote("Auto-routed by rule: " + ruleName);
        assignmentRepository.save(assignment);
        claim.setAssignedTo(assignTo);
        claimRepository.save(claim);

        auditService.writeAudit(tenantId, userId, "claim.auto_route", "claim", id,
                "{\"rule_id\":\"" + ruleId + "\",\"assigned_to\":\"" + assignTo + "\"}");

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("routed", true);
        m.put("rule_id", ruleId);
        m.put("rule_name", ruleName);
        m.put("assigned_to", assignTo);
        m.put("assigned_to_name", ReferenceDataService.teamMemberName(assignTo));
        return ResponseEntity.ok(m);
    }

    @GetMapping("/{id}/letter-history")
    public List<Map<String, Object>> letterHistory(@PathVariable String id, HttpServletRequest request) {
        return appealRepository.findByTenantIdAndClaimIdOrderByVersionAsc(getTenantId(request), id).stream()
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("appeal_id", a.getId());
                    m.put("version", a.getVersion());
                    m.put("letter_text", a.getLetterText());
                    m.put("confidence", a.getConfidence());
                    m.put("needs_review", a.getNeedsReview());
                    m.put("approved_by", a.getApprovedBy());
                    m.put("approved_at", a.getApprovedAt() != null ? a.getApprovedAt().toString() : null);
                    m.put("created_at", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
                    return m;
                }).toList();
    }

    @GetMapping("/{id}/appeal-versions")
    public List<Map<String, Object>> appealVersions(@PathVariable String id, HttpServletRequest request) {
        return appealRepository.findByTenantIdAndClaimIdOrderByVersionAsc(getTenantId(request), id).stream()
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", a.getId());
                    m.put("version", a.getVersion());
                    m.put("letter_text", a.getLetterText());
                    m.put("policy_evidence", a.getPolicyEvidence());
                    m.put("confidence", a.getConfidence());
                    m.put("needs_review", a.getNeedsReview());
                    m.put("approved_by", ReferenceDataService.teamMemberName(a.getApprovedBy()));
                    m.put("approved_at", a.getApprovedAt() != null ? a.getApprovedAt().toString() : null);
                    m.put("created_at", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
                    return m;
                }).toList();
    }

    @GetMapping("/{id}/audit-trail")
    public List<Map<String, Object>> auditTrail(@PathVariable String id, HttpServletRequest request) {
        return auditLogRepository.findByTenantIdAndResourceIdOrderByCreatedAtDesc(getTenantId(request), id).stream()
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.getId());
                    m.put("action", r.getAction());
                    m.put("actor", ReferenceDataService.teamMemberName(r.getActorId()));
                    m.put("actor_id", r.getActorId());
                    m.put("detail", r.getDetail());
                    m.put("hash", r.getEntryHash() != null ? r.getEntryHash().substring(0, Math.min(12, r.getEntryHash().length())) : null);
                    m.put("created_at", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
                    return m;
                }).toList();
    }

    @GetMapping("/{id}/links")
    public List<Map<String, Object>> claimLinks(@PathVariable String id, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        List<ClaimLink> rows = linkRepository.findByTenantIdAndClaimId(tenantId, id);
        Set<String> otherIds = rows.stream()
                .map(r -> id.equals(r.getClaimIdA()) ? r.getClaimIdB() : r.getClaimIdA())
                .collect(Collectors.toSet());
        Map<String, Claim> others = claimRepository.findAllById(otherIds).stream()
                .filter(c -> c.getTenantId().equals(tenantId))
                .collect(Collectors.toMap(Claim::getId, c -> c));

        return rows.stream().map(r -> {
            String otherId = id.equals(r.getClaimIdA()) ? r.getClaimIdB() : r.getClaimIdA();
            Claim other = others.get(otherId);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("link_id", r.getId());
            m.put("link_type", r.getLinkType());
            m.put("other_claim_id", otherId);
            m.put("other_claim_number", other != null ? other.getClaimNumber() : null);
            m.put("other_status", other != null ? other.getStatus() : null);
            m.put("other_payer", other != null ? other.getPayer() : null);
            m.put("created_by", r.getCreatedBy());
            m.put("created_at", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
            return m;
        }).toList();
    }

    @PostMapping("/{id}/links")
    public ResponseEntity<?> createClaimLink(@PathVariable String id, @RequestBody Map<String, String> body,
                                             HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        String otherId = body.getOrDefault("other_claim_id", "");
        String linkType = body.getOrDefault("link_type", "related");
        if (otherId.isBlank())
            return ResponseEntity.badRequest().body(Map.of("detail", "other_claim_id required"));
        if (!ReferenceDataService.LINK_TYPES.contains(linkType))
            return ResponseEntity.badRequest().body(Map.of("detail", "link_type must be one of " + ReferenceDataService.LINK_TYPES));

        ClaimLink link = new ClaimLink();
        link.setTenantId(tenantId);
        link.setClaimIdA(id);
        link.setClaimIdB(otherId);
        link.setLinkType(linkType);
        link.setCreatedBy(userId);
        ClaimLink saved = linkRepository.save(link);
        auditService.writeAudit(tenantId, userId, "claim_link.create", "claim", id,
                "{\"other_claim_id\":\"" + otherId + "\",\"link_type\":\"" + linkType + "\"}");

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "id", saved.getId(), "link_type", linkType, "claim_id_a", id, "claim_id_b", otherId));
    }

    /** A rule matches when every condition it sets matches (specific conditions AND the generic field/operator/value). */
    private boolean ruleMatches(Map<String, Object> rule, Claim claim) {
        long amount = claim.getAmountDeniedCents() != null ? claim.getAmountDeniedCents() : 0;

        Object payer = col(rule, "match_payer");
        if (payer != null && !payer.toString().equalsIgnoreCase(claim.getPayer() != null ? claim.getPayer() : "")) return false;
        Object code = col(rule, "match_denial_code");
        if (code != null && !code.toString().equals(claim.getDenialCode())) return false;
        if (col(rule, "min_amount_cents") instanceof Number min && amount < min.longValue()) return false;
        if (col(rule, "max_amount_cents") instanceof Number max && amount > max.longValue()) return false;

        Object field = col(rule, "match_field");
        if (field == null) return true;
        return genericConditionMatches(field.toString(), String.valueOf(col(rule, "match_operator")),
                String.valueOf(col(rule, "match_value")), claim, amount);
    }

    private boolean genericConditionMatches(String field, String op, String value, Claim claim, long amount) {
        if ("amount_denied_cents".equals(field)) {
            long threshold;
            try { threshold = Long.parseLong(value); } catch (NumberFormatException e) { return false; }
            return switch (op) {
                case "greater_than" -> amount > threshold;
                case "less_than" -> amount < threshold;
                case "equals" -> amount == threshold;
                default -> false;
            };
        }

        String actual = switch (field) {
            case "payer", "payer_name" -> claim.getPayer();
            case "denial_code" -> claim.getDenialCode();
            case "status" -> claim.getStatus();
            case "clinic_id" -> claim.getClinicId();
            default -> null;
        };
        if (actual == null) return false;
        return switch (op) {
            case "equals" -> actual.equalsIgnoreCase(value);
            case "contains" -> actual.toLowerCase().contains(value.toLowerCase());
            case "starts_with" -> actual.toLowerCase().startsWith(value.toLowerCase());
            default -> false;
        };
    }

    // H2 returns upper-case column keys from queryForList
    private Object col(Map<String, Object> row, String name) {
        Object v = row.get(name.toUpperCase());
        return v != null ? v : row.get(name);
    }

    private static String pct(double v) {
        return Math.round(v * 100) + "%";
    }

    private static String signedPct(double v) {
        long p = Math.round(v * 100);
        return (p >= 0 ? "+" : "") + p + "%";
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
        return ClaimMapper.toMap(c);
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
