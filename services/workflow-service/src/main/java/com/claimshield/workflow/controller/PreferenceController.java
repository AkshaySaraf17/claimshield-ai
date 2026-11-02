package com.claimshield.workflow.controller;

import com.claimshield.workflow.model.UserPreference;
import com.claimshield.workflow.model.NotificationPreference;
import com.claimshield.workflow.repository.UserPreferenceRepository;
import com.claimshield.workflow.repository.NotificationPreferenceRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    @GetMapping("/notifications/preferences")
    public List<NotificationPreference> getNotificationPrefs(HttpServletRequest request) {
        return notifRepository.findByTenantIdAndUserId(getTenantId(request), getUserId(request));
    }

    @PutMapping("/notifications/preferences")
    public ResponseEntity<?> updateNotificationPrefs(@RequestBody Map<String, Object> body,
                                                      HttpServletRequest request) {
        String tenantId = getTenantId(request);
        String userId = getUserId(request);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("preferences");
        if (items == null) return ResponseEntity.badRequest().body(Map.of("error", "missing preferences array"));

        List<NotificationPreference> existing = notifRepository.findByTenantIdAndUserId(tenantId, userId);
        notifRepository.deleteAll(existing);

        for (Map<String, Object> item : items) {
            NotificationPreference np = new NotificationPreference();
            np.setTenantId(tenantId);
            np.setUserId(userId);
            np.setEventType((String) item.get("event_type"));
            np.setChannel((String) item.getOrDefault("channel", "in_app"));
            np.setIsEnabled(item.containsKey("is_enabled") ? (Boolean) item.get("is_enabled") : true);
            notifRepository.save(np);
        }

        return ResponseEntity.ok(notifRepository.findByTenantIdAndUserId(tenantId, userId));
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
