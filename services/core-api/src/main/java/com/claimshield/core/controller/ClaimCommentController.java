package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimComment;
import com.claimshield.core.repository.ClaimCommentRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claims/{claimId}/comments")
public class ClaimCommentController {

    private final ClaimCommentRepository commentRepository;
    private final AuditService auditService;

    public ClaimCommentController(ClaimCommentRepository commentRepository, AuditService auditService) {
        this.commentRepository = commentRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<ClaimComment> listComments(@PathVariable String claimId, HttpServletRequest request) {
        return commentRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimComment createComment(@PathVariable String claimId,
                                      @RequestBody Map<String, String> body,
                                      HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        ClaimComment comment = new ClaimComment();
        comment.setTenantId(tenantId);
        comment.setClaimId(claimId);
        comment.setAuthorId(userId);
        comment.setBody(body.getOrDefault("body", ""));
        comment.setParentId(body.get("parent_id"));

        ClaimComment saved = commentRepository.save(comment);
        auditService.writeAudit(tenantId, userId, "comment.created", "claim", claimId,
                "{\"comment_id\":\"" + saved.getId() + "\"}");
        return saved;
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<?> deleteComment(@PathVariable String claimId,
                                           @PathVariable String commentId,
                                           HttpServletRequest request) {
        return commentRepository.findById(commentId)
                .map(comment -> {
                    String tenantId = getTenantId(request);
                    if (!tenantId.equals(comment.getTenantId())) return ResponseEntity.notFound().build();
                    commentRepository.delete(comment);
                    return ResponseEntity.noContent().build();
                })
                .orElse(ResponseEntity.notFound().build());
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
