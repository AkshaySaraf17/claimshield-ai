package com.claimshield.workflow.model;

import com.claimshield.workflow.controller.WorkflowReferenceController;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "routing_rules")
public class RoutingRule {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Generic single condition (field/operator/value). Optional: a rule may use the specific conditions below instead
    @Column(name = "match_field", length = 50)
    private String matchField;

    @Column(name = "match_operator", length = 20)
    private String matchOperator;

    @Column(name = "match_value")
    private String matchValue;

    // Specific conditions (frontend/Python contract). Every non-null condition must match (AND)
    @Column(name = "match_payer")
    private String matchPayer;

    @Column(name = "match_denial_code", length = 20)
    private String matchDenialCode;

    @Column(name = "min_amount_cents")
    private Long minAmountCents;

    @Column(name = "max_amount_cents")
    private Long maxAmountCents;

    @Column(name = "assign_to", nullable = false, length = 36)
    private String assignTo;

    @Column(nullable = false)
    private Integer priority = 0;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "created_by", length = 36)
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
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getMatchField() { return matchField; }
    public void setMatchField(String matchField) { this.matchField = matchField; }
    public String getMatchOperator() { return matchOperator; }
    public void setMatchOperator(String matchOperator) { this.matchOperator = matchOperator; }
    public String getMatchValue() { return matchValue; }
    public void setMatchValue(String matchValue) { this.matchValue = matchValue; }
    public String getMatchPayer() { return matchPayer; }
    public void setMatchPayer(String matchPayer) { this.matchPayer = matchPayer; }
    public String getMatchDenialCode() { return matchDenialCode; }
    public void setMatchDenialCode(String matchDenialCode) { this.matchDenialCode = matchDenialCode; }
    public Long getMinAmountCents() { return minAmountCents; }
    public void setMinAmountCents(Long minAmountCents) { this.minAmountCents = minAmountCents; }
    public Long getMaxAmountCents() { return maxAmountCents; }
    public void setMaxAmountCents(Long maxAmountCents) { this.maxAmountCents = maxAmountCents; }

    public String getAssignToName() { return WorkflowReferenceController.teamMemberName(assignTo); }

    public String getAssignTo() { return assignTo; }
    public void setAssignTo(String assignTo) { this.assignTo = assignTo; }
    public Integer getPriority() { return priority; }
    public void setPriority(Integer priority) { this.priority = priority; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
