package com.claimshield.core.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "appeals")
public class Appeal {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

    @Column(name = "claim_id", nullable = false, length = 36)
    private String claimId;

    @Column(nullable = false, length = 30)
    private String status = "draft";

    @JsonAlias("letter_text")
    @Column(name = "letter_body", columnDefinition = "TEXT")
    private String letterBody;

    @Column(name = "letter_format", length = 20)
    private String letterFormat = "text";

    @Column(name = "approved_by", length = 36)
    private String approvedBy;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "sent_via", length = 30)
    private String sentVia;

    @Column(name = "tracking_number")
    private String trackingNumber;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(columnDefinition = "TEXT")
    private String source;

    @Column(name = "version")
    private Integer version = 1;

    @Column(name = "confidence")
    private Double confidence;

    @Column(name = "policy_evidence", columnDefinition = "TEXT")
    private String policyEvidence;

    @Column(name = "template_used", length = 100)
    private String templateUsed;

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

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getClaimId() { return claimId; }
    public void setClaimId(String claimId) { this.claimId = claimId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getLetterBody() { return letterBody; }
    public void setLetterBody(String letterBody) { this.letterBody = letterBody; }

    // Frontend contract: letter_text mirrors letter_body; needs_review is true until a human approves
    public String getLetterText() { return letterBody; }

    public boolean getNeedsReview() { return status == null || "draft".equals(status); }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Double getConfidence() { return confidence; }
    public void setConfidence(Double confidence) { this.confidence = confidence; }

    public String getPolicyEvidence() { return policyEvidence; }
    public void setPolicyEvidence(String policyEvidence) { this.policyEvidence = policyEvidence; }

    public String getTemplateUsed() { return templateUsed; }
    public void setTemplateUsed(String templateUsed) { this.templateUsed = templateUsed; }

    public String getLetterFormat() { return letterFormat; }
    public void setLetterFormat(String letterFormat) { this.letterFormat = letterFormat; }

    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }

    public LocalDateTime getApprovedAt() { return approvedAt; }
    public void setApprovedAt(LocalDateTime approvedAt) { this.approvedAt = approvedAt; }

    public LocalDateTime getSentAt() { return sentAt; }
    public void setSentAt(LocalDateTime sentAt) { this.sentAt = sentAt; }

    public String getSentVia() { return sentVia; }
    public void setSentVia(String sentVia) { this.sentVia = sentVia; }

    public String getTrackingNumber() { return trackingNumber; }
    public void setTrackingNumber(String trackingNumber) { this.trackingNumber = trackingNumber; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
