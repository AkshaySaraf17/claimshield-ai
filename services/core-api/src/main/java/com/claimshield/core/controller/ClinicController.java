package com.claimshield.core.controller;

import com.claimshield.core.model.Clinic;
import com.claimshield.core.repository.ClinicRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/clinics")
public class ClinicController {

    private final ClinicRepository clinicRepository;

    public ClinicController(ClinicRepository clinicRepository) {
        this.clinicRepository = clinicRepository;
    }

    @GetMapping
    public List<Clinic> listClinics(HttpServletRequest request) {
        return clinicRepository.findByTenantIdOrderByNameAsc(getTenantId(request));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Clinic> getClinic(@PathVariable String id) {
        return clinicRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Clinic createClinic(@RequestBody Clinic clinic, HttpServletRequest request) {
        clinic.setTenantId(getTenantId(request));
        return clinicRepository.save(clinic);
    }

    private String getTenantId(HttpServletRequest request) {
        String header = request.getHeader("X-Tenant-Id");
        return header != null ? header : "00000000-0000-0000-0000-000000000001";
    }
}
