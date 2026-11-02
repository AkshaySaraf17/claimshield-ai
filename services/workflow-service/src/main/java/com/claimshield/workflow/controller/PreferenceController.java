package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.UserPreference;
import com.claimshield.workflow.model.NotificationPreference;
import com.claimshield.workflow.repository.UserPreferenceRepository;
import com.claimshield.workflow.repository.NotificationPreferenceRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class PreferenceController {

    private final UserPreferenceRepository prefRepository;
    private final NotificationPreferenceRepository notifRepository;

    public PreferenceController(UserPreferenceRepository prefRepository,
                                 NotificationPreferenceRepository notifRepository) {
        this.prefRepository = prefRepository;
        this.notifRepository = notifRepository;
    }

    @GetMapping("/preferences")
    public Map<String, String> getPreferences(HttpServletRequest request) {
        List<UserPreference> prefs = prefRepository.findByTenantIdAndUserId(getTenantId(request), getUserId(request));
        Map<String, String> result = new LinkedHashMap<>();
        for (UserPreference p : prefs) result.put(p.getPrefKey(), p.getPrefValue());
        return result;
    }

    @PutMapping("/preferences/{key}")
    public Map<String, String> setPreference(@PathVariable String key,
                                              @RequestBody Map<String, String> body,
                                              HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        UserPreference pref = prefRepository.findByTenantIdAndUserIdAndPrefKey(tenantId, userId, key)
                .orElseGet(() -> {
                    UserPreference p = new UserPreference();
                    p.setTenantId(tenantId);
                    p.setUserId(userId);
                    p.setPrefKey(key);
                    return p;
                });
        pref.setPrefValue(body.get("value"));
        prefRepository.save(pref);
        return Map.of("key", key, "value", pref.getPrefValue());
    }

    // Frontend contract (ported from Python): a flat map of notif_* keys to "true"/"false", with defaults
    private static final List<String> NOTIFICATION_KEYS = List.of(
            "notif_deadline_warning", "notif_status_change", "notif_appeal_approved",
            "notif_escalation", "notif_assignment", "notif_payer_response");

    @GetMapping("/notifications/preferences")
    public Map<String, String> getNotificationPrefs(HttpServletRequest request) {
        Map<String, String> result = new LinkedHashMap<>();
        NOTIFICATION_KEYS.forEach(k -> result.put(k, "true"));
        notifRepository.findByTenantIdAndUserId(getTenantId(request), getUserId(request)).stream()
                .filter(p -> p.getEventType() != null && p.getEventType().startsWith("notif_"))
                .forEach(p -> result.put(p.getEventType(), String.valueOf(Boolean.TRUE.equals(p.getIsEnabled()))));
        return result;
    }

    @PutMapping("/notifications/preferences")
    @Transactional
    public Map<String, String> updateNotificationPrefs(@RequestBody Map<String, Object> body,
                                                       HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        Map<String, NotificationPreference> existing = new HashMap<>();
        notifRepository.findByTenantIdAndUserId(tenantId, userId).forEach(p -> existing.put(p.getEventType(), p));

        body.forEach((key, value) -> {
            if (!key.startsWith("notif_")) return;
            NotificationPreference np = existing.getOrDefault(key, new NotificationPreference());
            np.setTenantId(tenantId);
            np.setUserId(userId);
            np.setEventType(key);
            if (np.getChannel() == null) np.setChannel("in_app");
            np.setIsEnabled("true".equalsIgnoreCase(String.valueOf(value)));
            notifRepository.save(np);
        });
        return getNotificationPrefs(request);
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
