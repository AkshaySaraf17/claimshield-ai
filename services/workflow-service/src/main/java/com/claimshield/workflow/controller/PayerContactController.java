package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.PayerContact;
import com.claimshield.workflow.repository.PayerContactRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payer-contacts")
public class PayerContactController {

    private final PayerContactRepository repository;

    public PayerContactController(PayerContactRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<PayerContact> list(@RequestParam(required = false) String payer, HttpServletRequest request) {
        String tenantId = getTenantId(request);
        if (payer != null) return repository.findByTenantIdAndPayerNameOrderByContactNameAsc(tenantId, payer);
        return repository.findByTenantIdOrderByPayerNameAsc(tenantId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PayerContact create(@RequestBody Map<String, String> body, HttpServletRequest request) {
        PayerContact c = new PayerContact();
        c.setTenantId(getTenantId(request));
        c.setPayerName(body.get("payer_name"));
        c.setContactName(body.get("contact_name"));
        c.setPhone(body.get("phone"));
        c.setEmail(body.get("email"));
        c.setFaxNumber(body.get("fax_number"));
        c.setDepartment(body.get("department"));
        c.setNotes(body.get("notes"));
        c.setCreatedBy(getUserId(request));
        return repository.save(c);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpServletRequest request) {
        return repository.findById(id)
                .filter(c -> c.getTenantId().equals(getTenantId(request)))
                .map(c -> { repository.delete(c); return ResponseEntity.noContent().build(); })
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
