package com.claimshield.core.controller;

import com.claimshield.core.model.ClaimNote;
import com.claimshield.core.repository.ClaimNoteRepository;
import com.claimshield.core.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/claims/{claimId}/notes")
public class ClaimNoteController {

    private final ClaimNoteRepository noteRepository;
    private final AuditService auditService;

    public ClaimNoteController(ClaimNoteRepository noteRepository, AuditService auditService) {
        this.noteRepository = noteRepository;
        this.auditService = auditService;
    }

    @GetMapping
    public List<ClaimNote> listNotes(@PathVariable String claimId, HttpServletRequest request) {
        return noteRepository.findByTenantIdAndClaimIdOrderByCreatedAtDesc(getTenantId(request), claimId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimNote createNote(@PathVariable String claimId,
                                @RequestBody Map<String, String> body,
                                HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        ClaimNote note = new ClaimNote();
        note.setTenantId(tenantId);
        note.setClaimId(claimId);
        note.setAuthorId(userId);
        note.setContent(body.getOrDefault("content", ""));

        ClaimNote saved = noteRepository.save(note);
        auditService.writeAudit(tenantId, userId, "note.created", "claim", claimId,
                "{\"note_id\":\"" + saved.getId() + "\"}");
        return saved;
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<?> deleteNote(@PathVariable String claimId,
                                        @PathVariable String noteId,
                                        HttpServletRequest request) {
        return noteRepository.findById(noteId)
                .map(note -> {
                    String tenantId = getTenantId(request);
                    if (!tenantId.equals(note.getTenantId())) return ResponseEntity.notFound().build();
                    noteRepository.delete(note);
                    auditService.writeAudit(tenantId, getUserId(request), "note.deleted", "claim", claimId,
                            "{\"note_id\":\"" + noteId + "\"}");
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
