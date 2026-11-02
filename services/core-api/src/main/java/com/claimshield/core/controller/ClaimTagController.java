package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimTag;
import com.claimshield.core.repository.ClaimTagRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claims/{claimId}/tags")
public class ClaimTagController {

    private final ClaimTagRepository tagRepository;
    private final AuditService auditService;

    public ClaimTagController(ClaimTagRepository tagRepository, AuditService auditService) {
        this.tagRepository = tagRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<ClaimTag> listTags(@PathVariable String claimId, HttpServletRequest request) {
        return tagRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimTag createTag(@PathVariable String claimId,
                              @RequestBody Map<String, String> body,
                              HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        ClaimTag tag = new ClaimTag();
        tag.setTenantId(tenantId);
        tag.setClaimId(claimId);
        tag.setCreatedBy(userId);
        tag.setTag(body.getOrDefault("tag", ""));

        return tagRepository.save(tag);
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<?> deleteTag(@PathVariable String claimId,
                                       @PathVariable String tagId,
                                       HttpServletRequest request) {
        return tagRepository.findById(tagId)
                .map(tag -> {
                    if (!getTenantId(request).equals(tag.getTenantId())) return ResponseEntity.notFound().build();
                    tagRepository.delete(tag);
                    return ResponseEntity.noContent().build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public List<ClaimTag> bulkAddTags(@PathVariable String claimId,
                                      @RequestBody Map<String, List<String>> body,
                                      HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        List<String> tags = body.getOrDefault("tags", List.of());

        return tags.stream().map(t -> {
            ClaimTag tag = new ClaimTag();
            tag.setTenantId(tenantId);
            tag.setClaimId(claimId);
            tag.setCreatedBy(userId);
            tag.setTag(t);
            return tagRepository.save(tag);
        }).toList();
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
