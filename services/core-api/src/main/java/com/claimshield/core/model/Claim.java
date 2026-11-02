package com.claimshield.core.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "claims")
public class Claim {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

    @Column(name = "claim_number", length = 50)
    private String claimNumber;

    @Column(name = "patient_name")
    private String patientName;

    @Column(name = "patient_id", length = 50)
    private String patientId;

    @Column(nullable = false)
    private String payer;

    @Column(name = "denial_code", length = 20)
    private String denialCode;

    @Column(name = "denial_reason")
    private String denialReason;

    @Column(name = "amount_denied_cents")
    private Long amountDeniedCents;

    @Column(name = "amount_recovered_cents")
    private Long amountRecoveredCents;

    @Column(name = "amount_approved_cents")
    private Long amountApprovedCents;

    @Column(name = "raw_denial_text", columnDefinition = "TEXT")
    private String rawDenialText;

    @Column(name = "raw_clinical_notes", columnDefinition = "TEXT")
    private String rawClinicalNotes;

    @Column(nullable = false, length = 30)
    private String status = "pending_review";

    @Column(name = "reviewed_by")
    private String reviewedBy;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "date_of_service")
    private LocalDateTime dateOfService;

    @Column(name = "filing_deadline")
    private LocalDateTime filingDeadline;

    @Column(name = "assigned_to", length = 36)
    private String assignedTo;

    @Column(name = "clinic_id", length = 36)
    private String clinicId;

    @Column(name = "clinic_name")
    private String clinicName;

    @Column(length = 20)
    private String npi;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) id = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Getters and setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getClaimNumber() { return claimNumber; }
    public void setClaimNumber(String claimNumber) { this.claimNumber = claimNumber; }

    public String getPatientName() { return patientName; }
    public void setPatientName(String patientName) { this.patientName = patientName; }

    public String getPatientId() { return patientId; }
    public void setPatientId(String patientId) { this.patientId = patientId; }

    public String getPayer() { return payer; }
    public void setPayer(String payer) { this.payer = payer; }

    public String getDenialCode() { return denialCode; }
    public void setDenialCode(String denialCode) { this.denialCode = denialCode; }

    public String getDenialReason() { return denialReason; }
    public void setDenialReason(String denialReason) { this.denialReason = denialReason; }

    public Long getAmountDeniedCents() { return amountDeniedCents; }
    public void setAmountDeniedCents(Long amountDeniedCents) { this.amountDeniedCents = amountDeniedCents; }

    public Long getAmountRecoveredCents() { return amountRecoveredCents; }
    public void setAmountRecoveredCents(Long amountRecoveredCents) { this.amountRecoveredCents = amountRecoveredCents; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getDateOfService() { return dateOfService; }
    public void setDateOfService(LocalDateTime dateOfService) { this.dateOfService = dateOfService; }

    public LocalDateTime getFilingDeadline() { return filingDeadline; }
    public void setFilingDeadline(LocalDateTime filingDeadline) { this.filingDeadline = filingDeadline; }

    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String assignedTo) { this.assignedTo = assignedTo; }

    public String getClinicId() { return clinicId; }
    public void setClinicId(String clinicId) { this.clinicId = clinicId; }

    public String getClinicName() { return clinicName; }
    public void setClinicName(String clinicName) { this.clinicName = clinicName; }

    public String getNpi() { return npi; }
    public void setNpi(String npi) { this.npi = npi; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public Long getAmountApprovedCents() { return amountApprovedCents; }
    public void setAmountApprovedCents(Long amountApprovedCents) { this.amountApprovedCents = amountApprovedCents; }

    public String getRawDenialText() { return rawDenialText; }
    public void setRawDenialText(String rawDenialText) { this.rawDenialText = rawDenialText; }

    public String getRawClinicalNotes() { return rawClinicalNotes; }
    public void setRawClinicalNotes(String rawClinicalNotes) { this.rawClinicalNotes = rawClinicalNotes; }

    public String getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(String reviewedBy) { this.reviewedBy = reviewedBy; }

    public LocalDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(LocalDateTime reviewedAt) { this.reviewedAt = reviewedAt; }
}
