package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.CustomTemplate;
import com.claimshield.workflow.repository.CustomTemplateRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/custom-templates")
public class CustomTemplateController {

    private final CustomTemplateRepository repository;

    public CustomTemplateController(CustomTemplateRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<CustomTemplate> list(@RequestParam(required = false, defaultValue = "true") boolean activeOnly,
                                      HttpServletRequest request) {
        String tenantId = getTenantId(request);
        return activeOnly
                ? repository.findByTenantIdAndIsActiveTrueOrderByCreatedAtDesc(tenantId)
                : repository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<CustomTemplate> get(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(t -> t.getTenantId().equals(getTenantId(request)))
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CustomTemplate create(@RequestBody Map<String, String> body, HttpServletRequest request) {
        CustomTemplate t = new CustomTemplate();
        t.setTenantId(getTenantId(request));
        t.setName(body.get("name"));
        t.setCategory(body.getOrDefault("category", "general"));
        t.setContent(body.get("content"));
        t.setCreatedBy(getUserId(request));
        return repository.save(t);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id,
                                     @RequestBody Map<String, Object> body,
                                     HttpServletRequest request) {
        return repository.findById(id)
                .filter(t -> t.getTenantId().equals(getTenantId(request)))
                .map(t -> {
                    if (body.containsKey("name")) t.setName((String) body.get("name"));
                    if (body.containsKey("category")) t.setCategory((String) body.get("category"));
                    if (body.containsKey("content")) t.setContent((String) body.get("content"));
                    if (body.containsKey("is_active")) t.setIsActive((Boolean) body.get("is_active"));
                    return ResponseEntity.ok(repository.save(t));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(t -> t.getTenantId().equals(getTenantId(request)))
                .map(t -> { repository.delete(t); return ResponseEntity.noContent().build(); })
                .orElse(ResponseEntity.notFound().build());
    }

    private String getTenantId(HttpServletRequest request) {
        String h = request.getHeader("X-Tenant-Id");
        return h != null ? h : "00000000-0000-0000-0000-000000000001";
    }

    private String getUserId(HttpServletRequest request) {
        String h = request.getHeader("X-User-Id");
        return h != null ? h : "dev-user-001";
    }
}
