package com.claimshield.analytics.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "payer_responses")
public class PayerResponse {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

    @Column(name = "claim_id", nullable = false, length = 36)
    private String claimId;

    @Column(name = "appeal_id", length = 36)
    private String appealId;

    @Column(name = "response_type", nullable = false, length = 50)
    private String responseType;

    @Column(name = "response_text", columnDefinition = "TEXT")
    private String responseText;

    @Column(name = "amount_approved_cents")
    private Long amountApprovedCents;

    @Column(name = "received_at")
    private LocalDateTime receivedAt;

    @Column(name = "recorded_by", nullable = false)
    private String recordedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) id = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (receivedAt == null) receivedAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getClaimId() { return claimId; }
    public void setClaimId(String claimId) { this.claimId = claimId; }
    public String getAppealId() { return appealId; }
    public void setAppealId(String appealId) { this.appealId = appealId; }
    public String getResponseType() { return responseType; }
    public void setResponseType(String responseType) { this.responseType = responseType; }
    public String getResponseText() { return responseText; }
    public void setResponseText(String responseText) { this.responseText = responseText; }
    public Long getAmountApprovedCents() { return amountApprovedCents; }
    public void setAmountApprovedCents(Long amountApprovedCents) { this.amountApprovedCents = amountApprovedCents; }
    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime receivedAt) { this.receivedAt = receivedAt; }
    public String getRecordedBy() { return recordedBy; }
    public void setRecordedBy(String recordedBy) { this.recordedBy = recordedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
