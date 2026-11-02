package com.claimshield.core.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "claim_links")
public class ClaimLink {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

    @Column(name = "claim_id_a", nullable = false, length = 36)
    private String claimIdA;

    @Column(name = "claim_id_b", nullable = false, length = 36)
    private String claimIdB;

    @Column(name = "link_type", nullable = false, length = 50)
    private String linkType;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) id = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getClaimIdA() { return claimIdA; }
    public void setClaimIdA(String claimIdA) { this.claimIdA = claimIdA; }
    public String getClaimIdB() { return claimIdB; }
    public void setClaimIdB(String claimIdB) { this.claimIdB = claimIdB; }
    public String getLinkType() { return linkType; }
    public void setLinkType(String linkType) { this.linkType = linkType; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
