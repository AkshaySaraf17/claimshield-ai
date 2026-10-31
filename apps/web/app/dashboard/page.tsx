"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Stats {
  claims_total: number;
  claims_by_status: Record<string, number>;
  total_denied_cents: number;
  total_recovered_cents: number;
  win_rate: number | null;
  appeals_total: number;
  appeals_pending_review: number;
  by_payer: { payer: string; count: number; total_denied_cents: number }[];
  recent_activity: {
    id: number;
    action: string;
    resource_type: string;
    resource_id: string;
    actor_id: string;
    created_at: string;
  }[];
}

const ACTION_LABELS: Record<string, string> = {
  "claim.created": "Claim created",
  "claim.status_changed": "Status changed",
  "appeal.drafted": "Appeal drafted",
  "appeal.approved": "Appeal approved",
  "appeal.sent": "Appeal sent",
};

const ACTION_COLORS: Record<string, string> = {
  "claim.created": "bg-blue-100 text-blue-700",
  "claim.status_changed": "bg-amber-100 text-amber-700",
  "appeal.drafted": "bg-purple-100 text-purple-700",
  "appeal.approved": "bg-green-100 text-green-700",
  "appeal.sent": "bg-indigo-100 text-indigo-700",
};

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function StatCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-sm border border-ink-300/40 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${accent || "text-ink-950"}`}>
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
    </div>
  );
}

export default function DashboardOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="py-12 text-center text-ink-400">Loading dashboard...</div>
      </main>
    );
  }

  if (error || !stats) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="rounded bg-red-50 p-4 text-sm text-red-700">
          Failed to load dashboard: {error}
        </p>
      </main>
    );
  }

  const actionable =
    (stats.claims_by_status["pending_review"] || 0) +
    (stats.claims_by_status["needs_review"] || 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-ink-950">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">
          Overview of denial appeals across your organization.
        </p>
      </header>

      {/* Key metrics */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Claims" value={String(stats.claims_total)} />
        <StatCard
          label="Total Denied"
          value={centsToDisplay(stats.total_denied_cents)}
          accent="text-denial-600"
        />
        <StatCard
          label="Recovered"
          value={centsToDisplay(stats.total_recovered_cents)}
          subtitle={
            stats.win_rate !== null
              ? `${Math.round(stats.win_rate * 100)}% win rate`
              : "No decisions yet"
          }
          accent="text-green-700"
        />
        <StatCard
          label="Needs Attention"
          value={String(actionable)}
          subtitle={`${stats.appeals_pending_review} appeals pending review`}
          accent={actionable > 0 ? "text-amber-600" : "text-ink-950"}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Claims by status */}
        <div className="rounded-sm border border-ink-300/40 bg-white p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Claims by Status
          </h2>
          <div className="space-y-2">
            {Object.entries(stats.claims_by_status)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => {
                const pct = stats.claims_total > 0 ? (count / stats.claims_total) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{status.replace(/_/g, " ")}</span>
                      <span className="font-mono text-xs text-ink-500">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-ink-100">
                      <div
                        className="h-1.5 rounded-full bg-ink-800 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          <Link
            href="/dashboard/claims"
            className="mt-4 inline-block text-xs text-ink-500 hover:text-ink-700"
          >
            View all claims →
          </Link>
        </div>

        {/* Payer breakdown */}
        <div className="rounded-sm border border-ink-300/40 bg-white p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            By Payer
          </h2>
          <div className="space-y-3">
            {stats.by_payer
              .sort((a, b) => b.total_denied_cents - a.total_denied_cents)
              .map((p) => (
                <div key={p.payer} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-800">{p.payer}</p>
                    <p className="text-xs text-ink-400">{p.count} claims</p>
                  </div>
                  <span className="font-mono text-sm text-ink-600">
                    {centsToDisplay(p.total_denied_cents)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-sm border border-ink-300/40 bg-white p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Recent Activity
          </h2>
          <div className="space-y-2">
            {stats.recent_activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    ACTION_COLORS[a.action] || "bg-gray-100 text-gray-700"
                  }`}
                >
                  {ACTION_LABELS[a.action] || a.action}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-ink-600">
                    {a.resource_type}/{a.resource_id.slice(0, 8)}
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {a.created_at
                      ? new Date(a.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/audit"
            className="mt-4 inline-block text-xs text-ink-500 hover:text-ink-700"
          >
            View audit log →
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/dashboard/workbench"
          className="rounded-sm border border-ink-300/40 bg-white px-5 py-4 transition-colors hover:bg-parchment/50"
        >
          <h3 className="font-display text-sm font-semibold text-ink-950">
            Appeal Workbench
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Paste a denial letter and generate an appeal.
          </p>
        </Link>
        <Link
          href="/dashboard/review"
          className="rounded-sm border border-ink-300/40 bg-white px-5 py-4 transition-colors hover:bg-parchment/50"
        >
          <h3 className="font-display text-sm font-semibold text-ink-950">
            Review Queue
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            {stats.appeals_pending_review} appeals waiting for approval.
          </p>
        </Link>
        <Link
          href="/dashboard/claims/new"
          className="rounded-sm border border-ink-300/40 bg-white px-5 py-4 transition-colors hover:bg-parchment/50"
        >
          <h3 className="font-display text-sm font-semibold text-ink-950">
            New Claim
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Create one or more claims manually.
          </p>
        </Link>
        <Link
          href="/dashboard/reports"
          className="rounded-sm border border-ink-300/40 bg-white px-5 py-4 transition-colors hover:bg-parchment/50"
        >
          <h3 className="font-display text-sm font-semibold text-ink-950">
            Reports
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Summary reports with payer and denial analytics.
          </p>
        </Link>
      </div>
    </main>
  );
}
