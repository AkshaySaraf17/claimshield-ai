"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

const NAV_ITEMS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/workbench", label: "Workbench" },
  { href: "/dashboard/claims", label: "Claims" },
  { href: "/dashboard/appeals", label: "Appeals" },
  { href: "/dashboard/review", label: "Review" },
  { href: "/dashboard/deadlines", label: "Deadlines" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/patterns", label: "Patterns" },
  { href: "/dashboard/denial-codes", label: "Codes" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/batch-appeals", label: "Batch" },
  { href: "/dashboard/import", label: "Import" },
  { href: "/dashboard/pipeline", label: "Pipeline" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/search", label: "Search" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/assignments", label: "Assign" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/duplicates", label: "Dupes" },
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/workqueue", label: "Queue" },
  { href: "/dashboard/payers", label: "Payers" },
  { href: "/dashboard/calendar", label: "Calendar" },
  { href: "/dashboard/merge", label: "Merge" },
  { href: "/dashboard/batch-actions", label: "Bulk Ops" },
  { href: "/dashboard/compare", label: "Compare" },
  { href: "/dashboard/financials", label: "Finance" },
  { href: "/dashboard/aging", label: "Aging" },
  { href: "/dashboard/sla", label: "SLA" },
  { href: "/dashboard/heatmap", label: "Heatmap" },
  { href: "/dashboard/escalations", label: "Escalate" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/clinics", label: "Clinics" },
  { href: "/dashboard/scorecard", label: "KPIs" },
  { href: "/dashboard/notifications", label: "Notifs" },
  { href: "/dashboard/trends", label: "Trends" },
  { href: "/dashboard/effectiveness", label: "Effective" },
  { href: "/dashboard/routing", label: "Routing" },
  { href: "/dashboard/watchlist", label: "Watchlist" },
  { href: "/dashboard/contacts", label: "Contacts" },
  { href: "/dashboard/costs", label: "Costs" },
  { href: "/dashboard/prevention", label: "Prevent" },
  { href: "/dashboard/my-activity", label: "My Log" },
  { href: "/dashboard/roles", label: "Roles" },
  { href: "/dashboard/exports", label: "Exports" },
  { href: "/dashboard/health", label: "Health" },
  { href: "/dashboard/priority", label: "Priority" },
  { href: "/dashboard/bookmarks", label: "Bookmarks" },
  { href: "/dashboard/payer-sla", label: "Payer SLA" },
  { href: "/dashboard/timeline", label: "Timeline" },
  { href: "/dashboard/tag-manager", label: "Tags" },
  { href: "/dashboard/workload", label: "Workload" },
  { href: "/dashboard/payer-intel", label: "Intel" },
  { href: "/dashboard/appeal-compare", label: "Compare" },
  { href: "/dashboard/status-overview", label: "Status" },
  { href: "/dashboard/recovery", label: "Recovery" },
  { href: "/dashboard/claim-audit", label: "Audit" },
  { href: "/dashboard/team-perf", label: "Perf" },
  { href: "/dashboard/code-lookup", label: "Lookup" },
  { href: "/dashboard/quick-stats", label: "Stats" },
  { href: "/dashboard/attachments", label: "Files" },
  { href: "/dashboard/notes", label: "Notes" },
  { href: "/dashboard/response-tracker", label: "Responses" },
  { href: "/dashboard/snapshot", label: "Snapshot" },
  { href: "/dashboard/comments", label: "Comments" },
  { href: "/dashboard/letter-history", label: "Letters" },
  { href: "/dashboard/predictor", label: "Predict" },
  { href: "/dashboard/status-history", label: "History" },
  { href: "/dashboard/claim-links", label: "Links" },
  { href: "/dashboard/cost-manager", label: "Costs+" },
  { href: "/dashboard/audit", label: "Audit Log" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, login, logout, devLogin } = useAuth();

  return (
    <div className="min-h-screen bg-parchment/20">
      {/* Top nav */}
      <nav className="border-b border-ink-300/30 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg font-semibold text-ink-950">
              ClaimShield
            </span>
            <div className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-ink-950 text-white"
                        : "text-ink-600 hover:bg-ink-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-ink-500">{user.name || user.email}</span>
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                  {user.roles?.[0] || "user"}
                </span>
                <button
                  onClick={logout}
                  className="text-ink-400 hover:text-ink-600"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={login}
                  className="rounded bg-ink-950 px-3 py-1 text-white hover:bg-ink-900"
                >
                  Sign in
                </button>
                <button
                  onClick={() => devLogin(
                    "00000000-0000-0000-0000-000000000001",
                    "demo-biller",
                    ["biller"]
                  )}
                  className="text-ink-400 hover:text-ink-600"
                >
                  Dev login
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {children}
    </div>
  );
}
