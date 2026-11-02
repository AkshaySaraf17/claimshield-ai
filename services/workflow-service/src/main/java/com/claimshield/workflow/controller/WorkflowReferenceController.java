package com.claimshield.workflow.controller;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class WorkflowReferenceController {

    private static final List<Map<String, String>> TEAM_MEMBERS = List.of(
            Map.of("id", "dev-user-001", "name", "Demo Biller", "role", "biller"),
            Map.of("id", "dev-user-002", "name", "Sarah Johnson", "role", "biller"),
            Map.of("id", "dev-user-003", "name", "Mike Chen", "role", "reviewer"),
            Map.of("id", "dev-user-004", "name", "Lisa Park", "role", "manager")
    );

    public static String teamMemberName(String userId) {
        if (userId == null) return null;
        return TEAM_MEMBERS.stream()
                .filter(m -> userId.equals(m.get("id")))
                .map(m -> m.get("name"))
                .findFirst()
                .orElse(userId);
    }

    private static final List<Map<String, Object>> ROLES = List.of(
            Map.of("id", "biller", "name", "Biller", "permissions", List.of("claims.read", "claims.create", "claims.update", "appeals.create")),
            Map.of("id", "reviewer", "name", "Reviewer", "permissions", List.of("claims.read", "claims.update", "appeals.create", "appeals.approve")),
            Map.of("id", "manager", "name", "Manager", "permissions", List.of("claims.read", "claims.create", "claims.update", "claims.delete", "appeals.create", "appeals.approve", "appeals.send", "settings.manage"))
    );

    @GetMapping("/team-members")
    public List<Map<String, String>> listTeamMembers() {
        return TEAM_MEMBERS;
    }

    @GetMapping("/roles")
    public List<Map<String, Object>> listRoles() {
        return ROLES;
    }

    @GetMapping("/alerts")
    public Map<String, Object> getAlerts() {
        return Map.of(
                "alerts", List.of(
                        Map.of("id", "alert-1", "type", "deadline_approaching", "message", "3 claims have filing deadlines within 7 days", "severity", "high", "count", 3),
                        Map.of("id", "alert-2", "type", "unassigned_claims", "message", "5 claims are unassigned", "severity", "medium", "count", 5),
                        Map.of("id", "alert-3", "type", "pending_approvals", "message", "2 appeals awaiting approval", "severity", "low", "count", 2)
                ),
                "total", 3
        );
    }

    @GetMapping("/system/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "workflow-service", "mode", "h2-file");
    }
}
