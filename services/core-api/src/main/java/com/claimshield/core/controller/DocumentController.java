package com.claimshield.core.controller;

import com.claimshield.core.model.Document;
import com.claimshield.core.service.AuditService;
import com.claimshield.core.service.DocumentService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    private final DocumentService documentService;
    private final AuditService auditService;

    private static final List<String> ALLOWED_TYPES = List.of(
            "pdf", "docx", "doc", "xlsx", "xls", "csv", "txt"
    );

    public DocumentController(DocumentService documentService, AuditService auditService) {
        this.documentService = documentService;
        this.auditService = auditService;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "claim_id", required = false) String claimId,
            HttpServletRequest request) {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file uploaded"));
        }

        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";
        String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : "";

        if (!ALLOWED_TYPES.contains(ext)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Unsupported file type: " + ext,
                    "allowed", ALLOWED_TYPES
            ));
        }

        String tenantId = getTenantId(request);
        String userId = getUserId(request);

        Document doc = documentService.uploadAndExtract(file, tenantId, userId, claimId);

        auditService.writeAudit(tenantId, userId, "document.uploaded", "document", doc.getId(),
                "{\"file_name\":\"" + doc.getFileName() + "\",\"file_type\":\"" + doc.getFileType() +
                        "\",\"status\":\"" + doc.getExtractionStatus() + "\"}");

        return ResponseEntity.ok(doc);
    }

    @GetMapping
    public List<Document> listDocuments(HttpServletRequest request) {
        return documentService.listByTenant(getTenantId(request));
    }

    @GetMapping("/claim/{claimId}")
    public List<Document> listByClaimId(@PathVariable String claimId) {
        return documentService.listByClaim(claimId);
    }

    @GetMapping("/types")
    public Map<String, Object> getSupportedTypes() {
        return Map.of(
                "supported_types", ALLOWED_TYPES,
                "max_file_size_mb", 50,
                "description", Map.of(
                        "pdf", "PDF documents — text extracted via PDFBox",
                        "docx", "Microsoft Word documents",
                        "xlsx", "Microsoft Excel spreadsheets",
                        "xls", "Legacy Excel spreadsheets",
                        "csv", "Comma-separated values",
                        "txt", "Plain text files",
                        "doc", "Legacy Word documents (limited support)"
                )
        );
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
