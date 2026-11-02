package com.claimshield.core.controller;

import com.claimshield.core.model.Tenant;
import com.claimshield.core.repository.TenantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/tenants")
public class TenantController {

    private final TenantRepository tenantRepository;

    public TenantController(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    @GetMapping
    public List<Tenant> listTenants() {
        return tenantRepository.findByIsActiveTrue();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Tenant> getTenant(@PathVariable String id) {
        return tenantRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Tenant createTenant(@RequestBody Tenant tenant) {
        return tenantRepository.save(tenant);
    }
}
