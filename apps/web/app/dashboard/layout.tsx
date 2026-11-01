"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import {
  LayoutDashboard, FileText, Scale, Search, ClipboardList,
  BarChart3, DollarSign, Users, Building2, ShieldCheck,
  Settings, Bell, ChevronDown, ChevronRight, Menu, X,
  LogOut, BookOpen, Clock, AlertTriangle, TrendingUp,
  Layers, FolderOpen, Zap, Eye, Printer, Import,
} from "lucide-react";

interface NavSection {
  label: string;
  icon: React.ReactNode;
  items: { href: string; label: string }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    icon: <LayoutDashboard size={18} />,
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/workbench", label: "Workbench" },
      { href: "/dashboard/quick-stats", label: "Quick Stats" },
      { href: "/dashboard/health", label: "System Health" },
    ],
  },
  {
    label: "Claims",
    icon: <FileText size={18} />,
    items: [
      { href: "/dashboard/claims", label: "All Claims" },
      { href: "/dashboard/search", label: "Search" },
      { href: "/dashboard/pipeline", label: "Pipeline" },
      { href: "/dashboard/workqueue", label: "Work Queue" },
      { href: "/dashboard/priority", label: "Priority" },
      { href: "/dashboard/deadlines", label: "Deadlines" },
      { href: "/dashboard/status-overview", label: "Status Overview" },
      { href: "/dashboard/duplicates", label: "Duplicates" },
      { href: "/dashboard/merge", label: "Merge Claims" },
      { href: "/dashboard/claim-links", label: "Claim Links" },
      { href: "/dashboard/claim-compare", label: "Compare Claims" },
      { href: "/dashboard/snapshot", label: "Claim Snapshot" },
      { href: "/dashboard/notes", label: "Notes" },
      { href: "/dashboard/comments", label: "Comments" },
      { href: "/dashboard/attachments", label: "Attachments" },
      { href: "/dashboard/tag-manager", label: "Tag Manager" },
      { href: "/dashboard/timeline", label: "Timeline" },
      { href: "/dashboard/status-history", label: "Status History" },
    ],
  },
  {
    label: "Appeals",
    icon: <Scale size={18} />,
    items: [
      { href: "/dashboard/appeals", label: "All Appeals" },
      { href: "/dashboard/review", label: "Review Queue" },
      { href: "/dashboard/batch-appeals", label: "Batch Appeals" },
      { href: "/dashboard/batch-letters", label: "Batch Letters" },
      { href: "/dashboard/letter-history", label: "Letter History" },
      { href: "/dashboard/appeal-preview", label: "Appeal Preview" },
      { href: "/dashboard/appeal-compare", label: "Compare Appeals" },
      { href: "/dashboard/templates", label: "Templates" },
      { href: "/dashboard/predictor", label: "Outcome Predictor" },
    ],
  },
  {
    label: "Analytics",
    icon: <BarChart3 size={18} />,
    items: [
      { href: "/dashboard/analytics", label: "Overview" },
      { href: "/dashboard/patterns", label: "Patterns" },
      { href: "/dashboard/trends", label: "Trends" },
      { href: "/dashboard/effectiveness", label: "Effectiveness" },
      { href: "/dashboard/appeal-effect", label: "Appeal Impact" },
      { href: "/dashboard/heatmap", label: "Heatmap" },
      { href: "/dashboard/scorecard", label: "KPI Scorecard" },
      { href: "/dashboard/pipeline-analytics", label: "Pipeline Analytics" },
      { href: "/dashboard/code-analytics", label: "Code Analytics" },
      { href: "/dashboard/denial-codes", label: "Denial Codes" },
      { href: "/dashboard/code-lookup", label: "Code Lookup" },
      { href: "/dashboard/prevention", label: "Prevention" },
      { href: "/dashboard/prevention-tips", label: "Prevention Tips" },
    ],
  },
  {
    label: "Financial",
    icon: <DollarSign size={18} />,
    items: [
      { href: "/dashboard/financials", label: "Financial Overview" },
      { href: "/dashboard/costs", label: "Costs" },
      { href: "/dashboard/cost-manager", label: "Cost Manager" },
      { href: "/dashboard/cost-summary", label: "Cost Summary" },
      { href: "/dashboard/aging", label: "Aging Report" },
      { href: "/dashboard/recovery", label: "Recovery" },
    ],
  },
  {
    label: "Payers",
    icon: <Building2 size={18} />,
    items: [
      { href: "/dashboard/payers", label: "Payer Directory" },
      { href: "/dashboard/payer-perf", label: "Payer Performance" },
      { href: "/dashboard/payer-sla", label: "Payer SLA" },
      { href: "/dashboard/payer-intel", label: "Payer Intel" },
      { href: "/dashboard/contacts", label: "Contacts" },
      { href: "/dashboard/response-tracker", label: "Response Tracker" },
    ],
  },
  {
    label: "Team",
    icon: <Users size={18} />,
    items: [
      { href: "/dashboard/team", label: "Team Members" },
      { href: "/dashboard/assignments", label: "Assignments" },
      { href: "/dashboard/workload", label: "Workload" },
      { href: "/dashboard/team-perf", label: "Performance" },
      { href: "/dashboard/roles", label: "Roles" },
      { href: "/dashboard/routing", label: "Routing Rules" },
      { href: "/dashboard/auto-router", label: "Auto Router" },
      { href: "/dashboard/escalations", label: "Escalations" },
    ],
  },
  {
    label: "Clinics",
    icon: <Building2 size={18} />,
    items: [
      { href: "/dashboard/clinics", label: "Clinic Directory" },
      { href: "/dashboard/clinic-analytics", label: "Clinic Analytics" },
    ],
  },
  {
    label: "Reports & Export",
    icon: <Printer size={18} />,
    items: [
      { href: "/dashboard/reports", label: "Reports" },
      { href: "/dashboard/report-text", label: "Summary Report" },
      { href: "/dashboard/exports", label: "Exports" },
      { href: "/dashboard/csv-export", label: "CSV Export" },
    ],
  },
  {
    label: "Bulk Operations",
    icon: <Layers size={18} />,
    items: [
      { href: "/dashboard/batch-actions", label: "Batch Actions" },
      { href: "/dashboard/batch-status", label: "Batch Status" },
      { href: "/dashboard/import", label: "Import" },
      { href: "/dashboard/bulk-import", label: "Bulk Import" },
    ],
  },
  {
    label: "Activity & Audit",
    icon: <ShieldCheck size={18} />,
    items: [
      { href: "/dashboard/activity", label: "Activity Feed" },
      { href: "/dashboard/my-activity", label: "My Activity" },
      { href: "/dashboard/audit", label: "Audit Log" },
      { href: "/dashboard/claim-audit", label: "Claim Audit" },
      { href: "/dashboard/watchlist", label: "Watchlist" },
      { href: "/dashboard/bookmarks", label: "Bookmarks" },
    ],
  },
  {
    label: "Notifications",
    icon: <Bell size={18} />,
    items: [
      { href: "/dashboard/notifications", label: "Notifications" },
      { href: "/dashboard/alerts", label: "Alerts" },
      { href: "/dashboard/notif-prefs", label: "Notification Prefs" },
      { href: "/dashboard/calendar", label: "Calendar" },
      { href: "/dashboard/sla", label: "SLA Tracking" },
    ],
  },
  {
    label: "Settings",
    icon: <Settings size={18} />,
    items: [
      { href: "/dashboard/settings", label: "General Settings" },
      { href: "/dashboard/user-prefs", label: "Preferences" },
      { href: "/dashboard/rules", label: "Business Rules" },
      { href: "/dashboard/compare", label: "Config Compare" },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const active = NAV_SECTIONS.find((s) =>
      s.items.some((i) => (i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href)))
    );
    return new Set(active ? [active.label] : ["Overview"]);
  });

  function toggleSection(label: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const userRole = (session?.user as { role?: string } | undefined)?.role || "user";

  return (
    <div className="flex min-h-screen bg-parchment/30">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-ink-300/20 bg-white transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-0 -translate-x-full lg:w-16 lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-ink-300/20 px-4">
          {sidebarOpen && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-950 text-white">
                <ShieldCheck size={18} />
              </div>
              <span className="font-display text-lg font-semibold text-ink-950">ClaimShield</span>
            </Link>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded p-1 text-ink-500 hover:bg-ink-300/20">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {NAV_SECTIONS.map((section) => {
            const isExpanded = expandedSections.has(section.label);
            const hasActive = section.items.some((i) =>
              i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href)
            );

            return (
              <div key={section.label} className="mb-1">
                <button
                  onClick={() => toggleSection(section.label)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    hasActive
                      ? "bg-ink-950/5 text-ink-950"
                      : "text-ink-500 hover:bg-ink-300/10 hover:text-ink-700"
                  }`}
                >
                  <span className="shrink-0">{section.icon}</span>
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 text-left">{section.label}</span>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </>
                  )}
                </button>

                {sidebarOpen && isExpanded && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-ink-300/20 pl-3">
                    {section.items.map((item) => {
                      const isActive =
                        item.href === "/dashboard"
                          ? pathname === "/dashboard"
                          : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                            isActive
                              ? "bg-ink-950 font-medium text-white"
                              : "text-ink-500 hover:bg-ink-300/10 hover:text-ink-700"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section at bottom */}
        {sidebarOpen && (
          <div className="border-t border-ink-300/20 p-3">
            {session?.user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {session.user.image ? (
                    <img src={session.user.image} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-950 text-xs font-bold text-white">
                      {(session.user.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{session.user.name}</p>
                    <p className="truncate text-xs text-ink-500">{session.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-ledger-50 px-2 py-0.5 text-xs font-medium text-ledger-700">
                    {userRole}
                  </span>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 hover:bg-ink-300/10 hover:text-ink-700"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="block w-full rounded-lg bg-ink-950 px-4 py-2 text-center text-sm font-medium text-white hover:bg-ink-900"
              >
                Sign In
              </Link>
            )}
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className={`flex-1 transition-all duration-200 ${sidebarOpen ? "ml-64" : "ml-0 lg:ml-16"}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-ink-300/20 bg-white/80 px-6 backdrop-blur">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="mr-4 rounded p-1 text-ink-500 hover:bg-ink-300/20 lg:hidden">
              <Menu size={20} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-950">
              {NAV_SECTIONS.flatMap((s) => s.items)
                .find((i) => (i.href === "/dashboard" ? pathname === "/dashboard" : pathname === i.href))?.label || "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/notifications" className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-300/10">
              <Bell size={18} />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-denial-500" />
            </Link>
            <Link href="/dashboard/search" className="rounded-lg p-2 text-ink-500 hover:bg-ink-300/10">
              <Search size={18} />
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
