package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.DashboardBookmark;
import com.claimshield.workflow.repository.DashboardBookmarkRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/bookmarks")
public class BookmarkController {

    private final DashboardBookmarkRepository repository;

    public BookmarkController(DashboardBookmarkRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<DashboardBookmark> list(HttpServletRequest request) {
        return repository.findByTenantIdAndUserIdOrderBySortOrderAsc(getTenantId(request), getUserId(request));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DashboardBookmark create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        DashboardBookmark b = new DashboardBookmark();
        b.setTenantId(getTenantId(request));
        b.setUserId(getUserId(request));
        b.setLabel((String) body.get("label"));
        b.setPath((String) body.get("path"));
        b.setIcon((String) body.get("icon"));
        if (body.containsKey("sort_order")) b.setSortOrder(((Number) body.get("sort_order")).intValue());
        return repository.save(b);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(b -> b.getTenantId().equals(getTenantId(request)))
                .map(b -> { repository.delete(b); return ResponseEntity.noContent().build(); })
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
