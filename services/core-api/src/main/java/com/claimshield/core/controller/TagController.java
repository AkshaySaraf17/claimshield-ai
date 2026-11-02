package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimTag;
import com.claimshield.core.repository.ClaimTagRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/** Tenant-wide tag operations (per-claim tags live in ClaimTagController). */
@RestController
@RequestMapping("/api/v1/tags")
public class TagController {

    private final ClaimTagRepository tagRepository;
    private final AuditService auditService;

    public TagController(ClaimTagRepository tagRepository, AuditService auditService) {
        this.tagRepository = tagRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<Map<String, Object>> listTags(HttpServletRequest request) {
        return tagCounts(getTenantId(request));
    }

    @GetMapping("/summary")
    public List<Map<String, Object>> tagSummary(HttpServletRequest request) {
        return tagCounts(getTenantId(request));
    }

    @PostMapping("/batch")
    @Transactional
    public ResponseEntity<?> batchTag(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        List<String> claimIds = claimIds(body);
        String tag = body.get("tag") != null ? body.get("tag").toString().trim() : "";
        String action = body.get("action") != null ? body.get("action").toString() : "add";
        if (tag.isEmpty() || claimIds.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("detail", "claim_ids and tag required"));

        int added = 0, removed = 0;
        if ("add".equals(action)) added = addTag(tenantId, userId, claimIds, tag);
        else if ("remove".equals(action)) removed = removeTag(tenantId, claimIds, tag);

        return ResponseEntity.ok(Map.of("added", added, "removed", removed, "tag", tag, "claim_count", claimIds.size()));
    }

    @PostMapping("/bulk-add")
    @Transactional
    public Map<String, Object> bulkAdd(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        List<String> claimIds = claimIds(body);
        String tag = String.valueOf(body.get("tag"));
        int added = addTag(tenantId, userId, claimIds, tag);
        auditService.writeAudit(tenantId, userId, "tag.bulk_add", "claim_tag", tag,
                "{\"claim_count\":" + claimIds.size() + ",\"tag\":\"" + tag + "\"}");
        return Map.of("added", added, "tag", tag, "claim_count", claimIds.size());
    }

    @PostMapping("/bulk-remove")
    @Transactional
    public Map<String, Object> bulkRemove(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        List<String> claimIds = claimIds(body);
        String tag = String.valueOf(body.get("tag"));
        int removed = removeTag(tenantId, claimIds, tag);
        auditService.writeAudit(tenantId, userId, "tag.bulk_remove", "claim_tag", tag,
                "{\"claim_count\":" + claimIds.size() + ",\"tag\":\"" + tag + "\"}");
        return Map.of("removed", removed, "tag", tag, "claim_count", claimIds.size());
    }

    private List<Map<String, Object>> tagCounts(String tenantId) {
        Map<String, Long> counts = tagRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .collect(Collectors.groupingBy(ClaimTag::getTag, Collectors.counting()));
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> Map.<String, Object>of("tag", e.getKey(), "count", e.getValue()))
                .toList();
    }

    private int addTag(String tenantId, String userId, List<String> claimIds, String tag) {
        int added = 0;
        for (String cid : claimIds) {
            if (tagRepository.findByTenantIdAndClaimIdAndTag(tenantId, cid, tag).isEmpty()) {
                ClaimTag t = new ClaimTag();
                t.setTenantId(tenantId);
                t.setClaimId(cid);
                t.setTag(tag);
                t.setCreatedBy(userId);
                tagRepository.save(t);
                added++;
            }
        }
        return added;
    }

    private int removeTag(String tenantId, List<String> claimIds, String tag) {
        int removed = 0;
        for (String cid : claimIds) {
            List<ClaimTag> rows = tagRepository.findByTenantIdAndClaimIdAndTag(tenantId, cid, tag);
            if (!rows.isEmpty()) {
                tagRepository.deleteAll(rows);
                removed++;
            }
        }
        return removed;
    }

    @SuppressWarnings("unchecked")
    private List<String> claimIds(Map<String, Object> body) {
        Object ids = body.get("claim_ids");
        return ids instanceof List<?> ? (List<String>) ids : List.of();
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
