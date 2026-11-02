package com.claimshield.workflow.config;

import com.claimshield.workflow.model.*;
import com.claimshield.workflow.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class DataSeeder implements CommandLineRunner {

    private final RoutingRuleRepository routingRuleRepo;
    private final CustomTemplateRepository templateRepo;
    private final PayerContactRepository contactRepo;
    private final UserPreferenceRepository prefRepo;
    private final DashboardBookmarkRepository bookmarkRepo;

    public DataSeeder(RoutingRuleRepository routingRuleRepo,
                      CustomTemplateRepository templateRepo,
                      PayerContactRepository contactRepo,
                      UserPreferenceRepository prefRepo,
                      DashboardBookmarkRepository bookmarkRepo) {
        this.routingRuleRepo = routingRuleRepo;
        this.templateRepo = templateRepo;
        this.contactRepo = contactRepo;
        this.prefRepo = prefRepo;
        this.bookmarkRepo = bookmarkRepo;
    }

    @Override
    public void run(String... args) {
        String tenantId = "00000000-0000-0000-0000-000000000001";

        if (routingRuleRepo.count() == 0) {
            seedRoutingRules(tenantId);
            seedTemplates(tenantId);
            seedContacts(tenantId);
            seedPreferences(tenantId);
            seedBookmarks(tenantId);
        }
    }

    private void seedRoutingRules(String tenantId) {
        String[][] rules = {
                {"Aetna to Sarah", "payer", "equals", "Aetna", "dev-user-002", "100"},
                {"UHC to Mike", "payer", "equals", "UnitedHealthcare", "dev-user-003", "90"},
                {"High Value to Manager", "amount_denied_cents", "greater_than", "1000000", "dev-user-004", "200"},
                {"BCBS to Demo Biller", "payer", "contains", "Blue Cross", "dev-user-001", "50"}
        };
        for (String[] r : rules) {
            RoutingRule rule = new RoutingRule();
            rule.setTenantId(tenantId);
            rule.setName(r[0]);
            rule.setMatchField(r[1]);
            rule.setMatchOperator(r[2]);
            rule.setMatchValue(r[3]);
            rule.setAssignTo(r[4]);
            rule.setPriority(Integer.parseInt(r[5]));
            rule.setCreatedBy("dev-user-004");
            routingRuleRepo.save(rule);
        }
    }

    private void seedTemplates(String tenantId) {
        CustomTemplate t1 = new CustomTemplate();
        t1.setTenantId(tenantId);
        t1.setName("Standard Appeal Letter");
        t1.setCategory("appeal");
        t1.setSections(List.of("patient_info", "denial_summary", "clinical_justification", "closing"));
        t1.setSource("CMS Medicare Claims Processing Manual Ch. 29 (Appeals)");
        t1.setContent("Dear [Payer],\n\nWe are writing to appeal the denial of claim [ClaimNumber] for patient [PatientName].\n\n[Details]\n\nSincerely,\n[ProviderName]");
        t1.setCreatedBy("dev-user-001");
        templateRepo.save(t1);

        CustomTemplate t2 = new CustomTemplate();
        t2.setTenantId(tenantId);
        t2.setName("Urgent Timely Filing Appeal");
        t2.setCategory("timely_filing");
        t2.setSections(List.of("patient_info", "denial_summary", "proof_of_timely_filing", "closing"));
        t2.setSource("42 CFR 424.44 (time limits for filing claims)");
        t2.setContent("URGENT: This appeal is time-sensitive.\n\nDear [Payer],\n\nThe denial for claim [ClaimNumber] citing timely filing is incorrect. Original submission date: [SubmissionDate].\n\nAttached: proof of timely submission.\n\nSincerely,\n[ProviderName]");
        t2.setCreatedBy("dev-user-001");
        templateRepo.save(t2);
    }

    private void seedContacts(String tenantId) {
        String[][] contacts = {
                {"Aetna", "Claims Department", "1-800-872-3862", "appeals@aetna.example.com", "Appeals Unit"},
                {"UnitedHealthcare", "Provider Services", "1-877-842-3210", "provider@uhc.example.com", "Claims Review"},
                {"Blue Cross Blue Shield", "Appeals Coordinator", "1-800-262-2583", "appeals@bcbs.example.com", "Appeals"}
        };
        for (String[] c : contacts) {
            PayerContact pc = new PayerContact();
            pc.setTenantId(tenantId);
            pc.setPayerName(c[0]);
            pc.setContactName(c[1]);
            pc.setPhone(c[2]);
            pc.setEmail(c[3]);
            pc.setDepartment(c[4]);
            pc.setCreatedBy("dev-user-001");
            contactRepo.save(pc);
        }
    }

    private void seedPreferences(String tenantId) {
        String[][] prefs = {
                {"dev-user-001", "theme", "light"},
                {"dev-user-001", "claims_per_page", "25"},
                {"dev-user-001", "default_view", "list"},
                {"dev-user-001", "auto_refresh", "true"}
        };
        for (String[] p : prefs) {
            UserPreference pref = new UserPreference();
            pref.setTenantId(tenantId);
            pref.setUserId(p[0]);
            pref.setPrefKey(p[1]);
            pref.setPrefValue(p[2]);
            prefRepo.save(pref);
        }
    }

    private void seedBookmarks(String tenantId) {
        String[][] bms = {
                {"dev-user-001", "Dashboard", "/dashboard", "home", "0"},
                {"dev-user-001", "Workqueue", "/dashboard/claims/workqueue", "list", "1"},
                {"dev-user-001", "Analytics", "/dashboard/analytics", "chart", "2"}
        };
        for (String[] b : bms) {
            DashboardBookmark bm = new DashboardBookmark();
            bm.setTenantId(tenantId);
            bm.setUserId(b[0]);
            bm.setLabel(b[1]);
            bm.setPath(b[2]);
            bm.setIcon(b[3]);
            bm.setSortOrder(Integer.parseInt(b[4]));
            bookmarkRepo.save(bm);
        }
    }
}
