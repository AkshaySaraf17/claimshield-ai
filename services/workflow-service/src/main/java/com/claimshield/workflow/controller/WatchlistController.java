package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.ClaimWatchlist;
import com.claimshield.workflow.repository.ClaimWatchlistRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/watchlist")
public class WatchlistController {

    private final ClaimWatchlistRepository repository;

    public WatchlistController(ClaimWatchlistRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<ClaimWatchlist> list(HttpServletRequest request) {
        return repository.findByTenantIdAndUserIdOrderByCreatedAtDesc(getTenantId(request), getUserId(request));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimWatchlist add(@RequestBody Map<String, String> body, HttpServletRequest request) {
        ClaimWatchlist w = new ClaimWatchlist();
        w.setTenantId(getTenantId(request));
        w.setUserId(getUserId(request));
        w.setClaimId(body.get("claim_id"));
        w.setReason(body.get("reason"));
        return repository.save(w);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> remove(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(w -> w.getTenantId().equals(getTenantId(request)))
                .map(w -> { repository.delete(w); return ResponseEntity.noContent().build(); })
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
