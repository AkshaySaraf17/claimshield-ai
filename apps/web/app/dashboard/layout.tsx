"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

const NAV_ITEMS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/workbench", label: "Workbench" },
  { href: "/dashboard/claims", label: "Claims" },
  { href: "/dashboard/appeals", label: "Appeals" },
  { href: "/dashboard/deadlines", label: "Deadlines" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/denial-codes", label: "Codes" },
  { href: "/dashboard/import", label: "Import" },
  { href: "/dashboard/audit", label: "Audit Log" },
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
