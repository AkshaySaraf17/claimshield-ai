"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SLATargets {
  initial_review: number;
  appeal_draft: number;
  appeal_approval: number;
  total_cycle: number;
}

interface SLASummary {
  total_claims: number;
  initial_review_compliance: number;
  cycle_compliance: number;
  avg_age_days: number;
}

interface SLAClaim {
  claim_id: string;
  claim_number: string | null;
  payer: string | null;
  status: string;
  age_days: number;
  initial_review_days: number;
  initial_review_met: boolean;
  cycle_met: boolean | null;
}

interface SLAData {
  targets: SLATargets;
  summary: SLASummary;
  claims: SLAClaim[];
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function ComplianceGauge({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
  const bg = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${color}`}>{pct}%</p>
      <div className="mt-2 h-2 w-full rounded-full bg-ink-100">
        <div className={`h-2 rounded-full ${bg}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SLAPage() {
  const [data, setData] = useState<SLAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "breached" | "met">("all");

  useEffect(() => {
    fetch("/api/v1/analytics/sla")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-ink-400">Loading SLA data...</p>
      </div>
    );
  }

  if (!data) return null;

  const filtered = data.claims.filter((c) => {
    if (filter === "breached") return !c.initial_review_met;
    if (filter === "met") return c.initial_review_met;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Operations
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          SLA Compliance
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Track service-level agreement targets for claim processing times.
        </p>
      </header>

      {/* SLA targets reference */}
      <div className="mb-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-500">SLA Targets</p>
        <div className="flex flex-wrap gap-4 text-xs text-ink-600">
          <span>Initial Review: <span className="font-semibold">{data.targets.initial_review}d</span></span>
          <span>Appeal Draft: <span className="font-semibold">{data.targets.appeal_draft}d</span></span>
          <span>Appeal Approval: <span className="font-semibold">{data.targets.appeal_approval}d</span></span>
          <span>Total Cycle: <span className="font-semibold">{data.targets.total_cycle}d</span></span>
        </div>
      </div>

      {/* Compliance gauges */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <ComplianceGauge pct={data.summary.initial_review_compliance} label="Initial Review SLA" />
        <ComplianceGauge pct={data.summary.cycle_compliance} label="Total Cycle SLA" />
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Avg Age</p>
          <p className="mt-1 text-3xl font-semibold text-ink-950">{data.summary.avg_age_days}d</p>
          <p className="mt-2 text-xs text-ink-400">{data.summary.total_claims} total claims</p>
        </div>
      </div>

      {/* Filter + Table */}
      <div className="mb-4 flex gap-2">
        {(["all", "breached", "met"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-2 py-1 text-xs ${
              filter === f ? "bg-ink-900 text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"
            }`}
          >
            {f === "all" ? "All" : f === "breached" ? "SLA Breached" : "SLA Met"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
              <th className="px-3 py-2 text-left">Claim</th>
              <th className="px-3 py-2 text-left">Payer</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Age</th>
              <th className="px-3 py-2 text-right">Review (d)</th>
              <th className="px-3 py-2 text-center">Review SLA</th>
              <th className="px-3 py-2 text-center">Cycle SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.claim_id} className="border-b border-ink-50 hover:bg-ink-50/50">
                <td className="px-3 py-2">
                  <Link
                    href={`/dashboard/claims/${c.claim_id}`}
                    className="font-mono text-xs text-indigo-600 hover:underline"
                  >
                    {c.claim_number || c.claim_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-ink-600">{c.payer || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.status] || "bg-ink-100 text-ink-600"}`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-ink-600">{c.age_days}d</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-ink-600">{c.initial_review_days}d</td>
                <td className="px-3 py-2 text-center">
                  {c.initial_review_met ? (
                    <span className="text-emerald-600 text-xs font-semibold">Met</span>
                  ) : (
                    <span className="text-red-600 text-xs font-semibold">Breached</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {c.cycle_met === null ? (
                    <span className="text-ink-400 text-xs">—</span>
                  ) : c.cycle_met ? (
                    <span className="text-emerald-600 text-xs font-semibold">Met</span>
                  ) : (
                    <span className="text-red-600 text-xs font-semibold">Breached</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
