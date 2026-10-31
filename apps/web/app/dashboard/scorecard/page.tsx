"use client";

import { useEffect, useState } from "react";

interface Scorecard {
  total_claims: number;
  won: number;
  lost: number;
  pending: number;
  win_rate: number | null;
  total_denied_cents: number;
  total_recovered_cents: number;
  total_lost_cents: number;
  recovery_rate: number | null;
  open_claims: number;
  avg_open_age_days: number;
  appeals_pending_review: number;
  appeals_approved: number;
  overdue_claims: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function KPICard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold ${color || "text-ink-950"}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-ink-500">{subtitle}</p>}
    </div>
  );
}

function GaugeBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-600">{label}</span>
        <span className="font-mono text-ink-500">{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-ink-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  const [data, setData] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/scorecard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-ink-400">Loading scorecard...</p>
      </div>
    );
  }

  const decided = data.won + data.lost;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">KPI Scorecard</h1>
        <p className="mt-1 text-sm text-ink-500">
          Key performance indicators for the denial appeal operation.
        </p>
      </header>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard label="Total Claims" value={String(data.total_claims)} />
        <KPICard
          label="Win Rate"
          value={data.win_rate !== null ? `${Math.round(data.win_rate * 100)}%` : "—"}
          subtitle={`${data.won}W / ${data.lost}L of ${decided} decided`}
          color={data.win_rate !== null && data.win_rate >= 0.5 ? "text-emerald-600" : "text-amber-600"}
        />
        <KPICard
          label="Recovery Rate"
          value={data.recovery_rate !== null ? `${Math.round(data.recovery_rate * 100)}%` : "—"}
          subtitle={`${dollars(data.total_recovered_cents)} of ${dollars(data.total_denied_cents)}`}
          color={data.recovery_rate !== null && data.recovery_rate >= 0.3 ? "text-emerald-600" : "text-red-600"}
        />
        <KPICard
          label="Avg Open Age"
          value={`${data.avg_open_age_days}d`}
          subtitle={`${data.open_claims} open claims`}
          color={data.avg_open_age_days > 14 ? "text-red-600" : "text-ink-950"}
        />
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPICard label="Total Denied" value={dollars(data.total_denied_cents)} color="text-red-600" />
        <KPICard label="Recovered" value={dollars(data.total_recovered_cents)} color="text-emerald-600" />
        <KPICard label="Lost (Unrec.)" value={dollars(data.total_lost_cents)} color="text-ink-500" />
      </div>

      {/* Operational gauges */}
      <div className="rounded-lg border border-ink-200 bg-white p-6 mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Operational Status</h2>
        <div className="grid grid-cols-2 gap-6">
          <GaugeBar label="Claims Won" value={data.won} max={decided || 1} color="bg-emerald-500" />
          <GaugeBar label="Claims Pending" value={data.pending} max={data.total_claims || 1} color="bg-amber-500" />
          <GaugeBar label="Appeals Pending Review" value={data.appeals_pending_review} max={data.appeals_pending_review + data.appeals_approved || 1} color="bg-orange-500" />
          <GaugeBar label="Overdue Claims" value={data.overdue_claims} max={data.open_claims || 1} color="bg-red-500" />
        </div>
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-lg border p-4 ${data.overdue_claims > 0 ? "border-red-200 bg-red-50" : "border-ink-200 bg-white"}`}>
          <p className="text-xs text-ink-500">Overdue Claims</p>
          <p className={`mt-1 text-2xl font-bold ${data.overdue_claims > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {data.overdue_claims}
          </p>
          <p className="text-[10px] text-ink-400">{data.overdue_claims === 0 ? "All on track" : "Need immediate attention"}</p>
        </div>
        <div className={`rounded-lg border p-4 ${data.appeals_pending_review > 0 ? "border-amber-200 bg-amber-50" : "border-ink-200 bg-white"}`}>
          <p className="text-xs text-ink-500">Appeals in Queue</p>
          <p className={`mt-1 text-2xl font-bold ${data.appeals_pending_review > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {data.appeals_pending_review}
          </p>
          <p className="text-[10px] text-ink-400">{data.appeals_pending_review === 0 ? "Queue clear" : "Awaiting review"}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Open Claims</p>
          <p className="mt-1 text-2xl font-bold text-ink-950">{data.open_claims}</p>
          <p className="text-[10px] text-ink-400">{data.pending} need action</p>
        </div>
      </div>
    </div>
  );
}
