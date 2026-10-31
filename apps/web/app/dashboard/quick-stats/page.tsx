"use client";

import { useEffect, useState } from "react";

interface QuickStats {
  total_claims: number;
  active_claims: number;
  won_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  recovery_rate: number;
  overdue_claims: number;
  pending_appeals: number;
}

export default function QuickStatsPage() {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/quick-stats")
      .then((r) => r.json())
      .then((d) => {
        setStats(d);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">At a Glance</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Quick Stats</h1>
        <p className="mt-1 text-sm text-ink-500">
          Key performance metrics across your entire denial management workflow.
        </p>
      </header>

      {loading || !stats ? (
        <p className="text-ink-400">Loading stats...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Total Claims</p>
            <p className="mt-1 text-3xl font-bold text-ink-900">{stats.total_claims}</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Active Claims</p>
            <p className="mt-1 text-3xl font-bold text-blue-700">{stats.active_claims}</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Won</p>
            <p className="mt-1 text-3xl font-bold text-green-700">{stats.won_claims}</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Overdue</p>
            <p className="mt-1 text-3xl font-bold text-red-700">{stats.overdue_claims}</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Total Denied</p>
            <p className="mt-1 text-3xl font-bold text-red-700">{fmt(stats.total_denied_cents)}</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Recovered</p>
            <p className="mt-1 text-3xl font-bold text-green-700">{fmt(stats.total_recovered_cents)}</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Recovery Rate</p>
            <p className="mt-1 text-3xl font-bold text-ink-900">{stats.recovery_rate}%</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Pending Appeals</p>
            <p className="mt-1 text-3xl font-bold text-amber-700">{stats.pending_appeals}</p>
          </div>
        </div>
      )}
    </div>
  );
}
